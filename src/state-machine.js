/**
 * Guardr v3.0 - State Machine
 * Deterministic state management with event-driven transitions
 */

import { State, Events, Timing } from './constants.js';
import { log } from './utils.js';

// Valid state transitions
const TRANSITIONS = {
  [State.IDLE]: [State.DETECTED],
  [State.DETECTED]: [State.ANALYZING, State.ACTING, State.FAILED], // Can skip to ACTING if pattern cached
  [State.ANALYZING]: [State.ACTING, State.FAILED],
  [State.ACTING]: [State.COMPLETE, State.FAILED],
  [State.COMPLETE]: [State.IDLE],
  [State.FAILED]: [State.IDLE]
};

/**
 * State Machine for consent banner handling
 */
export class StateMachine extends EventTarget {
  constructor() {
    super();
    this._state = State.IDLE;
    this._context = {};
    this._startTime = null;
    this._timeoutId = null;
    this._lockCount = 0;
  }
  
  /**
   * Get current state
   * @returns {string}
   */
  get state() {
    return this._state;
  }
  
  /**
   * Get context data
   * @returns {object}
   */
  get context() {
    return { ...this._context };
  }
  
  /**
   * Check if machine is idle
   * @returns {boolean}
   */
  get isIdle() {
    return this._state === State.IDLE;
  }
  
  /**
   * Check if operation is in progress
   * @returns {boolean}
   */
  get isActive() {
    return this._state !== State.IDLE && this._state !== State.COMPLETE && this._state !== State.FAILED;
  }
  
  /**
   * Get elapsed time since operation started
   * @returns {number}
   */
  get elapsed() {
    return this._startTime ? Date.now() - this._startTime : 0;
  }
  
  /**
   * Transition to a new state
   * @param {string} newState
   * @param {object} data - Additional context data
   * @returns {boolean}
   */
  transition(newState, data = {}) {
    // Silently ignore re-entering the same terminal state (e.g. timeout fires
    // then async code also tries to transition FAILED→FAILED).
    if (this._state === newState &&
        (newState === State.FAILED || newState === State.COMPLETE)) {
      return true;
    }

    // Validate transition
    const validTransitions = TRANSITIONS[this._state];
    if (!validTransitions?.includes(newState)) {
      log.warn(`Invalid transition: ${this._state} → ${newState}`);
      return false;
    }
    
    const previousState = this._state;
    this._state = newState;
    
    // Merge context data
    this._context = { ...this._context, ...data };
    
    // Track timing
    if (newState === State.DETECTED && previousState === State.IDLE) {
      this._startTime = Date.now();
      this._setupTimeout();
    }
    
    if (newState === State.COMPLETE || newState === State.FAILED) {
      this._context.runtime = this.elapsed;
      this._clearTimeout();
    }
    
    // Emit state change event
    this.dispatchEvent(new CustomEvent(Events.STATE_CHANGE, {
      detail: {
        previousState,
        currentState: newState,
        context: this._context,
        elapsed: this.elapsed
      }
    }));
    
    log.debug(`State: ${previousState} → ${newState}`, this._context);
    
    return true;
  }
  
  /**
   * Set context data without state change
   * @param {object} data
   */
  setContext(data) {
    this._context = { ...this._context, ...data };
  }
  
  /**
   * Reset machine to idle state
   */
  reset() {
    this._clearTimeout();
    this._state = State.IDLE;
    this._context = {};
    this._startTime = null;
    this._lockCount = 0;
  }
  
  /**
   * Acquire processing lock (prevent duplicate operations)
   * @returns {boolean}
   */
  acquireLock() {
    if (this._lockCount > 0) return false;
    this._lockCount++;
    return true;
  }
  
  /**
   * Release processing lock
   */
  releaseLock() {
    this._lockCount = Math.max(0, this._lockCount - 1);
  }
  
  /**
   * Check if locked
   * @returns {boolean}
   */
  get isLocked() {
    return this._lockCount > 0;
  }
  
