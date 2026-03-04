/**
 * Guardr v3.0 - Constants & Configuration
 * Shared constants used across all modules
 */

// =============================================================================
// STATE MACHINE STATES
// =============================================================================
export const State = Object.freeze({
  IDLE: 'IDLE',
  DETECTED: 'DETECTED', 
  ANALYZING: 'ANALYZING',
  ACTING: 'ACTING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED'
});

// =============================================================================
// EVENT TYPES (internal pub/sub)
// =============================================================================
export const Events = Object.freeze({
  BANNER_DETECTED: 'guardr:banner-detected',
  ANALYSIS_COMPLETE: 'guardr:analysis-complete',
  ACTION_COMPLETE: 'guardr:action-complete',
  STATE_CHANGE: 'guardr:state-change',
  ERROR: 'guardr:error'
});

// =============================================================================
// BUTTON CLASSIFICATION
// =============================================================================
export const ButtonType = Object.freeze({
  ACCEPT: 'accept',
  DENY: 'deny',
  SETTINGS: 'settings',
  CLOSE: 'close',
  SAVE: 'save',
  UNKNOWN: 'unknown'
});

// Semantic signals for button classification (multi-language)
export const Signals = Object.freeze({
  ACCEPT: [
    // English
    'accept', 'agree', 'allow', 'consent', 'ok', 'okay', 'yes', 'continue',
    'got it', 'i understand', 'enable', 'turn on',
    // German
    'akzeptieren', 'zustimmen', 'einverstanden', 'alle akzeptieren',
    // French
    'accepter', 'j\'accepte', 'autoriser', 'tout accepter',
    // Spanish
    'aceptar', 'acepto', 'permitir', 'aceptar todo',
    // Italian
    'accetta', 'accetto', 'consenti', 'accetta tutto',
    // Dutch
    'accepteren', 'akkoord', 'toestaan',
    // Portuguese
    'aceitar', 'concordo', 'permitir',
    // Polish
    'akceptuję', 'zgadzam się',
    // Swedish
    'acceptera', 'godkänn',
    // Norwegian
    'aksepter', 'godta',
    // Danish
    'accepter', 'godkend',
    // Finnish
    'hyväksy', 'salli',
    // Czech
    'přijmout', 'souhlasím',
    // Hungarian
    'elfogadom', 'engedélyezem',
    // Romanian
    'accept', 'sunt de acord',
    // Greek
    'αποδοχή', 'συμφωνώ',
    // Turkish
    'kabul', 'onaylıyorum',
    // Russian
    'принять', 'согласен',
    // Japanese
    '同意', '承諾', 'すべて許可',
    // Chinese
    '接受', '同意', '全部接受',
    // Korean
    '동의', '수락', '모두 허용'
  ],
  
  DENY: [
    // English
    'reject', 'deny', 'decline', 'refuse', 'necessary only', 'essential only',
    'required only', 'reject all', 'deny all', 'refuse all', 'no thanks',
    'only necessary', 'only essential', 'only required', 'disable all',
    'do not accept', 'do not consent', 'do not sell',
    'use necessary', 'use essential',
    'without consent', 'without cookies',
    'manage cookies', 'cookie settings',
    'no, thanks', 'no thanks', 'not now', 'maybe later',
    'opt out', 'opt-out', 'turn off', 'i do not accept',
    // German
    'ablehnen', 'nur notwendige', 'alle ablehnen', 'nicht zustimmen',
    // French
    'refuser', 'rejeter', 'nécessaires uniquement', 'tout refuser', 'continuer sans accepter',
    // Spanish
    'rechazar', 'solo necesarias', 'rechazar todo', 'denegar',
    // Italian
    'rifiuta', 'solo necessari', 'rifiuta tutto', 'nega',
    // Dutch
    'weigeren', 'alleen noodzakelijk', 'alles weigeren',
    // Portuguese
    'recusar', 'rejeitar', 'apenas necessários', 'recusar tudo',
    // Polish
    'odrzuć', 'tylko niezbędne', 'odrzuć wszystkie',
    // Swedish
    'avvisa', 'endast nödvändiga', 'avvisa alla',
    // Norwegian
    'avvis', 'bare nødvendige', 'avvis alle',
    // Danish
    'afvis', 'kun nødvendige', 'afvis alle',
    // Finnish
    'hylkää', 'vain välttämättömät', 'hylkää kaikki',
    // Czech
    'odmítnout', 'pouze nezbytné', 'odmítnout vše',
    // Hungarian
    'elutasít', 'csak szükséges', 'összes elutasítása',
    // Romanian
    'refuz', 'doar necesare', 'refuză tot',
    // Greek
    'απόρριψη', 'μόνο απαραίτητα', 'απόρριψη όλων',
    // Turkish
    'reddet', 'sadece gerekli', 'tümünü reddet',
    // Russian
    'отклонить', 'только необходимые', 'отклонить все',
    // Japanese
    '拒否', '必要なもののみ', 'すべて拒否',
    // Chinese
    '拒绝', '仅必要', '全部拒绝',
    // Korean
    '거부', '필수만', '모두 거부'
  ],
  
  SETTINGS: [
    // English
    'settings', 'preferences', 'manage', 'customize', 'options', 'configure',
    'cookie settings', 'privacy settings', 'manage preferences', 'more options',
    'advanced', 'details', 'learn more', 'more info', 'privacy options',
    // German
    'einstellungen', 'anpassen', 'verwalten', 'optionen', 'konfigurieren',
    // French
    'paramètres', 'préférences', 'gérer', 'personnaliser', 'options',
    // Spanish
    'ajustes', 'configuración', 'preferencias', 'gestionar', 'opciones',
    // Italian
    'impostazioni', 'preferenze', 'gestisci', 'personalizza', 'opzioni',
    // Dutch
    'instellingen', 'voorkeuren', 'beheren', 'aanpassen',
    // Portuguese
    'configurações', 'preferências', 'gerenciar', 'opções'
  ],
  
  SAVE: [
    // English
    'save', 'confirm', 'apply', 'save settings', 'save preferences',
    'confirm choices', 'save my choices', 'save selection', 'done',
    // German
    'speichern', 'bestätigen', 'übernehmen', 'auswahl speichern',
    // French
    'enregistrer', 'confirmer', 'sauvegarder', 'valider',
    // Spanish
    'guardar', 'confirmar', 'aplicar', 'guardar selección',
    // Italian
    'salva', 'conferma', 'applica', 'salva selezione',
    // Dutch
    'opslaan', 'bevestigen', 'toepassen',
    // Portuguese
    'salvar', 'confirmar', 'aplicar'
  ],
  
  CLOSE: [
    'close', 'dismiss', '×', 'x', '✕', '✖', 'cancel',
    'schließen', 'fermer', 'cerrar', 'chiudi', 'sluiten', 'fechar'
  ]
});

