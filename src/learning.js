/**
 * Guardr v3.0 - Learning Engine
 * Intelligent pattern learning and replay system
 */

import { StorageKeys } from './constants.js';
import { hash, structureHash, safeStorageGet, safeStorageSet, log } from './utils.js';

/**
 * Pattern entry structure
 * @typedef {object} Pattern
 * @property {string} id - Unique fingerprint
 * @property {string} domain - Domain this pattern applies to
 * @property {string} cmp - Detected CMP name
 * @property {string} strategy - Strategy that worked
 * @property {object[]} actions - Sequence of actions
 * @property {number} successCount - Times this pattern worked
 * @property {number} failCount - Times this pattern failed
 * @property {number} lastUsed - Timestamp of last use
 * @property {number} created - Timestamp created
 * @property {number} confidence - Calculated confidence score
 */

/**
 * Learning engine for pattern recognition and replay
 */
export class Learning {
  constructor() {
    this._patterns = new Map();
    this._loaded = false;
    this._saveDebounceId = null;
  }
  
  /**
   * Initialize and load patterns from storage
   */
  async init() {
    if (this._loaded) return;
    
    try {
      const data = await safeStorageGet('local', [StorageKeys.PATTERNS]);
      const stored = data[StorageKeys.PATTERNS];
      
      if (stored && typeof stored === 'object') {
        for (const [id, pattern] of Object.entries(stored)) {
          this._patterns.set(id, pattern);
        }
      }
      
      this._loaded = true;
      log.debug(`Loaded ${this._patterns.size} learned patterns`);
      
      // Cleanup old patterns
      this._pruneOldPatterns();
      
    } catch (err) {
      log.warn('Failed to load patterns:', err.message);
      this._loaded = true; // Mark as loaded anyway to avoid retries
    }
  }
  
  /**
   * Generate fingerprint for current page/banner
   * @param {object} context
   * @param {Element} context.banner - Banner element
   * @param {string} context.cmp - Detected CMP
   * @param {number} context.buttonCount - Number of buttons
   * @param {number} context.toggleCount - Number of toggles
   * @returns {string}
   */
  generateFingerprint(context) {
    const domain = this._extractDomain(window.location.hostname);
    const bannerHash = context.banner ? structureHash(context.banner) : 'none';
    
    const parts = [
      domain,
      context.cmp || 'generic',
      bannerHash,
      `b${context.buttonCount || 0}`,
      `t${context.toggleCount || 0}`
    ];
    
    return hash(parts.join('|'));
  }
  
  /**
   * Find matching pattern for current context
   * @param {object} context
   * @returns {Pattern|null}
   */
  async findPattern(context) {
    await this.init();
    
    const fingerprint = this.generateFingerprint(context);
    
    // Exact match
    if (this._patterns.has(fingerprint)) {
      const pattern = this._patterns.get(fingerprint);
      if (this._isPatternValid(pattern)) {
        log.debug('Found exact pattern match:', fingerprint);
        return pattern;
      }
    }
    
    // Domain-level match (less specific)
    const domain = this._extractDomain(window.location.hostname);
    const domainPattern = this._findDomainPattern(domain, context.cmp);
    
    if (domainPattern) {
      log.debug('Found domain pattern match:', domainPattern.id);
      return domainPattern;
    }
    
    // CMP-level match (even less specific)
    if (context.cmp) {
      const cmpPattern = this._findCMPPattern(context.cmp);
      if (cmpPattern) {
        log.debug('Found CMP pattern match:', cmpPattern.id);
        return cmpPattern;
      }
    }
    
    return null;
  }
  
  /**
   * Record successful action sequence
   * @param {object} context
   * @param {string} strategy
   * @param {object[]} actions
   */
  async recordSuccess(context, strategy, actions) {
    await this.init();
    
    const fingerprint = this.generateFingerprint(context);
    const domain = this._extractDomain(window.location.hostname);
    
    const existing = this._patterns.get(fingerprint);
    
    if (existing) {
      // Update existing pattern
      existing.successCount++;
      existing.lastUsed = Date.now();
      existing.confidence = this._calculateConfidence(existing);
      
      // Update actions if current ones seem better
      if (actions.length < existing.actions.length || !existing.actions.length) {
        existing.actions = actions;
        existing.strategy = strategy;
      }
      
    } else {
      // Create new pattern
      const pattern = {
        id: fingerprint,
        domain,
        cmp: context.cmp || 'generic',
        strategy,
        actions,
        successCount: 1,
        failCount: 0,
        created: Date.now(),
        lastUsed: Date.now(),
        confidence: 70 // Initial confidence for new pattern
      };
      
      this._patterns.set(fingerprint, pattern);
    }
    
    this._debouncedSave();
    log.debug('Recorded success pattern:', fingerprint);
  }
  
