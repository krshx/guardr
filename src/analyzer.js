/**
 * Guardr v3.0 - Semantic Analyzer
 * Intelligent classification of buttons and toggles using NLP-like scoring
 */

import { 
  ButtonType, 
  Signals, 
  NegativeSignals, 
  ScoringWeights 
} from './constants.js';
import { 
  isElementVisible, 
  getElementText, 
  getInteractiveElements, 
  getToggles,
  getToggleState,
  log 
} from './utils.js';

/**
 * Semantic analyzer for consent banner elements
 */
export class Analyzer {
  constructor() {
    this._cache = new WeakMap();
  }
  
  /**
   * Analyze a banner and return an action plan
   * @param {Element} banner
   * @returns {ActionPlan}
   */
  analyze(banner) {
    if (!banner) return null;
    
    // Check cache
    if (this._cache.has(banner)) {
      return this._cache.get(banner);
    }
    
    const startTime = performance.now();
    
    // Get all interactive elements
    const elements = getInteractiveElements(banner);
    const toggles = getToggles(banner);
    
    // Classify all buttons
    const classified = elements
      .filter(el => !this._isToggle(el))
      .map(el => this._classifyButton(el))
      .filter(c => c.score > 0);
    
    // Sort by score within each type
    const byType = {
      [ButtonType.DENY]: [],
      [ButtonType.ACCEPT]: [],
      [ButtonType.SETTINGS]: [],
      [ButtonType.SAVE]: [],
      [ButtonType.CLOSE]: []
    };
    
    for (const item of classified) {
      if (byType[item.type]) {
        byType[item.type].push(item);
      }
    }
    
    // Sort each category by score
    for (const type of Object.keys(byType)) {
      byType[type].sort((a, b) => b.score - a.score);
    }
    
    // Analyze toggles
    const toggleAnalysis = this._analyzeToggles(toggles);
    
    // Build action plan
    const plan = {
      banner,
      denyButtons: byType[ButtonType.DENY],
      acceptButtons: byType[ButtonType.ACCEPT],
      settingsButtons: byType[ButtonType.SETTINGS],
      saveButtons: byType[ButtonType.SAVE],
      closeButtons: byType[ButtonType.CLOSE],
      toggles: toggleAnalysis,
      hasDirectDeny: byType[ButtonType.DENY].length > 0,
      hasSettings: byType[ButtonType.SETTINGS].length > 0,
      hasToggles: toggleAnalysis.length > 0,
      strategy: this._determineStrategy(byType, toggleAnalysis),
      confidence: this._calculateConfidence(byType, toggleAnalysis),
      analysisTime: performance.now() - startTime
    };
    
    this._cache.set(banner, plan);
    
    log.debug('Analysis complete:', {
      deny: plan.denyButtons.length,
      settings: plan.settingsButtons.length,
      toggles: plan.toggles.length,
      strategy: plan.strategy,
      confidence: plan.confidence
    });
    
    return plan;
  }
  
  /**
   * Classify a single button element
   * @param {Element} el
   * @returns {ClassifiedButton}
   * @private
   */
  _classifyButton(el) {
    const result = {
      element: el,
      type: ButtonType.UNKNOWN,
      score: 0,
      signals: []
    };
    
    // Extract all text sources
    const text = getElementText(el);
    const className = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const title = (el.getAttribute('title') || '').toLowerCase();
    const dataTestId = (el.getAttribute('data-testid') || '').toLowerCase();
    
    // Score each button type
    const scores = {
      [ButtonType.DENY]: this._scoreForType(ButtonType.DENY, { text, className, id, ariaLabel, title, dataTestId }),
      [ButtonType.ACCEPT]: this._scoreForType(ButtonType.ACCEPT, { text, className, id, ariaLabel, title, dataTestId }),
      [ButtonType.SETTINGS]: this._scoreForType(ButtonType.SETTINGS, { text, className, id, ariaLabel, title, dataTestId }),
      [ButtonType.SAVE]: this._scoreForType(ButtonType.SAVE, { text, className, id, ariaLabel, title, dataTestId }),
      [ButtonType.CLOSE]: this._scoreForType(ButtonType.CLOSE, { text, className, id, ariaLabel, title, dataTestId })
    };
    
    // Find highest scoring type
    let maxScore = 0;
    let maxType = ButtonType.UNKNOWN;
    
    for (const [type, scoreData] of Object.entries(scores)) {
      if (scoreData.total > maxScore) {
        maxScore = scoreData.total;
        maxType = type;
        result.signals = scoreData.signals;
      }
    }
    
    result.type = maxType;
    result.score = maxScore;
    
    // Boost/penalty based on position and style
    result.score += this._getPositionScore(el);
    result.score += this._getStyleScore(el, maxType);
    
    return result;
  }
  
