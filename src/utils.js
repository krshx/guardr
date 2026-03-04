/**
 * Guardr v3.0 - Utilities
 * Event-driven utilities with zero polling
 */

import { Timing } from './constants.js';

// =============================================================================
// EXTENSION CONTEXT VALIDATION
// =============================================================================

/**
 * Check if extension context is still valid
 * @returns {boolean}
 */
export function isContextValid() {
  try {
    return !!(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

/**
 * Safe chrome.storage access with context check
 * @param {string} area - 'local' or 'sync'
 * @param {string[]} keys - Keys to get
 * @returns {Promise<object>}
 */
export async function safeStorageGet(area, keys) {
  if (!isContextValid()) return {};
  try {
    return await chrome.storage[area].get(keys);
  } catch (err) {
    if (!err.message?.includes('Extension context invalidated')) {
      console.warn('[Guardr] Storage get failed:', err.message);
    }
    return {};
  }
}

/**
 * Safe chrome.storage set with context check
 * @param {string} area - 'local' or 'sync'
 * @param {object} data - Data to set
 * @returns {Promise<boolean>}
 */
export async function safeStorageSet(area, data) {
  if (!isContextValid()) return false;
  try {
    await chrome.storage[area].set(data);
    return true;
  } catch (err) {
    if (!err.message?.includes('Extension context invalidated')) {
      console.warn('[Guardr] Storage set failed:', err.message);
    }
    return false;
  }
}

/**
 * Safe message send with context check
 * @param {object} message
 * @returns {Promise<any>}
 */
export async function safeSendMessage(message) {
  if (!isContextValid()) return null;
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    if (!err.message?.includes('Extension context invalidated')) {
      console.warn('[Guardr] Message send failed:', err.message);
    }
    return null;
  }
}

// =============================================================================
// EVENT-DRIVEN ELEMENT WAITING (NO POLLING)
// =============================================================================

/**
 * Wait for an element to appear using MutationObserver (event-driven, no polling)
 * @param {string|string[]} selectors - CSS selector(s) to wait for
 * @param {object} options
 * @param {number} options.timeout - Max wait time in ms
 * @param {Element} options.parent - Parent element to observe (default: document.body)
 * @param {boolean} options.visible - Also wait for element to be visible
 * @returns {Promise<Element|null>}
 */
export function waitForElement(selectors, options = {}) {
  const {
    timeout = Timing.ELEMENT_WAIT_TIMEOUT,
    parent = document.body,
    visible = false
  } = options;
  
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  
  return new Promise((resolve) => {
    // Check if already exists
    for (const selector of selectorList) {
      const existing = parent.querySelector(selector);
      if (existing && (!visible || isElementVisible(existing))) {
        resolve(existing);
        return;
      }
    }
    
    let observer = null;
    let timeoutId = null;
    
    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    // Setup timeout
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeout);
    
    // Setup observer
    observer = new MutationObserver((mutations) => {
      for (const selector of selectorList) {
        const element = parent.querySelector(selector);
        if (element && (!visible || isElementVisible(element))) {
          cleanup();
          resolve(element);
          return;
        }
      }
    });
    
    observer.observe(parent, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
  });
}

/**
 * Wait for an element to become visible
 * @param {Element} element
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
export function waitForVisible(element, timeout = Timing.ELEMENT_WAIT_TIMEOUT) {
  return new Promise((resolve) => {
    if (isElementVisible(element)) {
      resolve(true);
      return;
    }
    
    let observer = null;
    let timeoutId = null;
    
    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeout);
    
    observer = new MutationObserver(() => {
      if (isElementVisible(element)) {
        cleanup();
        resolve(true);
      }
    });
    
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
    
    // Also observe parent for display changes
    if (element.parentElement) {
      observer.observe(element.parentElement, {
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
    }
  });
}

/**
 * Wait for an element to be removed or hidden
 * @param {Element} element
 * @param {number} timeout
 * @returns {Promise<boolean>}
 */
export function waitForRemoval(element, timeout = Timing.ELEMENT_WAIT_TIMEOUT) {
  return new Promise((resolve) => {
    if (!element || !document.contains(element) || !isElementVisible(element)) {
      resolve(true);
      return;
    }
    
    let observer = null;
    let timeoutId = null;
    
    const cleanup = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    
    const check = () => {
      if (!document.contains(element) || !isElementVisible(element)) {
        cleanup();
        resolve(true);
        return true;
      }
      return false;
    };
    
    timeoutId = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeout);
    
    // Watch for removal from DOM
    observer = new MutationObserver(() => {
      check();
    });
    
    // Observe element for visibility changes
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden']
    });
    
    // Observe parent for child removal
    if (element.parentElement) {
      observer.observe(element.parentElement, {
        childList: true
      });
    }
    
    // Observe document body for major DOM changes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

// =============================================================================
// VISIBILITY HELPERS
// =============================================================================

/**
 * Check if element is visible (fast path)
 * @param {Element} el
 * @returns {boolean}
 */
export function isElementVisible(el) {
  if (!el || !document.contains(el)) return false;
  
  // Fast path: hidden attribute
  if (el.hidden) return false;
  
  // Get computed style (cached by browser)
  const style = getComputedStyle(el);
  
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) < 0.1) return false;
  
  // Check dimensions
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  
  return true;
}

