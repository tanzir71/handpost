# Relay

[Website](https://relay-publisher.vercel.app/) · [Safe mock demo](https://relay-publisher.vercel.app/demo)

Relay is a local-first Electron desktop scheduler that publishes by driving the real social-platform web interfaces with Playwright. Drafts, media, browser profiles, logs, and proof screenshots remain on the owner’s computer.

## Run

Requirements: Node 22+, npm, Chrome, and `ffprobe` on `PATH` for full video metadata.

```sh
npm install
npm run check
npm run dev
```

Useful commands:

- `npm run build` — production renderer and Electron bundles.
- `npm run fingerprint -- --chrome` — headed/persistent real-Chrome fingerprint self-test.
- `npm run capture -- --platform=x --step=compose --url=https://example.com` — capture a sanitized DOM fixture.
- `npm run seed -- relay.db` — seed platform account rows into a standalone database.

## Safety and privacy

Relay never automates login. Connect opens a visible persistent Chrome profile and the owner completes login and 2FA. Cookies are never exported to SQLite or logs. Global publish concurrency is one; same-platform publishes have cooldowns, configurable daily caps, jitter, and a 24-hour detection circuit breaker.

Drafts retain their selected targets, platform-specific text and first comments, X thread continuations, wizard options, and per-platform media alt text. Queue and History expose step logs, permalinks, and local proof screenshots; failed targets can open the platform composer with the post text copied to the clipboard. Export archives include media and History evidence, but never browser profiles or cookies.

## Honest caveats

- **Terms of service:** automated posting through web UIs violates most platforms’ terms even at human volume. A challenge, action block, or account loss is possible. The circuit breaker and manual fallback reduce—not remove—this risk, and Relay never hides detection events.
- **UI drift:** platform selectors will change. Per-platform selector modules, sanitized fixtures, and contract tests make repair localized. Budget for roughly one adapter repair per month.
- **Instagram and TikTok:** these are the fragile frontier. Relay uses conservative pacing and can hand content back to the owner through “Open manually” when reliable automation is unavailable.
- Live platform publishing is intentionally excluded from CI. Only the owner runs [the live checklist](docs/LIVE_TEST.md), because it uses real sessions and creates public posts.

See [Architecture](docs/ARCHITECTURE.md) and [Live testing](docs/LIVE_TEST.md).