  /**
   * Score text sources for a specific button type
   * @private
   */
  _scoreForType(type, sources) {
    const signals = type === ButtonType.DENY ? Signals.DENY :
                    type === ButtonType.ACCEPT ? Signals.ACCEPT :
                    type === ButtonType.SETTINGS ? Signals.SETTINGS :
                    type === ButtonType.SAVE ? Signals.SAVE :
                    type === ButtonType.CLOSE ? Signals.CLOSE : [];
    
    const negativeSignals = NegativeSignals[type.toUpperCase()] || [];
    
    let total = 0;
    const matchedSignals = [];
    
    // Check text content (highest weight)
    for (const signal of signals) {
      if (sources.text.includes(signal)) {
        total += ScoringWeights.TEXT_MATCH;
        matchedSignals.push({ signal, source: 'text' });
      }
    }
    
    // Check aria-label
    for (const signal of signals) {
      if (sources.ariaLabel.includes(signal)) {
        total += ScoringWeights.ARIA_MATCH;
        matchedSignals.push({ signal, source: 'aria' });
      }
    }
    
    // Check class name
    for (const signal of signals) {
      if (sources.className.includes(signal.replace(/\s+/g, ''))) {
        total += ScoringWeights.CLASS_MATCH;
        matchedSignals.push({ signal, source: 'class' });
      }
    }
    
    // Check ID
    for (const signal of signals) {
      if (sources.id.includes(signal.replace(/\s+/g, ''))) {
        total += ScoringWeights.ID_MATCH;
        matchedSignals.push({ signal, source: 'id' });
      }
    }
    
    // Check title
    for (const signal of signals) {
      if (sources.title.includes(signal)) {
        total += ScoringWeights.TITLE_MATCH;
        matchedSignals.push({ signal, source: 'title' });
      }
    }
    
    // Apply negative signals (penalties)
    for (const signal of negativeSignals) {
      if (sources.text.includes(signal)) {
        total += ScoringWeights.NEGATIVE_SIGNAL;
        matchedSignals.push({ signal, source: 'negative' });
      }
    }
    
    return { total: Math.max(0, total), signals: matchedSignals };
  }
  
  /**
   * Get position-based score (primary buttons are often first/last)
   * @private
   */
  _getPositionScore(el) {
    let score = 0;
    const parent = el.parentElement;
    if (!parent) return score;
    
    const siblings = Array.from(parent.children).filter(
      c => c.matches('button, a, [role="button"]') && isElementVisible(c)
    );
    
    const index = siblings.indexOf(el);
    
    // First or last position is often primary action
    if (index === 0 || index === siblings.length - 1) {
      score += ScoringWeights.POSITION_PRIMARY;
    }
    
    return score;
  }
  
