/**
 * Guardr v3.0 - Banner Detector
 * Event-driven banner detection using MutationObserver
 */

import { BannerSelectors, CMPSignatures, CMPContainerPatterns, PaywallSignals, Signals, Events, Timing, State } from './constants.js';
import { isElementVisible, debounce, getElementText, log } from './utils.js';
import { getStateMachine } from './state-machine.js';

/**
 * Event-driven consent banner detector
 */
export class Detector extends EventTarget {
  constructor() {
    super();
    this._observer = null;
    this._detectedBanners = new WeakSet();
    this._knownFailedIds = new Set(); // id/class fingerprints of banners that already failed
    this._recentlyActed = new Map(); // fingerprint → timestamp, for loop-break guard
    this._isRunning = false;
    this._iframeObservers = [];
  }
  
  /**
   * Start detection
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    
    log.info('Detector started — scanning for consent banners');

    // Check for existing banners first
    this._scanExisting();
    
    // Setup MutationObserver for new banners
    this._setupObserver();
    
    // Watch for iframes
    this._watchIframes();

    // Late re-scans for CMPs that inject banners asynchronously.
    // Uses Timing.RESCAN_DELAYS from constants.js [1000, 2000, 4000, 7000, 15000].
    // The 15s entry catches Sourcepoint, Blazor SPAs, and lazy-hydrated pages.
    for (const delay of Timing.RESCAN_DELAYS) {
      setTimeout(() => {
        if (this._isRunning && this._detectedBanners) {
          log.debug(`Late scan at +${delay}ms`);
          this._scanExisting();
        }
      }, delay);
    }
  }
  
  /**
   * Stop detection and cleanup
   */
  stop() {
    if (!this._isRunning) return;
    this._isRunning = false;
    
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    
    this._iframeObservers.forEach(obs => obs.disconnect());
    this._iframeObservers = [];
    
    log.debug('Detector stopped');
  }
  