/**
 * Check if element is in viewport
 * @param {Element} el
 * @returns {boolean}
 */
export function isInViewport(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

// =============================================================================
// TEXT EXTRACTION
// =============================================================================

/**
 * Get normalized text from element (cached)
 * @param {Element} el
 * @returns {string}
 */
const textCache = new WeakMap();

export function getElementText(el) {
  if (!el) return '';
  
  if (textCache.has(el)) {
    return textCache.get(el);
  }
  
  const parts = [];
  
  // Direct text content (not recursive)
  const directText = Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent.trim())
    .join(' ');
  if (directText) parts.push(directText);
  
  // Aria label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) parts.push(ariaLabel);
  
  // Title
  const title = el.getAttribute('title');
  if (title) parts.push(title);
  
  // Value (for inputs/buttons)
  const value = el.getAttribute('value');
  if (value) parts.push(value);
  
  // Alt text
  const alt = el.getAttribute('alt');
  if (alt) parts.push(alt);
  
  // For elements with only child content
  if (parts.length === 0) {
    parts.push(el.textContent?.trim() || '');
  }
  
  const normalized = parts.join(' ').toLowerCase().trim();
  textCache.set(el, normalized);
  
  return normalized;
}

// =============================================================================
// DOM HELPERS
// =============================================================================

/**
 * Get all interactive elements within a container
 * @param {Element} container
 * @returns {Element[]}
 */
export function getInteractiveElements(container) {
  if (!container) return [];
  
  const selectors = [
    'button',
    'a[href]',
    'input[type="submit"]',
    'input[type="button"]',
    'input[type="checkbox"]',
    '[role="button"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[tabindex]:not([tabindex="-1"])',
    '[onclick]'
  ];
  
  return Array.from(container.querySelectorAll(selectors.join(',')))
    .filter(el => isElementVisible(el));
}

/**
 * Get all toggles within a container
 * @param {Element} container
 * @returns {Element[]}
 */
export function getToggles(container) {
  if (!container) return [];
  
  const selectors = [
    'input[type="checkbox"]',
    '[role="switch"]',
    '[role="checkbox"]',
    'button[aria-pressed]',
    'button[aria-checked]',
    '[class*="toggle"][class*="switch"]',
    '[class*="switch"][role]'
  ];
  
  return Array.from(container.querySelectorAll(selectors.join(',')))
    .filter(el => isElementVisible(el));
}

/**
 * Simulate a natural click event
 * @param {Element} el
 * @returns {boolean}
 */
