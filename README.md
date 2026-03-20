# Guardr

![version](https://img.shields.io/badge/version-3.3.11-blue)

Guardr is a Chrome extension that automatically declines non-essential cookie consent on any website. It needs no site-specific rules — it analyses the page semantically, identifies the reject path, and takes it. Supports TCF 2.0, CCPA, OneTrust, Cookiebot, Didomi, Sourcepoint, and unrecognised CMPs via a goal-directed navigator.

---

## Install

1. Clone or download this repository
2. Run `npm run build` (or `npm run build:ext` to produce a `dist/` folder)
3. Open `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the project root (or `dist/` if you used `build:ext`)

Chrome only. Manifest V3.

---

## Build

```
npm run build         # minified IIFE → content-v3.js (~80 KB)
npm run watch         # dev build with sourcemaps, rebuilds on change
npm run build:ext     # build + copy manifest + popup + icons to dist/
npm run build:minor   # bump minor version + rebuild
npm run build:patch   # bump patch version + rebuild
```

Powered by esbuild. Typical build time: < 10 ms.

---

## How it works

Guardr runs as a Manifest V3 content script. A `MutationObserver` watches the DOM for new elements and flags anything that looks like a consent banner. The analyser scores every button and toggle semantically — using deny/accept signal libraries covering 20+ languages — and picks the best strategy. The actor executes: it tries the IAB TCF API first, then CMP-specific JavaScript APIs, then direct button clicks, and finally a goal-directed navigator that walks ENTRY → TOGGLE → SAVE phases if no direct path exists. Successful patterns are fingerprinted and replayed on repeat visits.

---

## Debug mode

Click the version string in the popup **7 times within 3 seconds** to toggle debug mode. A toast confirms the state change. With debug on, `[Guardr]` logs appear in the content script console.

---

## Privacy

No data leaves the browser by default. Guardr stores only domain-level fingerprints (no full URLs, no page content, no PII). Optional Supabase telemetry can be enabled in settings — when on, it sends only: domain, CMP type, denial counts. See `docs/guides/SUPABASE_SETUP.md` for self-hosting.

---

## Status

Chrome Web Store submission: pending
Telemetry backend: Supabase (optional, off by default)
