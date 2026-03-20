/**
 * Guardr v3.0 - Main Orchestrator
 * Entry point that wires all modules together
 */

import { State, Events, MessageType, Timing } from './constants.js';
import { getStateMachine, getResultBuilder } from './state-machine.js';
import { getDetector } from './detector.js';
import { getAnalyzer } from './analyzer.js';
import { getActor } from './actor.js';
import { getLearning } from './learning.js';
import { isContextValid, safeSendMessage, log, initLogging, setDebugMode, getInteractiveElements } from './utils.js';

/**
 * Main orchestrator - coordinates all modules
 */
class Orchestrator {
  constructor() {
    this._machine = getStateMachine();
    this._detector = getDetector();
    this._analyzer = getAnalyzer();
    this._actor = getActor();
    this._learning = getLearning();
    this._result = null; // initialised fresh at the start of each _handleBannerDetected cycle
    this._initialized = false;
    this._autoMode = true;       // default ON; refreshed from storage at init
    this._manualRunActive = false; // true while runAndGetResult is pending
    this._teachMode = false;     // true during a TEACH_MODE run — records correction on success
    this._processAttempts = 0;   // incremented on each FAILED result; capped at 3 per page
    this._navVisited = new WeakSet(); // persists across navigator restarts; reset only on state machine reset
  }
  