  /**
   * Record failed attempt (to lower confidence)
   * @param {object} context
   */
  async recordFailure(context) {
    await this.init();
    
    const fingerprint = this.generateFingerprint(context);
    const pattern = this._patterns.get(fingerprint);
    
    if (pattern) {
      pattern.failCount++;
      pattern.lastUsed = Date.now();
      pattern.confidence = this._calculateConfidence(pattern);
      
      // Remove pattern if confidence drops too low
      if (pattern.confidence < 20) {
        this._patterns.delete(fingerprint);
        log.debug('Removed low-confidence pattern:', fingerprint);
      }
      
      this._debouncedSave();
    }
  }
  
  /**
   * Record a user-initiated correction (teach mode).
   * Sets initial confidence at 90 and marks the pattern as user-taught.
   * Existing patterns get a ×3 success boost and a +20 confidence bump.
   * @param {object} context
   * @param {string} strategy
   * @param {object[]} actions
   */
  async recordCorrection(context, strategy, actions) {
    await this.init();

    const fingerprint = this.generateFingerprint(context);
    const domain = this._extractDomain(window.location.hostname);
    const existing = this._patterns.get(fingerprint);

    if (existing) {
      existing.successCount += 3;
      existing.lastUsed = Date.now();
      existing.confidence = Math.min(95, this._calculateConfidence(existing) + 20);
      existing.method = 'user-taught';
      if (actions?.length) {
        existing.actions = actions;
        existing.strategy = strategy;
      }
    } else {
      this._patterns.set(fingerprint, {
        id: fingerprint,
        domain,
        cmp: context.cmp || 'generic',
        strategy,
        actions: actions || [],
        successCount: 3,
        failCount: 0,
        created: Date.now(),
        lastUsed: Date.now(),
        confidence: 90,
        method: 'user-taught'
      });
    }

    this._debouncedSave();
    log.info('Recorded user correction:', fingerprint);
  }

