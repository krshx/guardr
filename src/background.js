/**
 * Guardr v3.0 - Background Service Worker
 * Clean, focused service worker for message handling and storage
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEYS = {
  HISTORY: 'guardr_history',
  STATS: 'guardr_stats',
  SETTINGS: 'guardr_settings',
  PATTERNS: 'guardr_patterns_v3'
};

const MESSAGE_TYPES = {
  SCAN_COMPLETE: 'GUARDR_SCAN_COMPLETE',
  GET_RESULTS: 'GET_RESULTS',
  GET_HISTORY: 'GUARDR_GET_HISTORY',
  CLEAR_HISTORY: 'GUARDR_CLEAR_HISTORY',
  GET_STATS: 'GUARDR_GET_STATS',
  GET_SETTINGS: 'GUARDR_GET_SETTINGS',
  UPDATE_SETTINGS: 'GUARDR_UPDATE_SETTINGS',
  TRIGGER_SCAN: 'GUARDR_TRIGGER_SCAN'
};

const MAX_HISTORY_ENTRIES = 1000;

// Cache latest results per tab
const tabResults = new Map();

// =============================================================================
// MESSAGE HANDLER
// =============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[Guardr BG] Error:', err.message);
      sendResponse({ error: err.message });
    });
  
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  const { type, data } = message;
  
  switch (type) {
    case MESSAGE_TYPES.SCAN_COMPLETE:
      return await handleScanComplete(data, sender.tab);
      
    case MESSAGE_TYPES.GET_RESULTS: {
      // tabId comes from popup via data.tabId (popup cannot use sender.tab)
      const tabId = data?.tabId ?? sender?.tab?.id;
      if (tabId && tabResults.has(tabId)) {
        return tabResults.get(tabId);
      }
      // Fallback: session storage (survives service worker restarts)
      if (tabId) {
        try {
          const stored = await chrome.storage.session.get(`tabResult_${tabId}`);
          const r = stored[`tabResult_${tabId}`];
          if (r) {
            tabResults.set(tabId, r); // restore to in-memory map
            return r;
          }
        } catch (_) { /* session storage not available */ }
      }
      return null;
    }
      
    case MESSAGE_TYPES.GET_HISTORY:
      return await getHistory();
      
    case MESSAGE_TYPES.CLEAR_HISTORY:
      return await clearHistory();
      
    case MESSAGE_TYPES.GET_STATS:
      return await getStats();
      
    case MESSAGE_TYPES.GET_SETTINGS:
      return await getSettings();
      
    case MESSAGE_TYPES.UPDATE_SETTINGS:
      return await updateSettings(data);
      
    case MESSAGE_TYPES.TRIGGER_SCAN:
      return await triggerScan(data?.tabId || sender.tab?.id);
      
    default:
      return { error: 'Unknown message type' };
  }
}

// =============================================================================
// SCAN COMPLETE HANDLER
// =============================================================================

async function handleScanComplete(result, tab) {
  console.log('[Guardr BG] Scan complete:', {
    url: result.url,
    bannerFound: result.bannerFound,
    bannerClosed: result.bannerClosed,
    denied: result.totalDenied ?? result.unchecked?.length ?? 0
  });
  
  // Cache result for this tab (for popup to retrieve)
  if (tab?.id) {
    const cachedResult = {
      ...result,
      timestamp: Date.now()
    };
    tabResults.set(tab.id, cachedResult);

    // Persist to session storage so result survives service worker restarts
    try {
      await chrome.storage.session.set({ [`tabResult_${tab.id}`]: cachedResult });
    } catch (_) { /* session storage not available in this context */ }
    
    // Clean up old entries (keep max 50 tabs)
    if (tabResults.size > 50) {
      const oldest = [...tabResults.entries()]
        .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0))
        .slice(0, tabResults.size - 50);
      oldest.forEach(([id]) => tabResults.delete(id));
    }
  }
  
  // Save to history
  await saveToHistory(result);

  // Also save in popup-compatible format so history/dashboard tabs always reflect auto-scans
  await saveToPopupHistory(result);
  
  // Update stats
  await updateStats(result);
  
  // Update badge
  if (tab?.id) {
    await updateBadge(tab.id, result);
  }
  
  // Send telemetry (if enabled)
  await sendTelemetry(result);
  
  return { success: true };
}