// Negative signals (reduce score if present)
export const NegativeSignals = Object.freeze({
  ACCEPT: ['reject', 'deny', 'refuse', 'decline', 'necessary', 'essential', 'required'],
  DENY: ['accept', 'agree', 'allow', 'consent', 'enable'],  // 'all cookies' removed — appears in legitimate deny buttons like "Reject all cookies"
  SETTINGS: ['accept', 'reject', 'deny', 'agree'],
  SAVE: ['reject', 'deny', 'cancel']
});

// =============================================================================
// CMP DETECTION SIGNATURES
// =============================================================================
export const CMPSignatures = Object.freeze({
  ONETRUST: {
    name: 'OneTrust',
    selectors: ['#onetrust-consent-sdk', '.onetrust-pc-dark-filter', '[class*="onetrust"]'],
    globals: ['OneTrust', 'OptanonWrapper']
  },
  COOKIEBOT: {
    name: 'Cookiebot',
    selectors: ['#CybotCookiebotDialog', '[class*="cookiebot"]'],
    globals: ['Cookiebot', 'CookieConsent']
  },
  TRUSTARC: {
    name: 'TrustArc',
    selectors: ['#truste-consent-track', '.truste-consent-content', '[class*="trustarc"]'],
    globals: ['truste']
  },
  QUANTCAST: {
    name: 'Quantcast',
    selectors: ['.qc-cmp2-container', '#qc-cmp2-container', '[class*="qc-cmp"]'],
    globals: ['__tcfapi']
  },
  USERCENTRICS: {
    name: 'Usercentrics',
    selectors: ['#usercentrics-root', '[class*="usercentrics"]'],
    globals: ['UC_UI', 'usercentrics']
  },
  DIDOMI: {
    name: 'Didomi',
    selectors: ['#didomi-host', '.didomi-popup-container'],
    globals: ['Didomi', 'didomiOnReady']
  },
  SOURCEPOINT: {
    name: 'Sourcepoint',
    selectors: ['[class*="sp_message"]', 'iframe[src*="sourcepoint"]', '[id^="sp_message_container"]'],
    globals: ['_sp_', '__tcfapi']
  },
  CONSENTMANAGER: {
    name: 'ConsentManager',
    selectors: ['#cmpbox', '#cmpbox2', '.cmpboxBG'],
    globals: ['__cmp', 'cmp_id']
  },
  TERMLY: {
    name: 'Termly',
    selectors: ['[class*="termly"]', '#termly-code-snippet-support'],
    globals: ['Termly']
  },
  IUBENDA: {
    name: 'Iubenda',
    selectors: ['#iubenda-cs-banner', '.iubenda-cs-container'],
    globals: ['_iub']
  }
});