  /**
   * Initialize and start the orchestrator
   */
  async init() {
    if (this._initialized) return;
    this._initialized = true;
    
    log.info('Guardr v3.0 initializing...');

    // Boot logging first so debug output is available ASAP
    await initLogging();
    
    // Initialize learning engine (loads patterns)
    await this._learning.init();
    
    // Load autoMode setting (default: true)
    try {
      const stored = await chrome.storage.local.get(['autoMode', 'guardr_settings']);
      // autoMode stored directly or inside guardr_settings
      if (typeof stored.autoMode === 'boolean') {
        this._autoMode = stored.autoMode;
      } else if (stored.guardr_settings?.autoMode !== undefined) {
        this._autoMode = stored.guardr_settings.autoMode;
      }
    } catch (_) { /* ok – default stays true */ }

    // Watch for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.autoMode) this._autoMode = changes.autoMode.newValue;
      if (changes.guardr_settings?.newValue?.autoMode !== undefined) {
        this._autoMode = changes.guardr_settings.newValue.autoMode;
      }
    });

    // Patch history.pushState / replaceState to fire a synthetic navigation event.
    // Must happen before the detector starts so no SPA navigation is missed.
    // Most modern SPAs (React Router, Next.js, Vue Router) navigate this way
    // rather than via popstate, which only fires on back/forward button presses.
    if (!window.__guardrNavPatched) {
      window.__guardrNavPatched = true;
      const _dispatchNav = () => window.dispatchEvent(new Event('guardr:navchange'));
      const _origPush    = history.pushState.bind(history);
      const _origReplace = history.replaceState.bind(history);
      history.pushState    = (...args) => { _origPush(...args);    _dispatchNav(); };
      history.replaceState = (...args) => { _origReplace(...args); _dispatchNav(); };
    }

    // Setup event listeners
    this._setupEventListeners();

    // Start detection
    this._detector.start();
    
    // Listen for state changes
    this._machine.addEventListener(Events.STATE_CHANGE, (e) => {
      this._onStateChange(e.detail);
    });
    
    log.info('Guardr v3.0 ready');
  }
  
  /**
   * Setup event listeners for detection events
   * @private
   */
  _setupEventListeners() {
    // Banner detected
    this._detector.addEventListener(Events.BANNER_DETECTED, async (e) => {
      await this._handleBannerDetected(e.detail);
    });
    
    // Handle SPA navigation — all three sources share one debounced handler.
    // pushState/replaceState dispatch 'guardr:navchange' (patched above).
    // Back/forward presses fire popstate. Hash-only routers fire hashchange.
    // Debounce at 300ms: some frameworks call pushState multiple times per
    // logical navigation (e.g. React Router v6 double-push on strict mode).
    let _navTimer = null;
    const _debouncedNav = () => {
      clearTimeout(_navTimer);
      _navTimer = setTimeout(() => this._onNavigation(), 300);
    };
    window.addEventListener('popstate',         _debouncedNav);
    window.addEventListener('guardr:navchange', _debouncedNav);
    window.addEventListener('hashchange',       _debouncedNav);
    
    // Handle visibility changes (tab switches)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this._machine.isIdle) {
        this._detector.rescan();
      }
    });
  }
  
  /**
   * Handle banner detection event
   * @private
   */
  async _handleBannerDetected(detail) {
    const { banner, cmp, isPaywall } = detail;

    log.info(`Banner detected — CMP: ${cmp || 'unknown'}, paywall: ${isPaywall}, element: <${banner.tagName?.toLowerCase()} id="${banner.id || ''}">`);

    // Hard cap: after 3 failed attempts on this page, give up until navigation.
    // Prevents infinite re-detection loops when a CMP keeps re-injecting its banner.
    if (!this._manualRunActive && this._processAttempts >= 3) {
      log.warn(`[Guardr] Max processing attempts (3) reached — ignoring banner until navigation`);
      return;
    }

    // If auto-deny is off and this is NOT a manual popup trigger, skip
    if (!this._autoMode && !this._manualRunActive) {
      log.info('Auto-deny is OFF — skipping autonomous processing');
      return;
    }

    // Prevent duplicate processing
    if (!this._machine.acquireLock()) {
      log.info('Already processing a banner — ignoring duplicate detection');
      return;
    }
    
    let _processingSucceeded = false;

    try {
      // Check context is valid
      if (!isContextValid()) {
        log.debug('Extension context invalid, skipping');
        return;
      }
      
      // Fresh result builder for this banner cycle — actor writes to the same instance
      this._result = getResultBuilder();
      
      // Transition to DETECTED state
      this._machine.transition(State.DETECTED, { banner, cmp, isPaywall });
      
      // Handle paywall scenario
      if (isPaywall) {
        log.info('Paywall detected, not auto-denying');
        this._result.setConsentOrPay();
        this._result.addError('Paywall', 'Site requires acceptance or subscription');
        this._machine.transition(State.FAILED, { reason: 'paywall' });
        await this._reportResult();
        return;
      }
      
      // Check for cached pattern first
      const context = this._buildContext(banner, cmp);
      const cachedPattern = await this._learning.findPattern(context);
      
      if (cachedPattern && cachedPattern.confidence >= 70) {
        log.info('Using cached pattern:', cachedPattern.strategy);
        this._result.recordPattern(cachedPattern.id);
        
        // Skip analysis, go directly to action
        this._machine.transition(State.ACTING, { 
          pattern: cachedPattern,
          strategy: cachedPattern.strategy 
        });
        
        const success = await this._replayPattern(cachedPattern, banner);
        
        if (success) {
          this._machine.transition(State.COMPLETE);
          await this._learning.recordSuccess(context, cachedPattern.strategy, cachedPattern.actions);
        } else {
          // Pattern failed — reset state to allow fresh analysis.
          // State is currently ACTING; transition ACTING→ANALYZING is now valid.
          log.warn('Cached pattern failed, analyzing fresh');
          await this._learning.recordFailure(context);
          // Reset: ACTING → FAILED → IDLE → DETECTED so _analyzeAndAct can run normally
          this._machine.transition(State.FAILED, { reason: 'pattern-retry' });
          this._machine.transition(State.IDLE);
          this._machine.transition(State.DETECTED, { banner, cmp });
        }
      }
      
      // If not complete, do fresh analysis.
      // Small delay gives dynamically-rendered banners (Steam etc.) time to fully
      // paint their buttons before we score interactive elements.
      if (this._machine.state !== State.COMPLETE) {
        await new Promise(r => setTimeout(r, 300));
        await this._analyzeAndAct(banner, cmp, context);
      }

      _processingSucceeded = (this._machine.state === State.COMPLETE);

      // Report result
      await this._reportResult();

    } catch (err) {
      log.error('Error handling banner:', err.message);
      this._result.addError('Processing', err.message);
      this._machine.transition(State.FAILED, { error: err.message });
      await this._reportResult();

    } finally {
      if (_processingSucceeded) {
        this._processAttempts = 0;
      } else {
        this._processAttempts++;
        // Only blacklist the banner's id/class after 2 failures, not after the first.
        // The first failure is often a timing issue (banner not fully rendered).
        // Amazon and similar lazy-loading banners need a second chance.
        if (this._processAttempts >= 2) {
          this._detector.markFailed(banner);
        }
        if (this._processAttempts >= 3) {
          log.warn('[Guardr] Max attempts reached — scanner paused for this page');
        }
      }
      this._machine.releaseLock();
    }
  }
  
  /**
   * Perform fresh analysis and execute actions
   * @private
   */
  async _analyzeAndAct(banner, cmp, context) {
    // Transition to ANALYZING
    this._machine.transition(State.ANALYZING);
    
    // Analyze banner
    const plan = this._analyzer.analyze(banner);
    plan.cmp = cmp;

    // Flag iframe-based CMPs: container has no directly actionable buttons
    plan.isIframeCMP = !banner.querySelector('button, a[href], [role="button"]');
    if (plan.isIframeCMP) {
      log.info('Banner has no direct DOM buttons — iframe-based CMP detected, overriding strategy to cmp-api');
      // Force cmp-api strategy so the normal execution path is used
      // (avoids the spurious 'unknown' fallback loop that wastes 16s+)
      plan.strategy = 'cmp-api';
      plan.confidence = 80;
    }

    log.info(`Analysis complete — strategy: "${plan?.strategy || 'none'}", confidence: ${plan?.confidence || 0}, deny buttons: ${plan?.denyButtons?.length || 0}, toggles: ${plan?.toggles?.length || 0}`);
    
    if (!plan) {
      log.warn('Analyzer returned no plan');
      this._result.addError('Analysis', 'Analyzer returned no plan');
      this._machine.transition(State.FAILED, { reason: 'no-plan' });
      return;
    }

    if (plan.strategy === 'unknown') {
      log.warn('No confident strategy found — trying fallbacks');
      // Transition to ACTING (valid from ANALYZING)
      this._machine.transition(State.ACTING, { strategy: 'fallback', confidence: 0 });
      const fallbackSuccess = await this._tryFallbacks(plan);
      if (fallbackSuccess) {
        this._machine.transition(State.COMPLETE);
        const actions = this._result.build().actionsPerformed;
        if (this._teachMode) {
          this._teachMode = false;
          await this._learning.recordCorrection(context, 'fallback', actions);
        } else {
          await this._learning.recordSuccess(context, 'fallback', actions);
        }
      } else {
        this._result.addError('Analysis', 'Could not determine action strategy');
        this._machine.transition(State.FAILED, { reason: 'no-strategy' });
        await this._learning.recordFailure(context);
      }
      return;
    }
    
    // Transition to ACTING
    this._machine.transition(State.ACTING, { 
      strategy: plan.strategy,
      confidence: plan.confidence 
    });
    
    // Execute plan
    const execResult = await this._actor.execute(plan, this._navVisited, false, this._result);
    log.info(`Execution result — success: ${execResult.success}, strategy: ${plan.strategy}, time: ${Math.round(execResult.executionTime || 0)}ms`);
    
    if (execResult.success) {
      this._machine.transition(State.COMPLETE);
      
      // Record successful pattern
      const actions = this._result.build().actionsPerformed;
      if (this._teachMode) {
        this._teachMode = false;
        await this._learning.recordCorrection(context, plan.strategy, actions);
      } else {
        await this._learning.recordSuccess(context, plan.strategy, actions);
      }
      
    } else {
      // Try fallback strategies if primary failed
      const fallbackSuccess = await this._tryFallbacks(plan);
      
      if (fallbackSuccess) {
        this._machine.transition(State.COMPLETE);
        const actions = this._result.build().actionsPerformed;
        if (this._teachMode) {
          this._teachMode = false;
          await this._learning.recordCorrection(context, 'fallback', actions);
        } else {
          await this._learning.recordSuccess(context, 'fallback', actions);
        }
      } else {
        this._machine.transition(State.FAILED, { reason: 'execution-failed' });
        await this._learning.recordFailure(context);
      }
    }
  }
  
  /**
   * Replay a cached pattern
   * @private
   */
  async _replayPattern(pattern, banner) {
    // Re-analyze to get fresh element references
    const plan = this._analyzer.analyze(banner);
    plan.cmp = pattern.cmp;

    // Guard: if the cached strategy is direct-deny but fresh analysis finds no deny
    // buttons, the pattern is stale (CMP layout changed). Return false immediately so
    // the caller falls through to a full fresh analysis instead of executing a strategy
    // that has nothing to click.
    if (pattern.strategy === 'direct-deny' && !(plan.denyButtons?.length > 0)) {
      log.warn('Cached direct-deny pattern invalidated — no deny buttons found on fresh analysis');
      return false;
    }

    // Settings-first override: if the cached strategy is direct-deny but fresh analysis
    // reveals a settings path, prefer open-settings so the navigator can turn off
    // vendor/LI toggles before denial. Invalidate the stale pattern so it re-learns.
    if (pattern.strategy === 'direct-deny' && plan.settingsButtons?.length > 0) {
      log.info('Cached direct-deny overridden — settings path detected');
      await this._learning.deletePattern(pattern.id);
      plan.strategy = 'open-settings';
      return (await this._actor.execute(plan, this._navVisited, false, this._result)).success;
    }

    // Override strategy with cached one
    const originalStrategy = plan.strategy;
    plan.strategy = pattern.strategy;
    
    // Execute — skipNavigator=true: navigator must not run inside pattern replay
    const result = await this._actor.execute(plan, this._navVisited, true, this._result);

    if (!result.success) {
      // Try original strategy
      plan.strategy = originalStrategy;
      return (await this._actor.execute(plan, this._navVisited, true, this._result)).success;
    }
    
    return result.success;
  }
  
  /**
   * Try fallback strategies
   * @private
   */
  async _tryFallbacks(plan) {
    const strategies = ['direct-deny', 'toggle-and-save', 'open-settings', 'close-only'];
    
    for (const strategy of strategies) {
      if (strategy === plan.strategy) continue; // Already tried
      
      plan.strategy = strategy;
      log.debug('Trying fallback strategy:', strategy);
      
      // skipNavigator=true: navigator must not run inside fallback loops
      const result = await this._actor.execute(plan, this._navVisited, true, this._result);
      if (result.success) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Build context object for pattern matching
   * @private
   */
  _buildContext(banner, cmp) {
    return {
      banner,
      cmp,
      buttonCount: banner.querySelectorAll('button, a, [role="button"]').length,
      toggleCount: banner.querySelectorAll('input[type="checkbox"], [role="switch"]').length
    };
  }
  
  /**
   * Report result to background script
   * @private
   */
  async _reportResult() {
    if (!isContextValid()) return;
    
    const result = this._result.build();
    const machineResult = this._machine.getResult();
    
    const payload = {
      ...result,
      ...machineResult,
      url: window.location.href,
      title: document.title
    };
    
    log.info('Result summary:', {
      success:     machineResult.success,
      bannerFound: result.bannerFound,
      bannerClosed:result.bannerClosed,
      denied:      result.unchecked.length,
      mandatory:   result.mandatory.length,
      errors:      result.errors.length,
      strategy:    machineResult.strategy || machineResult.cmpMethod || '—',
      runtime:     `${machineResult.runtime || 0}ms`
    });
    
    await safeSendMessage({
      type: MessageType.SCAN_COMPLETE,
      data: payload
    });
    
    // Reset for next detection
    this._machine.reset();
    this._result = getResultBuilder();
    this._navVisited = new WeakSet();
  }

  /**
   * Handle SPA navigation (popstate / pushState / replaceState / hashchange).
   * @private
   */
  async _onNavigation() {
    log.debug('Navigation detected — resetting for new page');
    this._processAttempts = 0;
    // Reset state machine to IDLE so the new page is treated as a fresh context
    this._machine.reset();
    this._result = getResultBuilder();
    this._navVisited = new WeakSet();
    this._analyzer.clearCache();
    // Clear loop-break guard so banners on the new page are not blocked
    this._detector._recentlyActed.clear();
    // Wait for the SPA to finish rendering the new route before scanning
    await new Promise(r => setTimeout(r, 500));
    this._detector.rescan();
  }
  
  /**
   * Handle state changes
   * @private
   */
  _onStateChange(detail) {
    const { previousState, currentState, elapsed } = detail;
    log.debug(`State: ${previousState} → ${currentState} (${elapsed}ms)`);
  }
  
  /**
   * Force a manual scan (for popup trigger)
   */
  async forceScan() {
    log.info('Manual scan triggered');
    this._detector.rescan();
  }

  /**
   * Run a full scan cycle and return the result once complete.
   * Used by the popup via RUN_CLEAN message.
   * @param {number} timeoutMs
   * @returns {Promise<object>}
   */
  async runAndGetResult(timeoutMs = 12000) {
    return new Promise((resolve) => {
      let resolved = false;
      this._manualRunActive = true;

      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        this._manualRunActive = false;
        resolve(result);
      };

      // Capture result SYNCHRONOUSLY inside the handler.
      // transition() calls dispatchEvent() synchronously, so this fires
      // before _reportResult() can reset this._result.
      const handler = (e) => {
        const state = e.detail?.currentState;
        if (state === State.COMPLETE || state === State.FAILED) {
          this._machine.removeEventListener(Events.STATE_CHANGE, handler);
          // Snapshot now — _reportResult hasn't run yet
          const result = this._result.build();
          const machineResult = this._machine.getResult();
          finish({ ...result, ...machineResult, url: window.location.href });
        }
      };

      this._machine.addEventListener(Events.STATE_CHANGE, handler);

      // Hard timeout — return whatever we have
      setTimeout(() => {
        this._machine.removeEventListener(Events.STATE_CHANGE, handler);
        const result = this._result.build();
        const machineResult = this._machine.getResult();
        finish({ ...result, ...machineResult, url: window.location.href });
      }, timeoutMs);

      // Trigger scan (bypasses autoMode because _manualRunActive = true)
      this._machine.reset();
      this._result = getResultBuilder();
      this._navVisited = new WeakSet();
      this._detector.rescan();
    });
  }
  
  /**
   * Get current status
   * @returns {object}
   */
  getStatus() {
    return {
      state: this._machine.state,
      isActive: this._machine.isActive,
      elapsed: this._machine.elapsed,
      result: (this._result || getResultBuilder()).build()
    };
  }

  /**
   * Return a lightweight snapshot for the popup's SCAN_ONLY query.
   * No state transitions. No side effects.
   * @returns {object}
   */
  getScanState() {
    const state  = this._machine.state;
    const result = (this._result || getResultBuilder()).build();
    const ctx    = this._machine.context;

    const cmp = result.cmpDetected || ctx.cmp || null;
    const isComplete = state === State.COMPLETE;

    // Count toggles on the detected banner if it is still in the DOM
    let toggleCount = 0;
    if (ctx.banner?.isConnected) {
      toggleCount = ctx.banner.querySelectorAll(
        'input[type="checkbox"], [role="switch"], [role="checkbox"], button[aria-pressed], button[aria-checked]'
      ).length;
    }

    const autoResult = isComplete ? {
      denied:       result.unchecked.length,
      kept:         result.mandatory.length,
      bannerClosed: result.bannerClosed,
      bannerFound:  result.bannerFound,
      success:      true,
      cmp,
      strategy:     ctx.strategy || result.cmpMethod || null,
      timestamp:    Date.now()
    } : null;

    return {
      detected:    result.bannerFound || (state !== State.IDLE && state !== State.FAILED),
      cmp,
      state,
      toggleCount,
      autoComplete: isComplete,
      autoResult
    };
  }
  
  /**
   * Cleanup and stop
   */
  destroy() {
    this._detector.stop();
    this._machine.reset();
    this._initialized = false;
    log.info('Guardr stopped');
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

let orchestrator = null;

/**
 * Get or create orchestrator
 * @returns {Orchestrator}
 */
export function getOrchestrator() {
  if (!orchestrator) {
    orchestrator = new Orchestrator();
  }
  return orchestrator;
}

/**
 * Start Guardr
 */
export async function start() {
  const orc = getOrchestrator();
  await orc.init();
  return orc;
}

/**
 * Stop Guardr
 */
export function stop() {
  if (orchestrator) {
    orchestrator.destroy();
    orchestrator = null;
  }
}

// Auto-start when script loads
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => start(), Timing.INITIAL_SCAN_DELAY);
    });
  } else {
    setTimeout(() => start(), Timing.INITIAL_SCAN_DELAY);
  }
}

