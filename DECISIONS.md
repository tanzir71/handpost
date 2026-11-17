# Relay Architecture Decisions

## 2026-07-11 — Browser patching strategy
Relay uses stock Playwright with real installed Chrome plus explicit webdriver/CDP self-tests instead of depending on an unverified stealth fork. Persistent headed Chrome profiles and human-scale operation remain the primary safety controls. A maintained drop-in patch may be adopted later only after its provenance and Electron compatibility are verified.

## 2026-07-11 — Bluesky browser-first behavior
Although Bluesky offers an open API, Relay keeps the browser adapter as the default so all platforms exercise the same engine and proof pipeline. An API fallback is deliberately not implemented because it would violate the product's local browser-automation premise.

## 2026-07-11 - Target-specific publishing data

Per-platform wizard fields and media alt-text overrides are stored in `post_targets.options_json`; probed media byte size is stored in `media.size_bytes`. Keeping these values with the target and media rows makes drafts, retries, archive round-trips, and platform validation deterministic without adding platform-specific tables.

## 2026-07-11 - Persistent browser lifecycle

The scheduler reuses one named persistent context per platform across a queued publishing batch, then closes it when the global queue becomes idle; application shutdown also drains the queue and closes any login/manual contexts. This satisfies the idle-memory target while retaining the persistent on-disk Chrome profile across batches. MockSocial uses an expiring persistent cookie so restart survival is covered without relying on session-only cookie behavior.

## 2026-11-18 - Handover to Claude Code: Handpost

D1 Name: the product is Handpost (repo tanzir71/handpost); user data is copied from the old Relay location on first run, never moved.
D2 Automation is a folder protocol, not an API: writers drop files in ~/Handpost/inbox/, Handpost writes receipts/ and handpost.status.json back (docs/INBOX_PROTOCOL.md). It works with Claude scheduled tasks on the owner's computer, headless Claude Code/Codex runs, sync folders, and an opt-in pulled Git repo for cloud-only writers. A local MCP server is backlog and may only write the same files.
D3 The inbox schema is strict: unknown fields reject the file, because catching a writer's typo before anything posts is worth more than leniency; receipts explain every rejection.
D4 Inbox posts obey every existing guardrail (concurrency 1, cooldowns, caps, jitter, circuit breaker, manual login); the inbox never bypasses the engine.
D5 Design is "paper, ink & airmail": warm paper canvas, ink-blue actions, airmail red/blue for brand only, Instrument Serif / Instrument Sans / IBM Plex Mono self-hosted, light and dark from one token set (system default). Supersedes the dark-only UI of the original spec. Tokens meet WCAG AA 4.5:1 for small text.
D6 Logo is a perforated postage stamp with an italic serif "h" (direction C, chosen by the owner).
D7 The website moves from Vercel to GitHub Pages, static, relative URLs, no third-party requests.
D8 A Buy Me a Coffee CTA (https://buymeacoffee.com/tanzir) sits directly above the landing-page footer and in the footer, README and Settings > About, as a plain link with no widget script.
D9 Defaults: Handpost folder ~/Handpost; Auto-schedule on only after the owner confirms a one-time explanation of the inbox trust boundary; status file includes text previews (toggle).