  /**
   * Scan for existing banners on page load
   * @private
   */
  _scanExisting() {
    // Do not re-evaluate banners while the navigator is already acting on one.
    // Mutations triggered by settings panel transitions would otherwise cause the
    // detector to reject the new panel (no deny button → hasDenySignal=false).
    const currentState = getStateMachine().state;
    if (currentState !== State.IDLE && currentState !== State.DETECTED) {
      log.debug(`Scan skipped — state is ${currentState}`);
      return;
    }
    log.debug('Scanning DOM for consent banners...');
    let selectorHits = 0;

    // Check DOM for existing banners
    for (const selector of BannerSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          selectorHits++;
          log.debug(`Selector match: "${selector}" → <${el.tagName.toLowerCase()} id="${el.id}" class="${String(el.className).slice(0, 50)}">`);
          if (this._isValidBanner(el)) {
            log.info(`Banner detected via selector: "${selector}"`);
            this._emitDetection(el);
            return; // Only emit once per scan
          }
        }
      } catch {
        // Invalid selector, skip
      }
    }

    if (selectorHits > 0) {
      log.debug(`Selector scan: ${selectorHits} match(es), none passed validation — trying broad scan`);
    } else {
      log.debug('Selector scan: no matches — trying broad scan');
    }

    // Direct dialog scan: role=dialog/alertdialog elements are always checked
    // regardless of CSS positioning — catches CMPs that use semantic dialog roles.
    const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
    for (const d of dialogs) {
      if (this._isValidBanner(d)) {
        log.info('Banner detected via role=dialog');
        this._emitDetection(d);
        return;
      }
    }

    // Broad scan fallback: fixed/sticky positioned elements likely to be consent overlays
    this._broadScan();

    // Check for CMP iframes
    this._scanIframes();
    this._scanShadowRoots(); // FIXED
  }

  /**
   * Broad scan: check fixed/sticky positioned elements for consent content.
   * Catches CMPs that use non-standard class/id naming.
   * @private
   */
  _broadScan() {
    log.debug('Running broad positional scan (fixed/sticky/high-z elements)...');
    let checked = 0;

    // Candidate tags for overlay banners
    const candidates = document.querySelectorAll(
      'div, section, aside, footer, header, nav, form, [role="dialog"], [role="alertdialog"], [role="banner"]'
    );

    for (const el of candidates) {
      if (this._detectedBanners.has(el)) continue;

      const style = window.getComputedStyle(el);
      const pos = style.position;
      const zIndex = parseInt(style.zIndex, 10) || 0;

      // Must be fixed/sticky AND have a meaningful z-index.
      // Require BOTH conditions to reduce false positives on nav bars etc.
      // Third path: full-viewport banners (e.g. Meta/Threads) that use
      // position:relative but cover the entire screen.
      const rect = el.getBoundingClientRect();
      const isFullViewport = rect.width >= window.innerWidth * 0.8
        && rect.height >= window.innerHeight * 0.5
        && rect.top === 0;
      const isOverlay = (
        (pos === 'fixed' || pos === 'sticky') && zIndex >= 10
      ) || zIndex >= 99999 || isFullViewport;
      if (!isOverlay) continue;

      // Must be a plausible banner size.
      // Too small → tooltip/widget. Too tall → full-screen panel or SPA shell, not a banner.
      if (rect.width < 280 || rect.height < 60 || rect.height > window.innerHeight * 0.8) continue;

      // Must contain at least one interactive element — a banner without any
      // button or link has no consent action to take.
      const hasInteractiveChildren = el.querySelectorAll(
        'button, a, input[type="checkbox"], [role="button"]'
      ).length > 0;
      if (!hasInteractiveChildren) continue;

      // On Google domains, require that consent keywords appear in direct child
      // text — not only in deep descendants (image captions, search result titles).
      // This is a structural check triggered by hostname, not a site blacklist.
      if (window.location.hostname.includes('google.')) {
        const directChildText = [...el.children]
          .flatMap(child => [...child.childNodes]
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.textContent))
          .join(' ')
          .toLowerCase();
        const consentSignals = ['cookie', 'consent', 'gdpr', 'personal data', 'your data'];
        if (!consentSignals.some(s => directChildText.includes(s))) continue;
      }

      // Broad scan requires STRICTER content validation than selector scan.
      // Must contain at least 2 distinct consent-related keywords to avoid
      // false-positiving on navigation bars or tooltips containing "privacy".
      if (!this._hasSufficientConsentContent(el)) {
        log.debug(`  ✗ broad scan: insufficient consent content: <${el.tagName.toLowerCase()} id="${el.id}">`);
        continue;
      }

      checked++;
      log.debug(`Broad candidate: <${el.tagName.toLowerCase()} id="${el.id}" class="${String(el.className).slice(0, 60)}" pos=${pos} z=${zIndex}>`);

      if (this._isValidBanner(el)) {
        log.info(`Banner detected via broad scan: <${el.tagName.toLowerCase()} id="${el.id}" class="${String(el.className).slice(0, 60)}">`);
        this._emitDetection(el);
        return;
      }
    }

    log.debug(`Broad scan complete: ${checked} overlay-style element(s) checked, none passed validation`);
  }

  /**
   * Check if an element has enough distinct consent-related keywords to
   * confidently identify it as a consent banner (not a nav/tooltip/search result).
   * Requires at least 2 of the primary consent signals.
   * @param {Element} el
   * @returns {boolean}
   * @private
   */
  _hasSufficientConsentContent(el) {
    const text = (el.innerText || el.textContent || '').toLowerCase();

    const primarySignals = [
      'cookie', 'consent', 'gdpr', 'personal data', 'your data',
      'datenschutz', 'données personnelles', 'privacidad'
    ];
    // 'privacy' alone is too common (footers, nav links) — only count alongside others
    const matchedPrimary = primarySignals.filter(s => text.includes(s));
    const hits = matchedPrimary.length;
    // Also require a deny/reject-flavoured word to confirm it's an actionable banner.
    // Uses the canonical Signals.DENY list from constants.js — single source of truth.
    const hasDenySignal = Signals.DENY.some(signal => text.includes(signal));
    // Option C: banner contains a manage/preference/settings entry point
    const managePattern = /manage|preference|setting|customis|option/i;
    const hasManageSignal = !![...el.querySelectorAll('button,a,[role="button"]')].some(btn => managePattern.test(btn.textContent));
    // Structural complexity gate: a cookie banner is a self-contained compact unit.
    // Elements with many descendants are page sections, not banners.
    // Exception: very strong signals (3+ keywords + deny text) in a moderately
    // complex element (e.g. a multi-section consent centre < 200 nodes).
    const childCount = el.querySelectorAll('*').length;
    if (childCount > 50 && !(hits >= 3 && hasDenySignal && childCount < 200)) {
      log.debug(`  [consent-check] rejected — too complex: childCount=${childCount}, hits=${hits}, deny=${hasDenySignal}`);
      return false;
    }

    // Pass if any one of A/B/C/D holds:
    //   A — strong: consent keyword + deny/reject text
    //   B — dense:  two or more consent keywords
    //   C — manage: consent keyword + manage/settings button
    //   D — accept-only: consent keyword + ≤2 buttons + ok/got-it style label
    //       (allows Guardr to attempt all denial strategies before accepting)
    const hasSingleAction = el.querySelectorAll('button, [role="button"], a').length <= 2;
    const acceptOnlySignal = /\b(ok|okay|got it|i understand)\b/i;
    const passes = (hits >= 1 && hasDenySignal) || hits >= 2 || (hits >= 1 && hasManageSignal) ||
                   (hits >= 1 && hasSingleAction && acceptOnlySignal.test(el.innerText));
    log.debug(`  [consent-check] <${el.tagName.toLowerCase()} id="${el.id}"> hits=${hits} [${matchedPrimary.join(',')}] deny=${hasDenySignal} manage=${hasManageSignal} childCount=${childCount} passes=${passes}`);
    log.debug('[consent-check-detail]',
      el.tagName, el.id,
      'hits:', hits,
      'deny:', hasDenySignal,
      'manage:', hasManageSignal,
      'children:', childCount,
      'passes:', passes
    );
    return passes;
  }
  
  /**
   * Setup MutationObserver
   * @private
   */
  /**
   * Scan shadow DOM roots for banners (FIXED)
   * @private
   */
  _scanShadowRoots() {
    const walkShadow = (root) => {
      if (root.shadowRoot) {
        for (const sel of BannerSelectors) {
          try {
            const elements = root.shadowRoot.querySelectorAll(sel);
            for (const el of elements) {
              if (this._isValidBanner(el)) {
                log.info(`Banner in shadow DOM: "${sel}"`);
                this._emitDetection(el);
                return;
              }
            }
          } catch (_) {}
        }
        root.shadowRoot.querySelectorAll("*").forEach(walkShadow);
      }
    };
    document.querySelectorAll("*").forEach(walkShadow);
  }

  _setupObserver() {
    const debouncedCheck = debounce(() => {
      this._scanExisting();
    }, Timing.MUTATION_DEBOUNCE);
    
    this._observer = new MutationObserver((mutations) => {
      // Quick check: any new nodes added?
      let hasNewNodes = false;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check added nodes directly for banner matches
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const banner = this._checkNodeForBanner(node);
              if (banner) {
                this._emitDetection(banner);
                return;
              }
              hasNewNodes = true;
            }
          }
        }
        
        if (mutation.type === 'attributes') {
          // Visibility might have changed — no rescan needed (see comment below)
        }
      }
      
      // Only rescan when new nodes appear — attribute/visibility changes on existing
      // elements do NOT warrant a full scan and would create an infinite loop after
      // a failed action (Steam and other sites mutate styles continuously).
      if (hasNewNodes) {
        debouncedCheck();
      }
    });
    
    this._observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden']
    });
  }
  
  /**
   * Check a specific node (and children) for banner matches
   * @param {Node} node
   * @returns {Element|null}
   * @private
   */
  _checkNodeForBanner(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
    
    // Check the node itself
    if (this._matchesBannerSelector(node) && this._isValidBanner(node)) {
      return node;
    }
    
    // Check children
    for (const selector of BannerSelectors) {
      try {
        const match = node.querySelector?.(selector);
        if (match && this._isValidBanner(match)) {
          return match;
        }
      } catch {
        // Invalid selector
      }
    }
    
    return null;
  }
  
  /**
   * Check if element matches any banner selector
   * @param {Element} el
   * @returns {boolean}
   * @private
   */
  _matchesBannerSelector(el) {
    for (const selector of BannerSelectors) {
      try {
        if (el.matches(selector)) return true;
      } catch {
        // Invalid selector
      }
    }
    return false;
  }
  
  /**
   * Validate that element is actually a consent banner
   * @param {Element} el
   * @returns {boolean}
   * @private
   */
  _isValidBanner(el) {
    // Already processed?
    if (this._detectedBanners.has(el)) return false;

    // Same id or className as a previously-failed banner — skip even if re-injected.
    const elId = el.id;
    const elClass = typeof el.className === 'string' ? el.className.trim() : '';
    if (elId && this._knownFailedIds.has(`id:${elId}`)) {
      log.debug(`  ✗ known-failed banner: #${elId}`);
      return false;
    }
    if (elClass && this._knownFailedIds.has(`class:${elClass}`)) {
      log.debug(`  ✗ known-failed banner class: .${elClass.slice(0, 60)}`);
      return false;
    }

    // Navigation/header guard — account dropdowns, nav menus, etc. are never consent banners
    if (el.closest('nav, header')) {
      log.debug(`  ✗ inside nav/header: <${el.tagName.toLowerCase()} id="${el.id}">`);
      return false;
    }

    // Menu/popup widget guard — reject elements that are part of a navigation dropdown
    const isInsideMenuWidget = !!el.closest('[aria-haspopup], [role="menu"], [role="menuitem"]');
    const isInsideOpenDropdown = !!el.closest('[aria-expanded="true"]');
    const containsMenuRole = !!(el.querySelector('[role="menu"], [role="menuitem"]'));
    if (isInsideMenuWidget || isInsideOpenDropdown || containsMenuRole) {
      log.debug(`  ✗ navigation dropdown/menu widget: <${el.tagName.toLowerCase()} id="${el.id}">`);
      return false;
    }

    // Not visible?
    if (!isElementVisible(el)) {
      log.debug(`  ✗ not visible: <${el.tagName.toLowerCase()} id="${el.id}">`);
      return false;
    }
    
    // Must have reasonable size
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 30) {
      log.debug(`  ✗ too small (${Math.round(rect.width)}×${Math.round(rect.height)}): <${el.tagName.toLowerCase()} id="${el.id}">`);
      return false;
    }

    // Known CMP iframe container — skip text check (UI is in a cross-origin iframe)
    if (this._isKnownCMPContainer(el)) {
      log.debug(`  ✓ known CMP container (skipping text check): <${el.tagName.toLowerCase()} id="${el.id}">`);
      return true;
    }
    
    // Content analysis - must contain consent-related text
    const text = (el.textContent || '').toLowerCase();
    const hasConsentText =
      text.includes('cookie') ||
      text.includes('consent') ||
      text.includes('privacy') ||
      text.includes('gdpr') ||
      text.includes('tracking') ||
      text.includes('preferences') ||
      text.includes('personal data') ||
      text.includes('your data') ||
      text.includes('datenschutz') ||
      text.includes('données personnelles') ||
      text.includes('privacidad');
    
    if (!hasConsentText) {
      log.debug(`  ✗ no consent text: <${el.tagName.toLowerCase()} id="${el.id}" class="${String(el.className).slice(0, 40)}">`);
      return false;
    }
    
    // Must have interactive elements (buttons/toggles)
    const hasButtons = el.querySelector('button, a, input, [role="button"], [role="switch"]');
    if (!hasButtons) {
      log.debug(`  ✗ no interactive elements: <${el.tagName.toLowerCase()} id="${el.id}">`);
      return false;
    }
    
    log.debug(`  ✓ valid banner: <${el.tagName.toLowerCase()} id="${el.id}" class="${String(el.className).slice(0, 60)}" size=${Math.round(rect.width)}×${Math.round(rect.height)}>`);
    return true;
  }

  /**
   * Check if element is a known CMP iframe container (no inner text expected)
   * @param {Element} el
   * @returns {boolean}
   * @private
   */
  _isKnownCMPContainer(el) {
    const id = el.id || '';
    const cls = (typeof el.className === 'string' ? el.className : '') || '';
    // Check against known regex patterns
    for (const pattern of CMPContainerPatterns) {
      if (pattern.test(id) || pattern.test(cls)) return true;
    }

    // Check if element contains a known CMP iframe
    const hasCMPIframe = el.querySelector(
      'iframe[src*="sourcepoint"], iframe[src*="trustarc"], ' +
      'iframe[src*="consent"], iframe[src*="cmp"], ' +
      'iframe[id*="sp_message"], iframe[name*="sp_message"], ' +
      'iframe[title*="consent" i], iframe[title*="privacy" i], iframe[title*="cookie" i]'
    );
    if (hasCMPIframe) return true;

    // Check for CMP global variables that indicate an active CMP
    const hasCMPGlobal = !!(window._sp_ || window.Sourcepoint);
    if (hasCMPGlobal && (id.startsWith('sp_') || cls.includes('sp_'))) return true;

    return false;
  }
  
  /**
   * Watch for new iframes
   * @private
   */
  _watchIframes() {
    // Scan existing iframes
    this._scanIframes();
    this._scanShadowRoots(); // FIXED
    
    // Watch for new iframes
    const iframeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.tagName === 'IFRAME') {
            this._checkIframe(node);
          }
        }
      }
    });
    
    iframeObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    
    this._iframeObservers.push(iframeObserver);
  }
  
  /**
   * Scan all iframes for consent content
   * @private
   */
  _scanIframes() {
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      this._checkIframe(iframe);
    }
  }
  
  /**
   * Check iframe for consent content
   * @param {HTMLIFrameElement} iframe
   * @private
   */
  _checkIframe(iframe) {
    const src = (iframe.src || '').toLowerCase();
    const name = (iframe.name || '').toLowerCase();
    const id = (iframe.id || '').toLowerCase();
    
    const isCMPIframe = 
      src.includes('consent') ||
      src.includes('cookie') ||
      src.includes('privacy') ||
      src.includes('onetrust') ||
      src.includes('cookiebot') ||
      src.includes('sourcepoint') ||
      src.includes('trustarc') ||
      src.includes('quantcast') ||
      name.includes('consent') ||
      id.includes('consent');
    
    if (isCMPIframe && isElementVisible(iframe)) {
      // Try to find a parent container that wraps the iframe
      let container = iframe.parentElement;
      while (container && container !== document.body) {
        if (this._isValidBanner(container)) {
          this._emitDetection(container);
          return;
        }
        container = container.parentElement;
      }
      
      // If no container, emit the iframe itself
      if (!this._detectedBanners.has(iframe)) {
        this._detectedBanners.add(iframe);
        this._emitDetection(iframe, { isIframe: true });
      }
    }
  }
  
  /**
   * Emit banner detection event
   * @param {Element} banner
   * @param {object} meta
   * @private
   */
  /**
   * Mark a banner element as permanently failed for this page load.
   * Prevents re-detection even if the site re-injects the same element id/class.
   * Cleared by rescan() on navigation.
   * @param {Element} el
   */
  markFailed(el) {
    if (!el) return;
    if (el.id) this._knownFailedIds.add(`id:${el.id}`);
    const cls = typeof el.className === 'string' ? el.className.trim() : '';
    if (cls) this._knownFailedIds.add(`class:${cls}`);
    log.debug(`Detector: marked as known-failed — #${el.id || '?'} .${cls.slice(0, 40)}`);
  }

  /**
   * Build a stable string fingerprint for an element (tag + id + first 3 classes)
   * @param {Element} el
   * @returns {string}
   * @private
   */
  _getElementFingerprint(el) {
    const tag = el.tagName?.toLowerCase() || 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
      : '';
    return `${tag}${id}${cls}` || tag;
  }

  _emitDetection(banner, meta = {}) {
    if (this._detectedBanners.has(banner)) return;

    // Loop-break guard: skip if the same element fingerprint was emitted within 3 seconds
    const fp = this._getElementFingerprint(banner);
    const lastActed = this._recentlyActed.get(fp);
    if (lastActed && Date.now() - lastActed < 3000) {
      log.warn(`[Guardr] Loop guard triggered on: ${fp}`);
      return;
    }
    this._recentlyActed.set(fp, Date.now());

    this._detectedBanners.add(banner);
    
    const cmp = this._detectCMP(banner);
    const isPaywall = this._detectPaywall(banner);
    
    const detail = {
      banner,
      cmp,
      isPaywall,
      timestamp: Date.now(),
      ...meta
    };
    
    log.info(`Banner detected: ${cmp || 'Generic'}`, isPaywall ? '(Paywall)' : '');
    
    this.dispatchEvent(new CustomEvent(Events.BANNER_DETECTED, { detail }));
  }
  
  /**
   * Detect which CMP is being used
   * @param {Element} banner
   * @returns {string|null}
   * @private
   */
  _detectCMP(banner) {
    // Check DOM signatures
    for (const [, config] of Object.entries(CMPSignatures)) {
      for (const selector of config.selectors) {
        try {
          if (banner.matches(selector) || banner.querySelector(selector) || document.querySelector(selector)) {
            return config.name;
          }
        } catch {
          // Invalid selector
        }
      }
    }
    
    // Check global variables
    for (const [, config] of Object.entries(CMPSignatures)) {
      for (const global of config.globals) {
        if (typeof window[global] !== 'undefined') {
          return config.name;
        }
      }
    }
    
    return null;
  }
  
  /**
   * Detect if this is a paywall/consent-or-pay scenario
   * @param {Element} banner
   * @returns {boolean}
   * @private
   */
  _detectPaywall(banner) {
    const text = (banner.textContent || '').toLowerCase();
    
    // Check for paywall signals
    let paywallScore = 0;
    for (const signal of PaywallSignals) {
      if (text.includes(signal)) {
        paywallScore++;
      }
    }
    
    // Check for price mentions
    if (/\d+[.,]\d{2}\s*[€$£]|[€$£]\s*\d+[.,]\d{2}/.test(text)) {
      paywallScore += 2;
    }
    if (/\d+\s*(per|\/)\s*(month|year|mo|yr)/i.test(text)) {
      paywallScore += 2;
    }
    
    // Strong paywall indicator: only accept buttons, no reject
    const buttons = banner.querySelectorAll('button, a[role="button"], [role="button"]');
    let hasAccept = false;
    let hasReject = false;
    
    for (const btn of buttons) {
      const btnText = getElementText(btn);
      if (/accept|agree|allow|consent|subscribe/i.test(btnText)) hasAccept = true;
      if (/reject|deny|decline|refuse/i.test(btnText)) hasReject = true;
    }
    
    if (hasAccept && !hasReject && paywallScore > 0) {
      paywallScore += 3;
    }
    
    return paywallScore >= 3;
  }
  
  /**
   * Force a re-scan (useful after navigation)
   */
  rescan() {
    log.info('Rescanning for consent banners...');
    this._detectedBanners = new WeakSet();
    this._knownFailedIds  = new Set();
    this._recentlyActed.clear();
    this._scanExisting();
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create detector instance
 * @returns {Detector}
 */
export function getDetector() {
  if (!instance) {
    instance = new Detector();
  }
  return instance;
}