export function clickElement(el) {
  if (!el || !isElementVisible(el)) return false;
  
  try {
    // Focus first
    el.focus?.();
    
    // Dispatch full event sequence
    const events = ['mousedown', 'mouseup', 'click'];
    for (const type of events) {
      const event = new MouseEvent(type, {
        view: window,
        bubbles: true,
        cancelable: true
      });
      el.dispatchEvent(event);
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Set toggle state
 * @param {Element} toggle
 * @param {boolean} checked - Desired state
 * @returns {boolean} - Whether state changed
 */
export function setToggleState(toggle, checked) {
  if (!toggle) return false;
  
  const currentState = getToggleState(toggle);
  if (currentState === checked) return false; // Already in desired state
  
  // Checkbox input
  if (toggle.type === 'checkbox') {
    toggle.checked = checked;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  
  // Aria-based toggle
  if (toggle.hasAttribute('aria-checked') || toggle.hasAttribute('aria-pressed')) {
    clickElement(toggle);
    return true;
  }
  
  // Button-style toggle
  if (toggle.matches('button, [role="switch"], [role="checkbox"]')) {
    clickElement(toggle);
    return true;
  }
  
  // Generic - just click
  clickElement(toggle);
  return true;
}

/**
 * Get current toggle state
 * @param {Element} toggle
 * @returns {boolean|null}
 */
export function getToggleState(toggle) {
  if (!toggle) return null;
  
  // Checkbox
  if (toggle.type === 'checkbox') {
    return toggle.checked;
  }
  
  // Aria checked
  const ariaChecked = toggle.getAttribute('aria-checked');
  if (ariaChecked !== null) {
    return ariaChecked === 'true';
  }
  
  // Aria pressed
  const ariaPressed = toggle.getAttribute('aria-pressed');
  if (ariaPressed !== null) {
    return ariaPressed === 'true';
  }
  
  // Class-based detection
  const classes = toggle.className.toLowerCase();
  if (classes.includes('active') || classes.includes('checked') || classes.includes('on')) {
    return true;
  }
  if (classes.includes('inactive') || classes.includes('unchecked') || classes.includes('off')) {
    return false;
  }
  
  return null;
}

// =============================================================================
// HASHING / FINGERPRINTING
// =============================================================================

/**
 * Fast hash function (djb2)
 * @param {string} str
 * @returns {string}
 */
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * Generate a structural fingerprint of an element
 * @param {Element} el
 * @returns {string}
 */
export function structureHash(el) {
  if (!el) return '';
  
  const parts = [
    el.tagName,
    el.className?.split(/\s+/).sort().join(',') || '',
    el.childElementCount,
    Array.from(el.querySelectorAll('button, a, input')).length
  ];
  
  return hash(parts.join('|'));
}

// =============================================================================
// DEBOUNCE / THROTTLE
// =============================================================================

/**
 * Debounce a function
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * Throttle a function
 * @param {Function} fn
 * @param {number} limit
 * @returns {Function}
 */
export function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// =============================================================================
// LOGGING
// Runtime-toggleable two-level logger.
//   log.info / log.warn / log.error: always on
//   log.debug: only when debug mode is enabled
//
// Enable per-session from DevTools:
//   window.__guardr.debug(true)
// Enable persistently:
//   chrome.storage.local.set({ debugMode: true })
// =============================================================================

const LOG_PREFIX = '[Guardr]';

// Mutable flag — updated by setDebugMode() at init and on storage change
let _debugEnabled = false;

/**
 * Enable or disable debug logging at runtime.
 * @param {boolean} on
 */
export function setDebugMode(on) {
  _debugEnabled = Boolean(on);
  console.log(LOG_PREFIX, `Debug mode ${_debugEnabled ? 'ON' : 'OFF'}`);
}

/**
 * Read debugMode from storage and apply it.
 * Call once during Orchestrator.init().
 */
export async function initLogging() {
  try {
    const stored = await chrome.storage.local.get('debugMode');
    if (stored.debugMode) setDebugMode(true);
  } catch (_) { /* non-critical */ }

  // Watch for live changes (e.g. from popup settings)
  chrome.storage.onChanged.addListener((changes) => {
    if ('debugMode' in changes) setDebugMode(changes.debugMode.newValue);
  });
}

export const log = {
  info:  (...args) => console.log(LOG_PREFIX, ...args),
  warn:  (...args) => console.warn(LOG_PREFIX, ...args),
  error: (...args) => console.error(LOG_PREFIX, ...args),
  debug: (...args) => {
    if (_debugEnabled) console.log(LOG_PREFIX, '[DBG]', ...args);
  }
};