  /**
   * Setup total operation timeout
   * @private
   */
  _setupTimeout() {
    this._clearTimeout();
    this._timeoutId = setTimeout(() => {
      if (this.isActive) {
        log.warn('Operation timeout exceeded');
        this.transition(State.FAILED, { error: 'timeout' });
      }
    }, Timing.TOTAL_OPERATION_TIMEOUT);
  }
  
  /**
   * Clear timeout
   * @private
   */
  _clearTimeout() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }
  }
  
  /**
   * Get result object for reporting
   * @returns {object}
   */
  getResult() {
    return {
      state: this._state,
      success: this._state === State.COMPLETE,
      runtime: this.elapsed,
      ...this._context
    };
  }
}

/**
 * Result builder - accumulates operation results
 */
export class ResultBuilder {
  constructor() {
    this.reset();
  }
  
  reset() {
    this._data = {
      bannerFound: false,
      bannerClosed: false,
      cmpDetected: null,
      cmpMethod: null,
      consentOrPay: false,
      unchecked: [],
      mandatory: [],
      errors: [],
      consentDenials: 0,
      legitimateInterestDenials: 0,
      vendorDenials: 0,
      otherDenials: 0,
      actionsPerformed: [],
      patternsUsed: []
    };
    this._processedLabels = new Set();
    return this;
  }
  
  /**
   * Mark banner as found
   * @param {string} cmp - CMP name
   */
  bannerFound(cmp = null) {
    this._data.bannerFound = true;
    if (cmp) this._data.cmpDetected = cmp;
    return this;
  }
  
  /**
   * Mark banner as closed
   * @param {string} method - Method used to close
   */
  bannerClosed(method = null) {
    this._data.bannerClosed = true;
    if (method) this._data.cmpMethod = method;
    return this;
  }
  
  /**
   * Set consent-or-pay flag
   */
  setConsentOrPay() {
    this._data.consentOrPay = true;
    return this;
  }
  
  /**
   * Add denied cookie/toggle
   * @param {object} item - { label, type, category }
   */
  addDenied(item) {
    const key = `${item.label}|${item.type}|${item.category}`;
    if (this._processedLabels.has(key)) return this;
    this._processedLabels.add(key);
    
    this._data.unchecked.push(item);
    
    // Update category counts
    const type = (item.type || '').toLowerCase();
    const category = (item.category || '').toLowerCase();
    
    if (type === 'consent' || category.includes('consent')) {
      this._data.consentDenials++;
    } else if (type === 'legitimate interest' || category.includes('legitimate')) {
      this._data.legitimateInterestDenials++;
    } else if (category.includes('vendor')) {
      this._data.vendorDenials++;
    } else {
      this._data.otherDenials++;
    }
    
    return this;
  }
  
  /**
   * Add mandatory cookie (couldn't be disabled)
   * @param {object} item
   */
  addMandatory(item) {
    const key = `mandatory:${item.label}`;
    if (this._processedLabels.has(key)) return this;
    this._processedLabels.add(key);
    
    this._data.mandatory.push(item);
    return this;
  }
  
  /**
   * Add error
   * @param {string} label
   * @param {string} error
   */
  addError(label, error) {
    this._data.errors.push({ label, error, timestamp: Date.now() });
    return this;
  }
  
  /**
   * Record action performed
   * @param {string} action
   * @param {object} details
   */
  recordAction(action, details = {}) {
    this._data.actionsPerformed.push({
      action,
      ...details,
      timestamp: Date.now()
    });
    return this;
  }
  
  /**
   * Record pattern used
   * @param {string} patternId
   */
  recordPattern(patternId) {
    this._data.patternsUsed.push(patternId);
    return this;
  }
  
  /**
   * Build final result object
   * @returns {object}
   */
  build() {
    return { ...this._data };
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create state machine instance
 * @returns {StateMachine}
 */
export function getStateMachine() {
  if (!instance) {
    instance = new StateMachine();
  }
  return instance;
}

/**
 * Get or create result builder instance
 */
let resultInstance = null;

export function getResultBuilder() {
  if (!resultInstance) {
    resultInstance = new ResultBuilder();
  }
  return resultInstance;
}