// =============================================================================
// BANNER DETECTION SELECTORS
// =============================================================================
export const BannerSelectors = [
  // CMP-specific (high confidence)
  '#onetrust-consent-sdk',
  '#CybotCookiebotDialog',
  '#usercentrics-root',
  '#didomi-host',
  '.qc-cmp2-container',
  '#truste-consent-track',
  '#cmpbox',
  '#iubenda-cs-banner',
  '[id^="sp_message_container"]',      // Sourcepoint (iframe-based, no inner text)
  '[class*="sp_message_container"]',   // Sourcepoint variant
  '[class*="sp_message"]',             // Sourcepoint
  '.cmpbox',
  '#cookiebanner',
  '#cookie-law-info-bar',
  '#cookie-notice',
  '#gdpr-cookie-notice',
  '#cookieConsent',
  '#cookie_notice',
  '#cookie-popup',
  '#cookieBar',
  '#CookieBanner',
  '#cookie-consent-banner',
  '#consentBanner',
  '#cookieDisclaimer',
  '.cc-window',                         // CookieConsent.js
  '.cc-banner',
  '.cookieconsent',
  '.cookie-consent-banner',
  '.cookie-bar',
  '.cookie-policy-banner',
  '.consent-bar',
  '.consent-popup',
  '#consent-banner',
  '#consent-popup',

  // Generic class/id patterns (medium confidence)
  '[class*="cookie-banner"]',
  '[class*="cookie-consent"]',
  '[class*="consent-banner"]',
  '[class*="privacy-banner"]',
  '[class*="gdpr-banner"]',
  '[class*="cookie-notice"]',
  '[class*="consent-modal"]',
  '[class*="cookie-modal"]',
  '[class*="cookie-bar"]',
  '[class*="consent-bar"]',
  '[class*="cookie-popup"]',
  '[class*="consent-popup"]',
  '[class*="cookie-widget"]',
  '[class*="cookie-overlay"]',
  '[class*="cookie-message"]',
  '[class*="cookie-alert"]',
  '[class*="gdpr-consent"]',
  '[class*="privacy-consent"]',
  '[class*="tracking-consent"]',
  '[id*="cookie-banner"]',
  '[id*="cookie-consent"]',
  '[id*="consent-banner"]',
  '[id*="gdpr"]',
  '[id*="cookie-bar"]',
  '[id*="cookie-notice"]',
  '[id*="cookie-popup"]',
  '[id*="consent-popup"]',
  '[id*="cookie-modal"]',
  '[id*="consent-modal"]',
  '[id*="privacy-banner"]',
  '[id*="tracking-consent"]',

  // Aria patterns (accessibility)
  '[role="dialog"][aria-label*="cookie" i]',
  '[role="dialog"][aria-label*="consent" i]',
  '[role="dialog"][aria-label*="privacy" i]',
  '[role="alertdialog"][aria-label*="cookie" i]',
  '[role="dialog"][aria-describedby*="cookie" i]',
  '[role="dialog"][class*="cookie" i]',
  '[role="dialog"][class*="consent" i]',
  '[role="dialog"][class*="gdpr" i]',

  // Data attribute patterns
  '[data-cookieconsent]',
  '[data-cookie-banner]',
  '[data-consent]',
  '[data-gdpr]',
  '[data-cookie-notice]',
  '[data-cookie-popup]',
  '[data-tracking-consent]',
  '[data-testid*="cookie" i]',
  '[data-testid*="consent" i]',
  '[data-cy*="cookie" i]',
  '[data-cy*="consent" i]',
];