// =============================================================================
// HISTORY MANAGEMENT
// =============================================================================

async function saveToHistory(result) {
  try {
    const { [STORAGE_KEYS.HISTORY]: history = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      timestamp: Date.now(),
      url: (() => { try { return new URL(result.url).origin; } catch { return ''; } })(),
      domain: extractDomain(result.url),
      title: result.title || '',
      bannerFound: result.bannerFound || false,
      bannerClosed: result.bannerClosed || false,
      cmpDetected: result.cmpDetected || null,
      cmpMethod: result.cmpMethod || null,
      consentOrPay: result.consentOrPay || false,
      unchecked: result.unchecked || [],
      mandatory: result.mandatory || [],
      errors: result.errors || [],
      denialCount: result.totalDenied ?? result.unchecked?.length ?? 0,
      consentDenials: result.consentDenials || 0,
      legitimateInterestDenials: result.legitimateInterestDenials || 0,
      vendorDenials: result.vendorDenials || 0,
      runtime: result.runtime || 0
    };
    
    // Add to beginning
    history.unshift(entry);
    
    // Trim to max size
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(MAX_HISTORY_ENTRIES);
    }
    
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: history });
    
    console.log('[Guardr BG] Saved to history:', entry.domain);
    
  } catch (err) {
    console.error('[Guardr BG] Failed to save history:', err.message);
  }
}

async function getHistory() {
  try {
    const { [STORAGE_KEYS.HISTORY]: history = [] } = await chrome.storage.local.get(STORAGE_KEYS.HISTORY);
    return { history };
  } catch (err) {
    return { history: [], error: err.message };
  }
}

/**
 * Save result to the popup-compatible 'denyHistory' storage key so that
 * auto-scans (where the popup is closed) still appear in the history and
 * dashboard tabs.  Mirrors the schema used by popup.js saveToHistory().
 */
async function saveToPopupHistory(result) {
  try {
    const isDirectDenySuccess = result?.success &&
      (result.strategy === 'direct-deny' || result.cmpMethod === 'deny-button' ||
       result.strategy === 'cmp-api'      || result.cmpMethod === 'cmp-api');

    // Temporary debug: verify payload values arriving from content script
    console.log('[Guardr BG] saveToPopupHistory payload:', {
      bannerFound:  result.bannerFound,
      bannerClosed: result.bannerClosed,
      totalDenied:  result.totalDenied,
      consentDenials: result.consentDenials,
      legitimateInterestDenials: result.legitimateInterestDenials,
      success: result.success,
      strategy: result.strategy,
      cmpMethod: result.cmpMethod
    });

    // Only record if a banner was found, denials were recorded, or direct-deny succeeded
    const totalDenied = result.totalDenied ?? 0;
    if (!result.bannerFound && totalDenied === 0 && !isDirectDenySuccess) return;

    const { denyHistory: history = [] } = await chrome.storage.local.get('denyHistory');

    const url = (() => { try { return new URL(result.url).origin; } catch { return ''; } })();
    const domain = extractDomain(result.url);

    // Deduplicate: skip if the same URL was saved by the popup within the last 5 seconds
    const recent = history[0];
    if (recent && recent.url === url && Date.now() - recent.timestamp < 5000) return;

    const historyItem = {
      id: Date.now(),
      domain,
      url,
      timestamp: Date.now(),
      denied:                    result.totalDenied ?? result.unchecked?.length ?? 0,
      consentDenials:            result.consentDenials ?? 0,
      legitimateInterestDenials: result.legitimateInterestDenials ?? 0,
      vendorDenials:             result.vendorDenials ?? 0,
      otherDenials:              result.otherDenials ?? 0,
      kept: result.mandatory?.length || 0,
      cmp: result.cmpDetected || 'Unknown',
      method: result.cmpMethod || 'auto',
      runtime: result.runtime || 0,
      bannerFound: result.bannerFound || false,
      bannerClosed: result.bannerClosed || false,
      actionLog: result.actionsPerformed || [],
      consentOrPay: result.consentOrPay || false
    };

    history.unshift(historyItem);

    // Expire entries older than 90 days (matches popup HISTORY_EXPIRY_DAYS)
    const expiryTime = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const trimmed = history.filter(item => item.timestamp > expiryTime);

    await chrome.storage.local.set({ denyHistory: trimmed });
    console.log('[Guardr BG] Saved to popup history:', domain);
  } catch (err) {
    console.error('[Guardr BG] Failed to save popup history:', err.message);
  }
}