  /**
   * Get statistics about learned patterns
   * @returns {object}
   */
  async getStats() {
    await this.init();
    
    let totalSuccess = 0;
    let totalFail = 0;
    const byDomain = {};
    const byCMP = {};
    
    for (const pattern of this._patterns.values()) {
      totalSuccess += pattern.successCount;
      totalFail += pattern.failCount;
      
      byDomain[pattern.domain] = (byDomain[pattern.domain] || 0) + 1;
      byCMP[pattern.cmp] = (byCMP[pattern.cmp] || 0) + 1;
    }
    
    return {
      totalPatterns: this._patterns.size,
      totalSuccess,
      totalFail,
      successRate: totalSuccess / (totalSuccess + totalFail) || 0,
      byDomain,
      byCMP,
      topDomains: Object.entries(byDomain)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }
  
  /**
   * Export patterns (for backup/sharing)
   * @returns {object}
   */
  async exportPatterns() {
    await this.init();
    return Object.fromEntries(this._patterns);
  }
  
  /**
   * Import patterns (from backup/sharing)
   * @param {object} patterns
   */
  async importPatterns(patterns) {
    await this.init();
    
    let imported = 0;
    for (const [id, pattern] of Object.entries(patterns)) {
      if (this._isValidPatternStructure(pattern)) {
        // Merge with existing or add new
        const existing = this._patterns.get(id);
        if (existing) {
          // Combine stats
          existing.successCount += pattern.successCount;
          existing.failCount += pattern.failCount;
          existing.confidence = this._calculateConfidence(existing);
        } else {
          this._patterns.set(id, pattern);
          imported++;
        }
      }
    }
    
    await this._savePatterns();
    log.info(`Imported ${imported} patterns`);
    return imported;
  }
  
  /**
   * Delete a single pattern by id
   * @param {string} id
   */
  async deletePattern(id) {
    if (this._patterns.has(id)) {
      this._patterns.delete(id);
      await this._savePatterns();
      log.info('Invalidated cached pattern:', id);
    }
  }

  /**
   * Clear all learned patterns
   */
  async clearPatterns() {
    this._patterns.clear();
    await this._savePatterns();
    log.info('Cleared all learned patterns');
  }
  
  // ==========================================================================
  // Private methods
  // ==========================================================================
  
  /**
   * Extract base domain (handles subdomains)
   * @private
   */
  _extractDomain(hostname) {
    const parts = hostname.toLowerCase().split('.');
    
    // Handle common TLDs
    if (parts.length >= 2) {
      // Check for country TLDs like .co.uk, .com.au
      const lastTwo = parts.slice(-2).join('.');
      if (['co.uk', 'com.au', 'co.nz', 'co.jp', 'org.uk'].includes(lastTwo)) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    
    return hostname;
  }
  
  /**
   * Find best pattern for a domain
   * @private
   */
  _findDomainPattern(domain, cmp) {
    let best = null;
    let bestScore = 0;
    
    for (const pattern of this._patterns.values()) {
      if (pattern.domain !== domain) continue;
      if (!this._isPatternValid(pattern)) continue;
      
      // Score based on CMP match and confidence
      let score = pattern.confidence;
      if (pattern.cmp === cmp) score += 20;
      
      if (score > bestScore) {
        bestScore = score;
        best = pattern;
      }
    }
    
    return best;
  }
  
  /**
   * Find best pattern for a CMP (cross-domain)
   * @private
   */
  _findCMPPattern(cmp) {
    let best = null;
    let bestScore = 0;
    
    for (const pattern of this._patterns.values()) {
      if (pattern.cmp !== cmp) continue;
      if (!this._isPatternValid(pattern)) continue;
      if (pattern.confidence < 60) continue; // Only use high-confidence CMP patterns
      
      const score = pattern.confidence + (pattern.successCount * 2);
      
      if (score > bestScore) {
        bestScore = score;
        best = pattern;
      }
    }
    
    return best;
  }
  
  /**
   * Check if pattern is still valid
   * @private
   */
  _isPatternValid(pattern) {
    if (!pattern) return false;
    if (pattern.confidence < 30) return false;
    
    // Patterns older than 90 days with low recent usage are less reliable
    const ageMs = Date.now() - pattern.created;
    const daysSinceCreated = ageMs / (1000 * 60 * 60 * 24);
    const daysSinceUsed = (Date.now() - pattern.lastUsed) / (1000 * 60 * 60 * 24);
    
    if (daysSinceCreated > 90 && daysSinceUsed > 30 && pattern.confidence < 50) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Validate pattern structure
   * @private
   */
  _isValidPatternStructure(pattern) {
    return pattern &&
      typeof pattern.id === 'string' &&
      typeof pattern.domain === 'string' &&
      typeof pattern.strategy === 'string' &&
      typeof pattern.successCount === 'number' &&
      Array.isArray(pattern.actions);
  }
  
  /**
   * Calculate confidence score
   * @private
   */
  _calculateConfidence(pattern) {
    const total = pattern.successCount + pattern.failCount;
    if (total === 0) return 50;
    
    const successRate = pattern.successCount / total;
    
    // Base confidence on success rate
    let confidence = successRate * 100;
    
    // Boost for high volume
    if (total >= 10) confidence += 10;
    if (total >= 50) confidence += 10;
    
    // Penalty for recent failures
    if (pattern.failCount > pattern.successCount) {
      confidence -= 20;
    }
    
    // Decay for old, unused patterns
    const daysSinceUsed = (Date.now() - pattern.lastUsed) / (1000 * 60 * 60 * 24);
    if (daysSinceUsed > 30) confidence -= 10;
    if (daysSinceUsed > 60) confidence -= 10;
    
    return Math.max(0, Math.min(100, Math.round(confidence)));
  }
  
  /**
   * Remove old/low-confidence patterns
   * @private
   */
  _pruneOldPatterns() {
    const maxPatterns = 1000;
    const maxAgeDays = 180;
    
    const now = Date.now();
    const patterns = Array.from(this._patterns.entries());
    
    // Remove old patterns
    for (const [id, pattern] of patterns) {
      const ageDays = (now - pattern.created) / (1000 * 60 * 60 * 24);
      
      if (ageDays > maxAgeDays && pattern.confidence < 50) {
        this._patterns.delete(id);
      }
    }
    
    // If still too many, remove lowest confidence
    if (this._patterns.size > maxPatterns) {
      const sorted = Array.from(this._patterns.entries())
        .sort((a, b) => a[1].confidence - b[1].confidence);
      
      const toRemove = sorted.slice(0, this._patterns.size - maxPatterns);
      for (const [id] of toRemove) {
        this._patterns.delete(id);
      }
    }
    
    this._debouncedSave();
  }
  
  /**
   * Debounced save to avoid frequent writes
   * @private
   */
  _debouncedSave() {
    if (this._saveDebounceId) {
      clearTimeout(this._saveDebounceId);
    }
    
    this._saveDebounceId = setTimeout(() => {
      this._savePatterns();
    }, 2000);
  }
  
  /**
   * Save patterns to storage
   * @private
   */
  async _savePatterns() {
    const data = Object.fromEntries(this._patterns);
    await safeStorageSet('local', { [StorageKeys.PATTERNS]: data });
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create learning engine instance
 * @returns {Learning}
 */
export function getLearning() {
  if (!instance) {
    instance = new Learning();
  }
  return instance;
}
