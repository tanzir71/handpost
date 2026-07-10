# Relay Architecture Decisions

## 2026-07-11 — Browser patching strategy
Relay uses stock Playwright with real installed Chrome plus explicit webdriver/CDP self-tests instead of depending on an unverified stealth fork. Persistent headed Chrome profiles and human-scale operation remain the primary safety controls. A maintained drop-in patch may be adopted later only after its provenance and Electron compatibility are verified.

## 2026-07-11 — Bluesky browser-first behavior
Although Bluesky offers an open API, Relay keeps the browser adapter as the default so all platforms exercise the same engine and proof pipeline. An API fallback is deliberately not implemented because it would violate the product's local browser-automation premise.

## 2026-07-11 - Target-specific publishing data

Per-platform wizard fields and media alt-text overrides are stored in `post_targets.options_json`; probed media byte size is stored in `media.size_bytes`. Keeping these values with the target and media rows makes drafts, retries, archive round-trips, and platform validation deterministic without adding platform-specific tables.

## 2026-07-11 - Persistent browser lifecycle

The scheduler reuses one persistent context per platform for the application lifetime and closes all contexts during application shutdown. Restarting a browser after every post can discard session cookies and defeats persistent-profile behavior; serialization and pacing remain scheduler concerns, while lifecycle ownership remains in `BrowserEngine`.