  /**
   * Get style-based score (prominent buttons are often CTAs)
   * @private
   */
  _getStyleScore(el, expectedType) {
    let score = 0;
    
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    
    // Larger buttons are often primary
    if (rect.width > 150 || rect.height > 40) {
      score += ScoringWeights.SIZE_PROMINENT;
    }
    
    // Background color indicates CTA
    const bgColor = style.backgroundColor;
    if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
      // Accept buttons typically have colored backgrounds
      if (expectedType === ButtonType.ACCEPT) {
        score += ScoringWeights.COLOR_CTA;
      }
      // Deny buttons without much styling are often secondary
      if (expectedType === ButtonType.DENY && style.border && !bgColor.includes('rgb')) {
        score += 1;
      }
    }
    
    return score;
  }
  
  /**
   * Check if element is a toggle (not a regular button)
   * @private
   */
  _isToggle(el) {
    if (el.type === 'checkbox') return true;
    if (el.getAttribute('role') === 'switch') return true;
    if (el.getAttribute('role') === 'checkbox') return true;
    if (el.hasAttribute('aria-checked')) return true;
    if (el.hasAttribute('aria-pressed')) return true;
    return false;
  }
  
  /**
   * Analyze all toggles in the banner
   * @param {Element[]} toggles
   * @returns {ToggleAnalysis[]}
   * @private
   */
  _analyzeToggles(toggles) {
    return toggles.map(toggle => {
      const label = this._getToggleLabel(toggle);
      const state = getToggleState(toggle);
      const isMandatory = this._isToggleMandatory(toggle, label);
      const category = this._categorizeToggle(label);
      
      return {
        element: toggle,
        label,
        currentState: state,
        isMandatory,
        category,
        canDisable: !isMandatory && state !== false
      };
    });
  }
  
  /**
   * Get label text for a toggle
   * @private
   */
  _getToggleLabel(toggle) {
    // Check for associated label
    const id = toggle.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) return label.textContent.trim();
    }
    
    // Check parent label
    const parentLabel = toggle.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.trim();
    }
    
    // Check aria-label
    const ariaLabel = toggle.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    
    // Check aria-labelledby
    const labelledBy = toggle.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }
    
    // Check nearby text
    const parent = toggle.parentElement;
    if (parent) {
      const text = parent.textContent.trim();
      if (text && text.length < 200) return text;
    }
    
    return 'Unknown';
  }
  
  /**
   * Check if toggle is mandatory (required, can't be disabled)
   * @private
   */
  _isToggleMandatory(toggle, label) {
    const labelLower = label.toLowerCase();
    
    // Explicit mandatory indicators
    if (toggle.disabled) return true;
    if (toggle.getAttribute('aria-disabled') === 'true') return true;
    
    // Text-based detection
    const mandatorySignals = [
      'necessary', 'essential', 'required', 'strictly necessary',
      'functional', 'notwendig', 'erforderlich', 'nécessaires',
      'obligatoire', 'necesarias', 'obbligatorio', 'always active',
      'immer aktiv', 'toujours actif'
    ];
    
    for (const signal of mandatorySignals) {
      if (labelLower.includes(signal)) return true;
    }
    
    // Check for "always on" visual indicators
    const parent = toggle.closest('[class*="required"], [class*="mandatory"], [class*="essential"]');
    if (parent) return true;
    
    return false;
  }
  
  /**
   * Categorize toggle by purpose
   * @private
   */
  _categorizeToggle(label) {
    const labelLower = label.toLowerCase();
    
    if (/necessary|essential|required|functional|strictly/i.test(labelLower)) {
      return 'essential';
    }
    if (/analytics|statistics|measurement|performance/i.test(labelLower)) {
      return 'analytics';
    }
    if (/marketing|advertising|ads|targeting|personali[sz]/i.test(labelLower)) {
      return 'marketing';
    }
    if (/preference|functionality|experience/i.test(labelLower)) {
      return 'preferences';
    }
    if (/legitimate|interest/i.test(labelLower)) {
      return 'legitimate-interest';
    }
    if (/vendor|partner|third.?party/i.test(labelLower)) {
      return 'vendor';
    }
    if (/social|share|media/i.test(labelLower)) {
      return 'social';
    }
    
    return 'other';
  }
  
  /**
   * Determine best strategy based on analysis
   * @private
   */
  _determineStrategy(byType, toggles) {
    const hasDeny = byType[ButtonType.DENY].length > 0;
    const hasSettings = byType[ButtonType.SETTINGS].length > 0;
    const hasToggles = toggles.length > 0;
    const hasSave = byType[ButtonType.SAVE].length > 0;
    
    // Best case: direct deny button
    // Threshold 8 = minimum for a single aria-label match (ARIA_MATCH=8) or text match (TEXT_MATCH=10).
    // Must run BEFORE toggle check — otherwise banners with both a deny button and toggles
    // (very common) skip straight to toggle-and-save and never click the obvious reject button.
    if (hasDeny) {
      const topDeny = byType[ButtonType.DENY][0];
      if (topDeny.score >= 8) {
        return 'direct-deny';
      }
    }
    
    // If toggles visible, toggle them off
    if (hasToggles) {
      const disableableToggles = toggles.filter(t => t.canDisable);
      if (disableableToggles.length > 0) {
        return hasSave ? 'toggle-and-save' : 'toggle-only';
      }
    }
    
    // Open settings to find toggles
    if (hasSettings && !hasToggles) {
      return 'open-settings';
    }
    
    // Fallback: try deny button even with lower confidence
    if (hasDeny) {
      return 'direct-deny';
    }
    
    // No good options - try close
    if (byType[ButtonType.CLOSE].length > 0) {
      return 'close-only';
    }
    
    return 'unknown';
  }
  
  /**
   * Calculate confidence score for the analysis
   * @private
   */
  _calculateConfidence(byType, toggles) {
    let score = 0;
    
    // High-scoring deny button increases confidence
    if (byType[ButtonType.DENY].length > 0) {
      const topScore = byType[ButtonType.DENY][0].score;
      if (topScore >= 20) score += 40;
      else if (topScore >= 15) score += 30;
      else if (topScore >= 10) score += 20;
      else score += 10;
    }
    
    // Settings button available is good
    if (byType[ButtonType.SETTINGS].length > 0) {
      score += 15;
    }
    
    // Toggles we can disable is good
    const disableable = toggles.filter(t => t.canDisable).length;
    score += Math.min(disableable * 5, 25);
    
    // Save button available when we have toggles
    if (byType[ButtonType.SAVE].length > 0 && disableable > 0) {
      score += 10;
    }
    
    return Math.min(100, score);
  }
  
  /**
   * Clear cache (useful when banner changes)
   */
  clearCache() {
    this._cache = new WeakMap();
  }
}

/**
 * @typedef {object} ActionPlan
 * @property {Element} banner
 * @property {ClassifiedButton[]} denyButtons
 * @property {ClassifiedButton[]} acceptButtons
 * @property {ClassifiedButton[]} settingsButtons
 * @property {ClassifiedButton[]} saveButtons
 * @property {ClassifiedButton[]} closeButtons
 * @property {ToggleAnalysis[]} toggles
 * @property {boolean} hasDirectDeny
 * @property {boolean} hasSettings
 * @property {boolean} hasToggles
 * @property {string} strategy
 * @property {number} confidence
 * @property {number} analysisTime
 */

/**
 * @typedef {object} ClassifiedButton
 * @property {Element} element
 * @property {string} type
 * @property {number} score
 * @property {object[]} signals
 */

/**
 * @typedef {object} ToggleAnalysis
 * @property {Element} element
 * @property {string} label
 * @property {boolean|null} currentState
 * @property {boolean} isMandatory
 * @property {string} category
 * @property {boolean} canDisable
 */

// Singleton instance
let instance = null;

/**
 * Get or create analyzer instance
 * @returns {Analyzer}
 */
export function getAnalyzer() {
  if (!instance) {
    instance = new Analyzer();
  }
  return instance;
}
