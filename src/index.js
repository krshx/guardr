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
import { isContextValid, safeSendMessage, log, initLogging, setDebugMode } from './utils.js';

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
    this._result = getResultBuilder();
    this._initialized = false;
    this._autoMode = true;       // default ON; refreshed from storage at init
    this._manualRunActive = false; // true while runAndGetResult is pending
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
    
    // Handle page navigation
    window.addEventListener('popstate', () => {
      this._onNavigation();
    });
    
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
    
    try {
      // Check context is valid
      if (!isContextValid()) {
        log.debug('Extension context invalid, skipping');
        return;
      }
      
      // Reset result builder
      this._result.reset();
      
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
      
      // Report result
      await this._reportResult();
      
    } catch (err) {
      log.error('Error handling banner:', err.message);
      this._result.addError('Processing', err.message);
      this._machine.transition(State.FAILED, { error: err.message });
      await this._reportResult();
      
    } finally {
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
        await this._learning.recordSuccess(context, 'fallback', actions);
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
    const execResult = await this._actor.execute(plan);
    log.info(`Execution result — success: ${execResult.success}, strategy: ${plan.strategy}, time: ${Math.round(execResult.executionTime || 0)}ms`);
    
    if (execResult.success) {
      this._machine.transition(State.COMPLETE);
      
      // Record successful pattern
      const actions = this._result.build().actionsPerformed;
      await this._learning.recordSuccess(context, plan.strategy, actions);
      
    } else {
      // Try fallback strategies if primary failed
      const fallbackSuccess = await this._tryFallbacks(plan);
      
      if (fallbackSuccess) {
        this._machine.transition(State.COMPLETE);
        const actions = this._result.build().actionsPerformed;
        await this._learning.recordSuccess(context, 'fallback', actions);
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
    
    // Override strategy with cached one
    const originalStrategy = plan.strategy;
    plan.strategy = pattern.strategy;
    
    // Execute
    const result = await this._actor.execute(plan);
    
    if (!result.success) {
      // Try original strategy
      plan.strategy = originalStrategy;
      return (await this._actor.execute(plan)).success;
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
      
      const result = await this._actor.execute(plan);
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
    this._result.reset();
  }
  
  /**
   * Handle navigation events
   * @private
   */
  _onNavigation() {
    log.debug('Navigation detected');
    this._machine.reset();
    this._result.reset();
    this._analyzer.clearCache();
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
      this._result.reset();
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
      result: this._result.build()
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
    stop,
    start
  };
}

// ── Message listener (popup ↔ content script) ──────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ready: true });
    return false;
  }

  if (message.type === 'RUN_CLEAN') {
    getOrchestrator().runAndGetResult()
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message, errors: [{ context: 'Runtime', message: err.message }] }));
    return true; // keep channel open for async response
  }
});
