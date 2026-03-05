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
    // English — core verbs
    'reject', 'deny', 'decline', 'refuse', 'disagree', 'opt out', 'opt-out',
    'reject all', 'deny all', 'refuse all', 'decline all',
    // Legitimate Interest objection text (inside LI sub-panels)
    'object all', 'object to all', 'opt out of all', 'opt out all',
    'object to legitimate interest', 'object to legitimate interests',
    'object to all legitimate interests', 'oppose all',
    // multilingual LI objection
    'widersprechen', "s'opposer", 'bezwaar maken', 'opponer', 'opsonere',

    // English — "X only" variants (string match handles simple cases; DenyPatterns handles
    // variations with intervening words like "essential cookies only")
    'necessary only', 'essential only', 'required only', 'functional only',
    'only necessary', 'only essential', 'only required', 'only functional',
    'strictly necessary', 'strictly required', 'strictly essential',
    'strictly necessary only', 'strictly required only',
    'necessary cookies only', 'essential cookies only', 'required cookies only',
    'functional cookies only', 'strictly necessary cookies',
    'use necessary', 'use essential', 'use only necessary', 'use only essential',
    'keep only essential', 'keep only necessary',
    'save necessary only', 'accept necessary only', 'accept essential only',
    // English — "continue/proceed without"
    'continue without', 'proceed without', 'browse without',
    'continue without accepting', 'continue without consent',
    'proceed without accepting', 'exit without accepting',
    // English — "without X"
    'without consent', 'without cookies', 'without tracking', 'without advertising',
    // English — negative phrases
    'do not accept', 'do not consent', 'do not sell', 'do not agree',
    'i do not accept', 'i do not agree', "i don't accept", "i don't agree",
    'i disagree', 'no, thank you', 'no, thanks', 'no thanks',
    'disable all', 'turn off all', 'deactivate all',
    'not now', 'maybe later',
    // English — UI labels that open preference panels (NOT deny actions — moved to SETTINGS)
    // NOTE: 'manage cookies' and 'cookie settings' were previously here but caused
    // buttons like Steam's "Cookie Settings" link to be misclassified as deny buttons.
    // German
    'ablehnen', 'alle ablehnen', 'nicht zustimmen',
    'nur notwendige', 'nur notwendige cookies', 'nur erforderliche',
    'nur technisch notwendige', 'technisch notwendig',
    'technisch erforderlich', 'strikt notwendig',
    'weiter ohne zustimmung', 'ohne zustimmung fortfahren',
    // French
    'refuser', 'rejeter', 'tout refuser', 'tout rejeter',
    'nécessaires uniquement', 'uniquement nécessaires', 'seulement nécessaires',
    'continuer sans accepter', 'continuer sans consentir', 'sans accepter',
    'strictement nécessaires', 'le minimum',
    // Spanish
    'rechazar', 'rechazar todo', 'denegar', 'negar',
    'solo necesarias', 'solo necesarios', 'solo funcionales',
    'continuar sin aceptar', 'sin aceptar',
    // Italian
    'rifiuta', 'rifiuta tutto', 'nega', 'rifiuto',
    'solo necessari', 'solo necessarie', 'strettamente necessari',
    'continua senza accettare',
    // Dutch
    'weigeren', 'alles weigeren', 'alles afwijzen',
    'alleen noodzakelijk', 'alleen noodzakelijke cookies',
    'ga verder zonder accepteren', 'doorgaan zonder',
    // Portuguese
    'recusar', 'rejeitar', 'recusar tudo', 'rejeitar tudo',
    'apenas necessários', 'somente necessários', 'necessário apenas',
    'continuar sem aceitar',
    // Polish
    'odrzuć', 'odrzuć wszystkie', 'tylko niezbędne',
    // Swedish
    'avvisa', 'avvisa alla', 'endast nödvändiga',
    // Norwegian
    'avvis', 'avvis alle', 'bare nødvendige',
    // Danish
    'afvis', 'afvis alle', 'kun nødvendige',
    // Finnish
    'hylkää', 'hylkää kaikki', 'vain välttämättömät',
    // Czech
    'odmítnout', 'odmítnout vše', 'pouze nezbytné',
    // Hungarian
    'elutasít', 'összes elutasítása', 'csak szükséges',
    // Romanian
    'refuz', 'refuză tot', 'doar necesare',
    // Greek
    'απόρριψη', 'απόρριψη όλων', 'μόνο απαραίτητα',
    // Turkish
    'reddet', 'tümünü reddet', 'sadece gerekli',
    // Russian
    'отклонить', 'отклонить все', 'только необходимые',
    // Japanese
    '拒否', 'すべて拒否', '必要なもののみ',
    // Chinese
    '拒绝', '全部拒绝', '仅必要',
    // Korean
    '거부', '모두 거부', '필수만'
  ],
  
  SETTINGS: [
    // English
    'settings', 'preferences', 'manage', 'customize', 'options', 'configure',
    'cookie settings', 'privacy settings', 'manage preferences', 'more options',
    'manage cookies', 'cookie preferences', 'privacy preferences',
    'advanced', 'details', 'learn more', 'more info', 'privacy options',
    'detailed settings', 'customise', 'customise cookies',
    // Legitimate Interest sub-tabs (clicked after main settings panel opens)
    'legitimate interests', 'legitimate interest', 'partners',
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
    'save and exit', 'save & exit', 'save and close', 'save & close',
    'continue', 'continue without accepting',
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

/**
 * Regex patterns for deny button text detection.
 * Used as a fallback when string matching misses due to word order or intervening words.
 * Applied to lowercased button text only (not class/id — those use string signals).
 * Each pattern is self-documenting about what real-world variations it covers.
 */
export const DenyPatterns = Object.freeze([
  // Core deny verbs as standalone words (\b prevents matching inside longer words)
  // Covers: "reject", "reject all", "I reject", "decline", etc.
  /\b(reject|deny|decline|refuse|disagree|opt[\s-]out)\b/i,

  // "X only" and "only X" where X = type of allowed cookie
  // Covers: "essential cookies only", "necessary cookies only",
  //         "essential-cookies only", "strictly necessary only",
  //         "only essential", "only necessary required"
  /\b(essential|necessary|required|functional|strictly|basic|minimal|minimum)[\s\w-]*\bonly\b/i,
  /\bonly\b[\s\w-]*\b(essential|necessary|required|functional|basic|minimal|minimum)\b/i,

  // "strictly X" — covers: "strictly necessary", "strictly required",
  //                "strictly functional", "strictly needed"
  /\bstrictly\b[\s\w]*\b(necessary|required|essential|functional|needed)\b/i,

  // "continue / proceed / browse without" — "continue without accepting",
  //   "proceed without consent", "browse without tracking"
  /\b(continue|proceed|browse|browsing|exit|weiter|doorgaan|continua|continuer)\b[\s\w]*\bwithout\b/i,

  // "without accepting / without consent / without advertising"
  /\bwithout\b[\s\w]*\b(accept|consent|agree|track|advertis|market)\b/i,

  // "use / keep / accept / save only X" patterns
  // Covers: "use only essential", "keep only necessary cookies",
  //         "accept only required", "save essential only"
  /\b(use|keep|accept|save)\b[\s\w]*\b(only\b[\s\w]*\b)?(essential|necessary|required|functional|basic)\b/i,

  // "I do not / I don't" accept/agree/consent
  /\b(do\s+not|don'?t)\s+(accept|agree|consent|want|allow)\b/i,

  // "no thanks" / "no, thank you" and multilingual variants
  // Covers: "no thanks", "no, thank you", "nein danke", "non merci", "no gracias"
  /\bno[,.\s]+\s*(thanks|thank\s+you|danke|merci|gracias|grazie|bedankt)\b/i,

  // Legitimate Interest objection — these appear inside LI sub-panels
  /\b(object|oppose|widerspruch|widersprechen|bezwaar|s'opposer|opuster)\b[\s\w]*(all|tout|alle|alles)?/i,

  // Minimum/minimal — some CMPs label their deny button "The minimum" or "minimal cookies"
  /\b(minimum|minimal)\b[\s\w]*(cookie|track|data|consent|advertis)/i,
]);

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
  '#onetrust-banner-sdk',      // OneTrust: the actual visible banner (container is always 0h)
  '#onetrust-consent-sdk',     // OneTrust: outer wrapper (kept as fallback)
  '#CybotCookiebotDialog',
  '#usercentrics-root',    // Usercentrics shadow host (UC v2 / Smart Data Protector)
  '#uc-main-dialog',       // Usercentrics: actual dialog rendered inside shadow DOM
  '#uc-block',             // Usercentrics: alternate root id used on some setups
  '[id^="uc-"]',           // Usercentrics: any uc-* root variant
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

  // Steam
  '#cookiePrefPopup',
  '[class*="cookiepreferences_popup"]',

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
  // Usercentrics ("Smart Data Protector" / v2)
  // #uc-main-dialog and #uc-block render inside #usercentrics-root's shadow DOM.
  // Text check is moot — content is accessible in shadow tree.
  /^uc-main-dialog/,
  /^uc-block/,
  /^usercentrics/i,
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
  SETTINGS_EXPAND_TIME: 800,      // wait for inline settings panel to animate open
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
