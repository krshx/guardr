# Guardr 🛡️

**One-click denial of all non-essential cookies and tracking consents.**  
Intelligent Chrome extension with **self-learning capabilities** that automatically handles any CMP using universal semantic detection.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-blue)](https://chromewebstore.google.com/)
[![Version](https://img.shields.io/badge/version-3.0.0-brightgreen)](https://github.com/krshx/guardr)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## 🆕 What's New

### v3.0.0 - **Complete Architecture Rewrite** ⚡
**Event-Driven • Modular • Self-Learning • Massively Faster**

The extension has been completely rewritten from the ground up with a modern, battle-tested architecture:

**Core Improvements:**
- **⚡ Event-Driven Architecture** — No polling loops, <50ms detection latency
- **🧩 Modular Design** — From 3,600 lines → 7 focused modules (<300 lines each)
- **🚀 10x Faster** — Known patterns replay in <500ms, 4x faster initial detection
- **🧠 Advanced Learning** — Fingerprinting, confidence scoring, cross-site pattern sharing
- **🔒 State Machine** — Deterministic processing, zero race conditions
- **🎯 Universal Detection** — No site-specific rules, works on any CMP

**New Features:**
- ✅ Self-learning engine with automatic pattern fingerprinting
- ✅ Bayesian confidence scoring (85%+ accuracy required)
- ✅ Enhanced action logging with all operation details
- ✅ Consent-or-pay detection & automatic abort
- ✅ Supabase telemetry backend (self-hosted option)
- ✅ Automated end-to-end testing with 100+ test sites

[📖 Read Full v3.0.0 Release Notes →](RELEASE_NOTES_v3.0.0.md) | [🏗️ Architecture Details →](ARCHITECTURE_V3.md)

---

## 🆚 Feature Comparison

| Feature | v2.x | v3.0 |
|---------|------|------|
| **Detection Latency** | 200ms+ | <50ms ✨ |
| **Known Pattern Replay** | N/A | <500ms ✨ |
| **Architecture** | Monolithic | Modular ✨ |
| **Learning System** | Basic | Advanced ✨ |
| **State Management** | Procedural | State Machine ✨ |
| **CMP Coverage** | Tier-based | Universal ✨ |
| **Languages** | 15+ | 20+ ✨ |
| **Auto Testing** | Manual | Automated ✨ |

---

## ✨ Features

- **🚀 One-Click Denial** — Deny all non-essential consents instantly
- **🎯 Multi-Level Support** — Navigates through Partners, Legitimate Interest, Vendors tabs automatically
- **🖼️ Iframe Scanning** — Detects and handles CMPs loaded in iframes
- **🏢 Enhanced CMP Coverage** — Improved support for TCF/IAB, OneTrust, Cookiebot, Didomi, Usercentrics, TrustArc, Quantcast, Sourcepoint, and more
- **⚡ Smart Auto-Mode** — Automatically detects and denies CMPs on page load with retry logic
- **🔄 Dynamic Detection** — Handles slow-loading and delayed CMPs with multiple detection attempts
- **📊 Detailed Results** — Shows exactly what was denied, what was kept mandatory, and where
- **🔒 Privacy First** — No tracking, no data collection unless you opt-in to anonymous telemetry
- **🌍 Multi-Language** — Supports English, French, German, Spanish, Italian, Portuguese, Dutch

**New in v1.3.0:**
- 🔍 **Action Logging** — Comprehensive log of all operations (button clicks, API calls, fallback strategies)
- ⚠️ **Consent-or-Pay Detection** — Smart detection of "Accept OR Subscribe/Pay" walls with automatic abort
- 📊 **Enhanced History** — Expandable action logs, banner status indicators, pay wall warnings
- 🧹 **Clear History** — User control over stored data with one-click clearing
- 🎯 **Transparency** — See exactly what the extension did, when, and how
- 🧪 **Test Results** — Action logs and detection flags in test-results.json for debugging

**New in v1.2.0:**
- ✨ Completely rewritten OneTrust handler (CNN, major news sites)
- ✨ Enhanced Quantcast support (Forbes)
- ✨ Added Sourcepoint detection and handling (The Guardian)
- ✨ Smart retry logic for slow-loading CMPs
- ✨ Improved auto-mode timing and reliability
- ✨ Test mode for automated validation

---

## 🎯 What It Does

Guardr automatically:
1. ✅ Detects cookie consent banners and CMPs
2. ✅ Clicks "Reject All" / "Deny All" / "Object All" buttons
3. ✅ Opens preference panels and navigates through all sections
4. ✅ Unchecks all non-essential consent toggles (advertising, tracking, personalization, etc.)
5. ✅ Keeps only mandatory/strictly necessary cookies checked
6. ✅ Saves your choices and closes the banner

**Example:** On sites like whatismyipaddress.com with complex multi-tab CMPs:
- Opens "More Options" → Clicks "Reject All"
- Navigates to "Partners" tab → Clicks "Reject All" for all vendors
- Navigates to "Legitimate Interest" tab → Clicks "Object All"
- Processes all sections recursively → Saves preferences

---

## 📦 Installation

### From Chrome Web Store (Recommended)
1. Visit [Chrome Web Store](#) (coming soon)
2. Click "Add to Chrome"
3. Click the extension icon when you see a cookie banner

### Manual Installation (Development)
1. Clone this repository:
   ```bash
   git clone https://github.com/krshx/guardr.git
   cd guardr
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right)

4. Click "Load unpacked" and select the `guardr` folder

5. The extension icon will appear in your toolbar

---

## 🚀 Usage

### Manual Mode (Default)
1. Visit any website with a cookie banner
2. Click the **Guardr** extension icon
3. Click **"Deny All Non-Essential Consents"**
4. View detailed results in the popup

### Auto Mode (Optional)
1. Click the extension icon
2. Click the ⚙️ Settings icon
3. Toggle **"Auto-deny on every page"**
4. The extension will now run automatically on page load

---

## 🏗️ Architecture (v3.0)

### File Structure
```
guardr/
├── manifest.json              # Extension configuration (Manifest v3)
├── src/
│   ├── index.js              # Orchestrator - wires all modules
│   ├── detector.js           # Event-driven banner detection (~200 lines)
│   ├── analyzer.js           # Semantic button classification (~250 lines)
│   ├── actor.js              # Action execution & verification (~200 lines)
│   ├── learning.js           # Self-learning engine (~200 lines)
│   ├── state-machine.js      # State management (~150 lines)
│   ├── constants.js          # Shared constants & patterns
│   ├── utils.js              # Helper functions
│   └── background.js         # Service worker
├── content-v3.js             # Bundled content script
├── popup.html/js             # User interface
├── telemetry.js              # Optional anonymous telemetry
└── docs/index.html           # Privacy policy
```

### Core Modules

| Module | Lines | Purpose |
|--------|-------|---------|
| **Detector** | 200 | Watches DOM with MutationObserver, triggers on banner detection |
| **Analyzer** | 250 | Classifies buttons semantically, generates action plans |
| **Actor** | 200 | Executes actions: clicks, toggles, verifies results |
| **State Machine** | 150 | Manages IDLE→DETECTED→ANALYZING→ACTING→COMPLETE flow |
| **Learning Engine** | 200 | Fingerprints patterns, stores & retrieves learned actions |
| **Orchestrator** | 150 | Wires modules, handles messaging, reports results |
| **Background Worker** | 200 | History, telemetry, cross-tab pattern sync |

### Event Flow

```
Page Load → Detector (MutationObserver)
    ↓
Banner Detected → State: IDLE → DETECTED
    ↓
Analyzer: Check Learning Engine for known pattern
    ├─ Found → Use cached plan (fast path, <500ms)
    └─ Not found → Analyze semantically
        ↓
        State: DETECTED → ANALYZING
    ↓
Actor: Execute plan
    1. Try direct deny button
    2. Try CMP-specific APIs
    3. Open settings & toggle all off
    4. Click save/confirm
    ↓
    State: ANALYZING → ACTING
    ↓
Verify: Banner closed? Toggles changed?
    ├─ Success → Learn pattern, State: ACTING → COMPLETE
    └─ Failure → Try next strategy
    ↓
Report: Send results to background, update history & badge
```

---

## 🛡️ Privacy

- **No tracking by default** — Telemetry is opt-in only
- **All processing happens locally** — Nothing is sent to external servers (except opt-in telemetry)
- **No personal data collected** — We never see what sites you visit
- **Open source** — Audit the code yourself

**Optional Anonymous Telemetry:** 
- Opt-in only (OFF by default)
- Collects only: Domain (e.g., `example.com`), CMP type, denial breakdown (consent/LI/vendors), version
- Never collects: Full URLs, personal data, browsing history, or any identifiable information
- Used only to improve CMP detection and measure extension effectiveness
- Uses free Supabase backend for aggregated analytics
- See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to set up your own telemetry backend

**What telemetry sends (when enabled):**
```json
{
  "domain": "rightmove.co.uk",
  "cmp_type": "onetrust",
  "denied_count": 402,
  "consent_denials": 5,
  "legitimate_interest_denials": 16,
  "vendor_denials": 381,
  "banner_closed": true
}
```

---

## 🤝 Contributing

Contributions welcome! To contribute:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Reporting Issues
Found a site where it doesn't work? [Open an issue](https://github.com/krshx/guardr/issues) with:
- URL of the site
- CMP type (if known)
- Screenshot of the cookie banner
- Extension popup showing results

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file for details

---

## 💬 Contact

- GitHub Issues: [krshx/guardr/issues](https://github.com/krshx/guardr/issues)
- Email: [dev+guardr@gmail.com](mailto:dev+guardr@gmail.com)

---

## ☕ Support

If this extension saves you time and protects your privacy, consider supporting development:

- [Ko-fi](https://ko-fi.com/krshx)
- [GitHub Sponsors](https://github.com/sponsors/krshx) (coming soon)

---

**Built with ❤️ for people, not platforms**