// Expose for popup/background
if (typeof window !== 'undefined') {
  window.__guardr = {
    getStatus:       () => getOrchestrator().getStatus(),
    forceScan:       () => getOrchestrator().forceScan(),
    getLearningStats:() => getLearning().getStats(),
    /**
     * Toggle debug logging at runtime.
     * Usage in DevTools console:
     *   window.__guardr.debug()       // enable
     *   window.__guardr.debug(false)  // disable
     */
    debug: (on = true) => {
      setDebugMode(on);
      chrome.storage.local.set({ debugMode: on });
    },
    classifyAll: () => {
      const orc = getOrchestrator();
      const els = getInteractiveElements(document.body, { includeHidden: true });
      const rows = els.map(el => ({
        tag:  el.tagName?.toLowerCase(),
        text: (el.textContent?.trim() || el.getAttribute('aria-label') || '').slice(0, 60),
        role: orc._analyzer._classifyNavRole(el)
      }));
      console.table(rows);
      return rows;
    },
    // classifyAll is also callable from the page console via:
    // document.dispatchEvent(new CustomEvent('guardr:classify'))
    stop,
    start
  };
}

// ── Debug helper — callable from the page console (top context) ────────────
// document is shared between isolated world and page, so dispatching a
// CustomEvent from the page console triggers the listener in the content script.
// Usage: document.dispatchEvent(new CustomEvent('guardr:classify'))
if (typeof document !== 'undefined') {
  document.addEventListener('guardr:classify', () => {
    const orc = getOrchestrator();
    const actor = orc._actor;
    const banner = actor._findActiveBanner();
    if (!banner) { console.warn('[Guardr] No active banner found'); return; }
    console.log('[Guardr] Scoping to:', banner.tagName, banner.id || banner.className.slice(0, 60));
    const els = getInteractiveElements(banner, { includeHidden: true });
    const rows = els.map(el => ({
      tag:  el.tagName?.toLowerCase(),
      text: (el.textContent?.trim() || el.getAttribute('aria-label') || '').slice(0, 60),
      role: orc._analyzer._classifyNavRole(el)
    }));
    console.table(rows);
  });
}

// ── Message listener (popup ↔ content script) ──────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ready: true });
    return false;
  }

  if (message.type === 'SCAN_ONLY') {
    // Return detector snapshot — no action, no state transition.
    if (!orchestrator) {
      sendResponse({ detected: false });
      return false;
    }
    sendResponse(orchestrator.getScanState());
    return false;
  }

  if (message.type === 'RUN_CLEAN') {
    getOrchestrator().runAndGetResult()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message, errors: [{ context: 'Runtime', message: err.message }] }));
    return true; // keep channel open for async response
  }

  if (message.type === 'TEACH_MODE') {
    const orc = getOrchestrator();
    orc._teachMode = true;
    orc.runAndGetResult(15000)
      .then(result => sendResponse({ patternRecorded: result.success === true, result }))
      .catch(err => sendResponse({ patternRecorded: false, error: err.message }));
    return true; // keep channel open for async response
  }
});