// =============================================================================
// KNOWN CMP IFRAME CONTAINER PATTERNS
// These elements are outer shell divs whose actual consent UI is rendered
// inside a cross-origin iframe. They have little/no textContent but are
// still valid banners. _isValidBanner skips the text check for them.
// =============================================================================
export const CMPContainerPatterns = [
  // Sourcepoint
  /^sp_message_container/,
  // TrustArc
  /^truste-/,
  // Quantcast (CMP2)
  /^qc-cmp2/,
  /^qc-cmp/,
  // LiveRamp
  /^sp-cc-/,
  // generic iframe-wrapper patterns
  /consent.?overlay/i,
  /cmp.?container/i,
  /privacy.?overlay/i,
];


// =============================================================================
// TOGGLE SELECTORS
// =============================================================================
export const ToggleSelectors = [
  // Standard checkbox inputs
  'input[type="checkbox"]',
  
  // Aria switches
  '[role="switch"]',
  '[role="checkbox"]',
  
  // Custom toggle patterns
  '[class*="toggle"]',
  '[class*="switch"]',
  
  // Button-based toggles
  'button[aria-pressed]',
  'button[aria-checked]'
];

// =============================================================================
// PAYWALL / CONSENT-OR-PAY SIGNALS
// =============================================================================
export const PaywallSignals = [
  'subscribe', 'subscription', 'premium', 'pay', 'purchase',
  'ad-free', 'adfree', 'without ads', 'support us',
  'pur abo', 'pur-abo', // German
  'abonnement', // French
  'suscripción', // Spanish
  '€/month', '$/month', '£/month',
  'free trial', 'start trial'
];

// =============================================================================
// TIMING CONFIGURATION
// =============================================================================
export const Timing = Object.freeze({
  // Element waiting
  ELEMENT_WAIT_TIMEOUT: 5000,
  ELEMENT_POLL_INTERVAL: 50,
  
  // Action delays (minimum necessary for UI updates)
  CLICK_SETTLE_TIME: 100,
  TOGGLE_SETTLE_TIME: 50,
  PANEL_ANIMATION_TIME: 300,
  
  // Detection
  MUTATION_DEBOUNCE: 100,
  INITIAL_SCAN_DELAY: 500,
  
  // Timeouts
  TOTAL_OPERATION_TIMEOUT: 20000, // must exceed worst-case CMP API wait (≤7s)
  SINGLE_ACTION_TIMEOUT: 3000,
  
  // Retries
  MAX_RETRIES: 2,
  RETRY_DELAY: 500
});

// =============================================================================
// SCORING WEIGHTS
// =============================================================================
export const ScoringWeights = Object.freeze({
  TEXT_MATCH: 10,
  ARIA_MATCH: 8,
  CLASS_MATCH: 5,
  ID_MATCH: 5,
  TITLE_MATCH: 6,
  POSITION_PRIMARY: 3,
  SIZE_PROMINENT: 2,
  COLOR_CTA: 2,
  NEGATIVE_SIGNAL: -15
});

// =============================================================================
// STORAGE KEYS
// =============================================================================
export const StorageKeys = Object.freeze({
  PATTERNS: 'guardr_patterns_v3',
  HISTORY: 'guardr_history',
  SETTINGS: 'guardr_settings',
  STATS: 'guardr_stats'
});

// =============================================================================
// MESSAGE TYPES (content <-> background)
// =============================================================================
export const MessageType = Object.freeze({
  SCAN_COMPLETE: 'GUARDR_SCAN_COMPLETE',
  GET_PATTERNS: 'GUARDR_GET_PATTERNS',
  SAVE_PATTERN: 'GUARDR_SAVE_PATTERN',
  GET_SETTINGS: 'GUARDR_GET_SETTINGS',
  UPDATE_BADGE: 'GUARDR_UPDATE_BADGE'
});