async function clearHistory() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [], denyHistory: [] });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// STATS MANAGEMENT
// =============================================================================

async function updateStats(result) {
  try {
    const { [STORAGE_KEYS.STATS]: stats = getDefaultStats() } = await chrome.storage.local.get(STORAGE_KEYS.STATS);
    
    // Update totals
    stats.totalScans++;
    
    if (result.bannerFound) {
      stats.totalBannersFound++;
    }
    
    if (result.bannerClosed) {
      stats.totalBannersClosed++;
      stats.totalDenials += result.totalDenied ?? result.unchecked?.length ?? 0;
      stats.consentDenials += result.consentDenials || 0;
      stats.legitimateInterestDenials += result.legitimateInterestDenials || 0;
      stats.vendorDenials += result.vendorDenials || 0;
    }
    
    if (result.consentOrPay) {
      stats.totalPaywalls++;
    }
    
    // Track CMP usage
    if (result.cmpDetected) {
      stats.cmpCounts[result.cmpDetected] = (stats.cmpCounts[result.cmpDetected] || 0) + 1;
    }
    
    // Track domain
    const domain = extractDomain(result.url);
    stats.domainCounts[domain] = (stats.domainCounts[domain] || 0) + 1;
    
    // Calculate success rate
    if (stats.totalBannersFound > 0) {
      stats.successRate = Math.round((stats.totalBannersClosed / stats.totalBannersFound) * 100);
    }
    
    stats.lastUpdated = Date.now();
    
    await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats });
    
  } catch (err) {
    console.error('[Guardr BG] Failed to update stats:', err.message);
  }
}

async function getStats() {
  try {
    const { [STORAGE_KEYS.STATS]: stats = getDefaultStats() } = await chrome.storage.local.get(STORAGE_KEYS.STATS);
    return { stats };
  } catch (err) {
    return { stats: getDefaultStats(), error: err.message };
  }
}

function getDefaultStats() {
  return {
    totalScans: 0,
    totalBannersFound: 0,
    totalBannersClosed: 0,
    totalDenials: 0,
    totalPaywalls: 0,
    consentDenials: 0,
    legitimateInterestDenials: 0,
    vendorDenials: 0,
    successRate: 0,
    cmpCounts: {},
    domainCounts: {},
    lastUpdated: Date.now()
  };
}

// =============================================================================
// SETTINGS MANAGEMENT
// =============================================================================

async function getSettings() {
  try {
    const { [STORAGE_KEYS.SETTINGS]: settings = getDefaultSettings() } = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
    return { settings };
  } catch (err) {
    return { settings: getDefaultSettings(), error: err.message };
  }
}

