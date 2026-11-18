# Handpost

[Website](https://tanzir71.github.io/handpost/) · [Safe mock demo](https://tanzir71.github.io/handpost/demo/) · [Inbox protocol](docs/INBOX_PROTOCOL.md)

> Your posts, delivered by hand. A local-first desktop scheduler that publishes to social platforms by driving their **real web interfaces** in your own logged-in Chrome — and takes new posts from Claude, Codex or any script as plain files dropped in a folder. No platform APIs, no cloud, everything on your machine.

Handpost was previously called Relay; a Relay install's data is imported on first launch and the old folder is left untouched.

## What is this?

Buffer-style scheduling tools rent you API access and hold your content in their cloud. Handpost is an Electron desktop app that instead automates the same web composer you'd use by hand, via Playwright, from a visible Chrome (or Edge) profile you logged into yourself. Drafts, media, browser profiles, logs and proof screenshots never leave your computer.

## Architecture

```
┌────────────────────────  your computer  ────────────────────────┐
│                                                                   │
│   ~/Handpost/inbox/  ◄── files from Claude, Codex, scripts        │
│        │  (receipts/<id>.json + handpost.status.json written back)│
│        ▼                                                          │
│   Handpost (Electron app)                                         │
│   ├─ Renderer: inbox, compose, calendar, queue, history           │
│   ├─ SQLite (handpost.db): drafts, accounts, queue, step logs     │
│   │   (cookies are NEVER stored here)                             │
│   └─ Publisher engine                                             │
│        │ one publish at a time, cooldowns, daily caps, jitter,    │
│        │ 24-hour detection circuit breaker                        │
│        ▼                                                          │
│   Playwright ──► real Chrome, persistent profile per account      │
│        │         (you logged in manually; Handpost never          │
│        │          automates login or exports cookies)             │
│        ▼                                                          │
│   Per-platform selector modules (X, Instagram, TikTok, …)         │
│   + sanitized DOM fixtures + contract tests, so when a platform   │
│   changes its UI, the repair is localized to one adapter          │
│                                                                   │
│   Proof screenshots + step logs saved locally for every publish   │
└───────────────────────────────────────────────────────────────────┘
```

Deep dive: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Automation inbox

Handpost never calls an AI, and no AI ever touches a platform. The only interface is a folder: a writer — a Claude scheduled task, Claude Code, Codex, a script, or you — drops one Markdown or JSON file per post into `~/Handpost/inbox/` (`%USERPROFILE%\Handpost\inbox` on Windows). Handpost validates it, holds it for review or schedules it, publishes it from your Chrome, and keeps `receipts/<id>.json` and `handpost.status.json` up to date so the next run can learn what happened.

- Plain files, written atomically (write to `.tmp`, then rename). Every post carries an `id`, so the same file twice is a duplicate, never a double post.
- Inbox posts go through the same validation, pacing, caps, jitter and circuit breaker as posts written in the app.
- **Trust boundary:** anything that can write to the inbox folder can publish to your connected accounts. Auto-schedule starts **off**, so every file waits in the Inbox screen for your approval until you turn it on. Keep it off until you trust a writer, or have the writer use `mode: review`.

The contract is [docs/INBOX_PROTOCOL.md](docs/INBOX_PROTOCOL.md) (JSON Schemas in [`schema/`](schema/), examples in [`examples/`](examples/)). Setting up a Claude scheduled task, headless Claude Code or Codex is covered in [docs/AUTOMATION.md](docs/AUTOMATION.md); ready-made writer instructions live in [`integrations/`](integrations/).

## Installing

Installers are published on the [releases page](https://github.com/tanzir71/handpost/releases). There is no auto-updater (Handpost makes no network calls of its own), so check that page for new versions. Until the first release is out, run it from source (below).

**Google Chrome or Microsoft Edge must be installed** — Handpost drives your installed browser and does not bundle one.

- **Windows** — run `Handpost-Setup-<version>.exe` (per-user NSIS installer). The installer is not code-signed, so SmartScreen warns on first run: choose **More info → Run anyway**.
- **macOS** — open `Handpost-<version>-mac.dmg` and drag Handpost to Applications. The app is not signed or notarized, so the first time **right-click (or Control-click) Handpost → Open**, then confirm.
- **Linux** — download `Handpost-<version>-linux-x64.AppImage`, then `chmod +x Handpost-*.AppImage` and run it.

Your data lives in the app data folder (`%APPDATA%\Handpost\` on Windows) and the Handpost folder (`~/Handpost/`). Uninstalling leaves both in place.

## Running from source

### Prerequisites

| Tool | Why | Get it |
|---|---|---|
| Node.js 22+ | Runs the app | <https://nodejs.org> |
| Google Chrome or Microsoft Edge | The browser Handpost drives | <https://google.com/chrome> |
| `ffprobe` on PATH | Full video metadata | part of FFmpeg: <https://ffmpeg.org/download.html> |

### Run

```sh
npm ci
npm run check    # lint + format + typecheck + unit + contract + e2e-lite + fingerprint
npm run dev      # launches the desktop app (npm run dev:edge to drive Microsoft Edge)
```

First-time flow inside the app: **Connect** an account → a visible Chrome window opens → you complete login and any 2FA yourself → **Rehearse** fills the real composer and stops before posting → write a draft (or drop a file in the inbox) → pick targets → schedule or publish.

### Useful commands

| Command | What it does |
|---|---|
| `npm run build` | Production renderer and Electron bundles |
| `npm run dist` | Installer for the current OS into `release/` |
| `npm run inbox:smoke` | Runs the example inbox files through the real inbox service against the local MockSocial site only |
| `npm run fingerprint -- --chrome` | Headed persistent-Chrome fingerprint self-test |
| `npm run browser:info` | Shows which Chrome / Edge Handpost will drive |
| `npm run capture -- --platform=x --step=compose --url=…` | Capture a sanitized DOM fixture for adapter repair |
| `npm run seed -- handpost.db` | Seed platform account rows into a standalone database |
| `npm run website:verify` | Static checks for the GitHub Pages site in `site/` (run `node scripts/site-schema.mjs` first) |
| `npm run website:browser` | Loads the site under `/handpost/` in headless Chromium at four widths |

## Safety and privacy

Handpost never automates login. Connect opens a visible persistent Chrome profile and the owner completes login and 2FA. Cookies are never exported to SQLite or logs. Global publish concurrency is one; same-platform publishes have cooldowns, configurable daily caps, jitter, and a 24-hour detection circuit breaker. The app makes no network calls except to the platforms (through Chrome) and an opt-in Git remote source: no telemetry, no update pings, no CDN fonts.

Drafts retain their selected targets, platform-specific text and first comments, X thread continuations, wizard options, and per-platform media alt text. Queue and History expose step logs, permalinks, and local proof screenshots; failed targets can open the platform composer with the post text copied to the clipboard. Export archives include media and History evidence, but never browser profiles or cookies.

## Honest caveats

- **Terms of service:** automated posting through web UIs violates most platforms' terms even at human volume. A challenge, action block, or account loss is possible. The circuit breaker and manual fallback reduce — not remove — this risk, and Handpost never hides detection events.
- **UI drift:** platform selectors will change. Per-platform selector modules, sanitized fixtures, and contract tests make repair localized. Budget for roughly one adapter repair per month.
- **Instagram and TikTok:** the fragile frontier. Handpost uses conservative pacing and can hand content back to you through "Open manually" when reliable automation is unavailable.
- **Inbox trust boundary:** any process that can write to `~/Handpost/inbox/` can publish to your connected accounts. Keep auto-schedule off (the default) until you trust every writer.
- Live platform publishing is intentionally excluded from CI. Only the owner runs [the live checklist](docs/LIVE_TEST.md), because it uses real sessions and creates public posts.

## Troubleshooting

- **`ffprobe` warnings** → install FFmpeg and ensure `ffprobe` is on PATH; only video metadata depth is affected.
- **"Install Google Chrome" in Accounts** → install Chrome or Edge; `npm run browser:info` shows what Handpost found.
- **A platform suddenly fails** → likely UI drift; capture a fixture (`npm run capture`) and check the matching selector module.
- **Circuit breaker tripped** → Handpost detected a challenge/block signal; it pauses that platform for 24 h. Publish manually via "Open manually" meanwhile.
- **An inbox file never leaves `inbox/`** → see the checklist in [docs/AUTOMATION.md](docs/AUTOMATION.md#checking-that-it-works).

## Support

Handpost is free. If it saves you a scheduler subscription, a coffee keeps the late-night builds going: [buymeacoffee.com/tanzir](https://buymeacoffee.com/tanzir).

## License

[MIT](LICENSE) © 2026 Tanzir Rahman. The bundled fonts keep their own SIL Open Font License files next to them.
