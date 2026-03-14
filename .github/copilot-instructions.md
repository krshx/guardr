# Guardr — GitHub Copilot Instructions

## WHAT
Guardr is a **Chrome MV3 extension** that silently and autonomously denies non-essential cookie consent on any website. No site-specific rules — universal semantic analysis handles any CMP (OneTrust, Cookiebot, Sourcepoint, Didomi, Usercentrics, TrustArc, Quantcast, and Generic).

**Current version:** 3.1.x  
**Stack:** Vanilla JS (ES6 modules) · Chrome MV3 · Custom IIFE bundler (`build.js`) · Chrome Storage API

## WHY
Cookie consent banners default to "Accept All". Users who want to deny must navigate complex multi-step preference panels. Guardr automates denial silently on every page load — success means: banner dismissed, non-essential toggles OFF, site records "reject all", page continues working normally.

## Architecture — 6 Core Design Principles

| Principle | Rule |
|-----------|------|
| **Event-Driven** | MutationObserver reacts to DOM changes. Zero polling. Never use `sleep()` or `setTimeout` for sequencing — use `waitForElement` / `waitForRemoval`. |
| **State Machine** | Deterministic lifecycle: `IDLE → DETECTED → ANALYZING → ACTING → COMPLETE/FAILED`. All transitions validated. Never mutate state outside `state-machine.js`. |
| **Universal Detection** | Semantic scoring only — no site-specific selectors hardcoded outside `constants.js`. New CMP support = update `CMPSignatures` in constants, not scattered `if` blocks. |
| **Self-Learning** | Fingerprint successful patterns, replay automatically. Confidence threshold for replay: ≥70%. Promotion to library: 10+ uses, 3+ domains, ≥85% confidence. |
| **Modular — <300 lines/module** | Single responsibility per file. No module imports from more than its direct dependency tier. |
| **Fail-Fast** | Every external operation has a timeout. On failure: transition to `FAILED → IDLE`, never hang. |

## Module map & Responsibilities

```
constants.js   → enums, signals (400+ phrases, 20+ languages), selectors, timing
utils.js       → DOM helpers, logging, storage wrappers
state-machine.js → lifecycle management, lock system, timeout
detector.js    → MutationObserver + rescan ladder (+1s/+2s/+4s)
analyzer.js    → semantic classify → ActionPlan (strategy + confidence)
actor.js       → execute ActionPlan (CMP APIs → direct deny → toggle → settings → fallback)
learning.js    → fingerprint, store, retrieve, confidence scoring (Bayesian)
index.js       → orchestrator — wires all modules, handles messaging
background.js  → service worker: history, badge, telemetry, cross-tab sync
```

**Build:** `node build.js` bundles `src/*.js` → `content-v3.js` as a single IIFE.  
Module load order (non-negotiable — dependencies first):  
`constants → utils → state-machine → detector → analyzer → actor → learning → index`

## Critical Known Issues — Check Before Touching These Areas

| Issue | Affected files | Details |
|-------|---------------|---------|
| **False positive detection** | `detector.js` `_broadScan` | Triggered on Google nav bar causing page redirects. The `_hasSufficientConsentContent()` gate exists to prevent this — do NOT lower its threshold. |
| **Iframe CMP API timing** | `actor.js` `_executeCMPApiDeny` | Sourcepoint `window._sp_` / `__tcfapi` must be polled (up to 3000ms), not called immediately. The poll loop is load-bearing. |
| **State machine noise** | `state-machine.js` | `COMPLETE → COMPLETE` and `FAILED → FAILED` must be silent no-ops, not logged as errors — already fixed; don't revert this. |
| **Bundle integrity** | `build.js` | Must handle multi-line `import` blocks and strip all `import`/`export` keywords. Any remnant causes silent breakage in Chrome. Always test bundle by loading unpacked in Chrome after build. |
| **Deny button threshold** | `analyzer.js` `_determineStrategy` | Confidence threshold for `direct-deny` strategy is intentionally LOW (≥40). The original ≥85 caused systematic misses on obvious "Reject All" buttons. Do NOT raise it. |

## Semantic Scoring — Do Not Change Weights Without Evidence

```js
ScoringWeights: {
  TEXT_MATCH: 10, ARIA_MATCH: 8, CLASS_MATCH: 5, ID_MATCH: 5,
  TITLE_MATCH: 3, NEGATIVE_SIGNAL: -5, POSITION_PRIMARY: 2,
  SIZE_PROMINENT: 2, COLOR_CTA: 2
}
```
Changes to these weights affect detection accuracy across all sites. Only change with before/after test results on the 100-site test suite.

## ActionPlan Strategies — Execution Order in actor.js

1. CMP JavaScript APIs (Sourcepoint → Didomi → Cookiebot → OneTrust → Usercentrics)
2. `direct-deny` — click highest-scored deny button
3. `toggle-and-save` — disable all non-essential toggles, click save
4. `toggle-only` — disable toggles, no save button
5. `open-settings` — click settings/preferences, re-analyze inner panel
6. `close-only` — dismiss without explicit denial
7. Fallback — try all strategies in order

## Detector — What It MUST NOT Do
- Click anything
- Follow links
- Navigate the page
- Modify the DOM

It only observes and emits `BANNER_DETECTED`. The actor does all mutation.

## Build & Test Workflow
```bash
node build.js                    # bundle src/ → content-v3.js
# Load /guardr as unpacked extension in Chrome → test on a cookie-banner site
```
No build toolchain (no webpack/rollup/npm) — the custom `build.js` is intentional to keep the extension self-contained and auditable.

## File Naming & Placement Conventions
- Source modules: `src/*.js` — one responsibility, <300 lines
- Generated output: `content-v3.js` — **never edit directly**, always regenerate via `node build.js`
- Constants only in: `src/constants.js` — no magic strings elsewhere
- New CMP support: add to `CMPSignatures` + `CMPContainerPatterns` in `constants.js`, add API call to `actor.js` `_executeCMPApiDeny()`

## Paywall Detection — Never Act on These
If `detector.js` detects `PaywallSignals` (consent-or-pay walls), it sets `isPaywall: true` on the event. The orchestrator must abort — do not attempt denial on paywalls, the site legitimately requires a choice.

## What I Should NOT Do
- Do not add `sleep()` / arbitrary `setTimeout` delays for sequencing
- Do not add site-specific selectors outside `constants.js`
- Do not change the module load order in `build.js`
- Do not hand-edit `content-v3.js` — it is always overwritten by the bundler
- Do not raise the `direct-deny` confidence threshold above 40
- Do not lower the `_broadScan` gate threshold — it prevents false positives
- Do not add polling to the detector — it is MutationObserver only