async function updateSettings(newSettings) {
  try {
    const { settings = getDefaultSettings() } = await getSettings();
    const merged = { ...settings, ...newSettings };
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
    return { success: true, settings: merged };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function getDefaultSettings() {
  return {
    enabled: true,
    autoMode: true,
    showNotifications: true,
    telemetryEnabled: false,
    debugMode: false
  };
}

// =============================================================================
// BADGE MANAGEMENT
// =============================================================================

async function updateBadge(tabId, result) {
  try {
    if (result.bannerClosed) {
      // Success - green badge with count
      const count = result.totalDenied ?? result.unchecked?.length ?? 0;
      await chrome.action.setBadgeText({ 
        tabId, 
        text: count > 0 ? count.toString() : '✓' 
      });
      await chrome.action.setBadgeBackgroundColor({ 
        tabId, 
        color: '#22c55e' // Green
      });
    } else if (result.bannerFound) {
      // Banner found but not closed - yellow
      await chrome.action.setBadgeText({ tabId, text: '!' });
      await chrome.action.setBadgeBackgroundColor({ 
        tabId, 
        color: '#eab308' // Yellow
      });
    } else if (result.consentOrPay) {
      // Paywall - orange
      await chrome.action.setBadgeText({ tabId, text: '$' });
      await chrome.action.setBadgeBackgroundColor({ 
        tabId, 
        color: '#f97316' // Orange
      });
    } else {
      // No banner - clear badge
      await chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch (err) {
    // Tab might be closed, ignore
  }
}

// =============================================================================
// TELEMETRY (Optional, privacy-respecting)
// =============================================================================

const SUPABASE_URL = '';  // configure via supabase proxy
const SUPABASE_ANON_KEY = '';  // removed — use server-side proxy

let cachedSessionToken = null;
function getSessionToken() {
  if (!cachedSessionToken) {
    cachedSessionToken = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2,'0')).join('');
  }
  return cachedSessionToken;
}

async function sendTelemetry(result) {
  try {
    // Check opt-in status
    const { telemetryOptIn } = await chrome.storage.local.get('telemetryOptIn');
    if (!telemetryOptIn) {
      console.log('[Guardr BG] Telemetry disabled by user');
      return;
    }
    
    const domain = extractDomain(result.url);
    
    // Match exact schema from cookie_telemetry table
    const payload = {
      session_token: getSessionToken(),
      version: chrome.runtime.getManifest().version,
      domain: domain || 'unknown',
      cmp_type: sanitizeCmp(result.cmpDetected),
      denied_count: Math.min(result.totalDenied ?? result.unchecked?.length ?? 0, 9999),
      kept_count: Math.min(result.mandatory?.length || 0, 100),
      banner_closed: result.bannerClosed === true,
      consent_denials: Math.min(result.consentDenials || 0, 9999),
      legitimate_interest_denials: Math.min(result.legitimateInterestDenials || 0, 9999),
      vendor_denials: Math.min(result.vendorDenials || 0, 9999),
      other_denials: Math.min(result.otherDenials || 0, 9999),
      consent_or_pay_detected: result.consentOrPay === true
    };
    
    console.log('[Guardr BG] Sending telemetry:', payload);
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/cookie_telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
    
    if (response.ok) {
      console.log('[Guardr BG] ✓ Telemetry sent successfully');
    } else {
      const errorText = await response.text();
      console.warn('[Guardr BG] Telemetry failed:', response.status, errorText);
    }
    
  } catch (err) {
    console.debug('[Guardr BG] Telemetry error:', err.message);
  }
}

function sanitizeCmp(raw) {
  const known = ['tcf','onetrust','cookiebot','trustarc','quantcast','didomi',
                 'usercentrics','axeptio','cookieyes','sourcepoint','iubenda','klaro','osano','termly'];
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  return known.find(k => lower.includes(k)) || 'generic';
}

// =============================================================================
// SCAN TRIGGER (from popup)
// =============================================================================

async function triggerScan(tabId) {
  if (!tabId) return { success: false, error: 'No tab ID' };
  
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'GUARDR_FORCE_SCAN' });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const parts = hostname.split('.');
    
    // Handle country TLDs
    if (parts.length >= 2) {
      const lastTwo = parts.slice(-2).join('.');
      if (['co.uk', 'com.au', 'co.nz', 'co.jp', 'org.uk'].includes(lastTwo)) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }
    
    return hostname;
  } catch {
    return 'unknown';
  }
}

// =============================================================================
// LIFECYCLE EVENTS
// =============================================================================

// Clean up cached results when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  tabResults.delete(tabId);
  try { await chrome.storage.session.remove(`tabResult_${tabId}`); } catch (_) {}
});

// Clear cached result when tab navigates to new page
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    tabResults.delete(tabId);
    try { await chrome.storage.session.remove(`tabResult_${tabId}`); } catch (_) {}
  }
});

// On install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Guardr BG] Installed:', details.reason);
  
  if (details.reason === 'install') {
    // Initialize default settings
    chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: getDefaultSettings() });
  }
});

// On startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Guardr BG] Startup');
});

console.log('[Guardr BG] Service worker loaded');
