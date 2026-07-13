# Relay

[Website](https://relay-publisher.vercel.app/) · [Safe mock demo](https://relay-publisher.vercel.app/demo)

> A local-first desktop scheduler that publishes to social platforms by driving their **real web interfaces** — no platform APIs, no cloud, everything on your machine.

## What is this?

Buffer-style scheduling tools rent you API access and hold your content in their cloud. Relay is an Electron desktop app that instead automates the same web composer you'd use by hand, via Playwright, from a visible Chrome profile you logged into yourself. Drafts, media, browser profiles, logs, and proof screenshots never leave your computer.

## Architecture

```
┌────────────────────────  your computer  ────────────────────────┐
│                                                                   │
│   Relay (Electron app)                                            │
│   ├─ Renderer: drafts, targets, wizard, queue, history            │
│   ├─ SQLite (relay.db): drafts, accounts, queue, step logs        │
│   │   (cookies are NEVER stored here)                             │
│   └─ Publisher engine                                             │
│        │ one publish at a time, cooldowns, daily caps, jitter,    │
│        │ 24-hour detection circuit breaker                        │
│        ▼                                                          │
│   Playwright ──► real Chrome, persistent profile per account      │
│        │         (you logged in manually; Relay never automates   │
│        │          login or exports cookies)                       │
│        ▼                                                          │
│   Per-platform selector modules (X, Instagram, TikTok, …)         │
│   + sanitized DOM fixtures + contract tests, so when a platform   │
│   changes its UI, the repair is localized to one adapter          │
│                                                                   │
│   Proof screenshots + step logs saved locally for every publish   │
└───────────────────────────────────────────────────────────────────┘
```

Deep dive: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting started (from zero)

### Prerequisites

| Tool | Why | Get it |
|---|---|---|
| Node.js 22+ | Runs the app | <https://nodejs.org> |
| Chrome | The browser Relay drives | <https://google.com/chrome> |
| `ffprobe` on PATH | Full video metadata | part of FFmpeg: <https://ffmpeg.org/download.html> |

### Run

```sh
npm install
npm run check    # lint + typecheck + tests
npm run dev      # launches the desktop app
```

First-time flow inside the app: **Connect** an account → a visible Chrome window opens → you complete login and any 2FA yourself → write a draft → pick targets → schedule or publish.

### Useful commands

| Command | What it does |
|---|---|
| `npm run build` | Production renderer and Electron bundles |
| `npm run fingerprint -- --chrome` | Headed persistent-Chrome fingerprint self-test |
| `npm run capture -- --platform=x --step=compose --url=…` | Capture a sanitized DOM fixture for adapter repair |
| `npm run seed -- relay.db` | Seed platform account rows into a standalone database |

## Safety and privacy

Relay never automates login. Connect opens a visible persistent Chrome profile and the owner completes login and 2FA. Cookies are never exported to SQLite or logs. Global publish concurrency is one; same-platform publishes have cooldowns, configurable daily caps, jitter, and a 24-hour detection circuit breaker.

Drafts retain their selected targets, platform-specific text and first comments, X thread continuations, wizard options, and per-platform media alt text. Queue and History expose step logs, permalinks, and local proof screenshots; failed targets can open the platform composer with the post text copied to the clipboard. Export archives include media and History evidence, but never browser profiles or cookies.

## Honest caveats

- **Terms of service:** automated posting through web UIs violates most platforms' terms even at human volume. A challenge, action block, or account loss is possible. The circuit breaker and manual fallback reduce — not remove — this risk, and Relay never hides detection events.
- **UI drift:** platform selectors will change. Per-platform selector modules, sanitized fixtures, and contract tests make repair localized. Budget for roughly one adapter repair per month.
- **Instagram and TikTok:** the fragile frontier. Relay uses conservative pacing and can hand content back to you through "Open manually" when reliable automation is unavailable.
- Live platform publishing is intentionally excluded from CI. Only the owner runs [the live checklist](docs/LIVE_TEST.md), because it uses real sessions and creates public posts.

## Troubleshooting

- **`ffprobe` warnings** → install FFmpeg and ensure `ffprobe` is on PATH; only video metadata depth is affected.
- **A platform suddenly fails** → likely UI drift; capture a fixture (`npm run capture`) and check the matching selector module.
- **Circuit breaker tripped** → Relay detected a challenge/block signal; it pauses that platform for 24 h. Publish manually via "Open manually" meanwhile.
