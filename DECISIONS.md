# Relay Architecture Decisions

## 2026-07-11 — Browser patching strategy
Relay uses stock Playwright with real installed Chrome plus explicit webdriver/CDP self-tests instead of depending on an unverified stealth fork. Persistent headed Chrome profiles and human-scale operation remain the primary safety controls. A maintained drop-in patch may be adopted later only after its provenance and Electron compatibility are verified.

## 2026-07-11 — Bluesky browser-first behavior
Although Bluesky offers an open API, Relay keeps the browser adapter as the default so all platforms exercise the same engine and proof pipeline. An API fallback is deliberately not implemented because it would violate the product's local browser-automation premise.
