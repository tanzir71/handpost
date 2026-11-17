# CLAUDE.md — Handpost

Handpost (formerly “Relay”) is a local-first Electron app that schedules social posts and publishes them by driving the owner's own logged-in Chrome with Playwright. It also accepts posts as files dropped into `~/Handpost/inbox/` by Claude scheduled tasks, Claude Code or Codex, and writes receipts back.

**Read `CLAUDE_CODE_HANDOFF.md` in full before your first change.** It is the source of truth; `CODEX_HANDOFF.md` is the original spec and still applies wherever the new handoff is silent.

## Every session
1. Read `PROGRESS.md`; take the lowest milestone (H0…H10) not marked DONE.
2. If that milestone has failing acceptance criteria, fix those before adding anything.
3. Make the smallest coherent change, then run `npm run check` and fix everything it reports.
4. Update `PROGRESS.md`: did · verified (exact commands + results) · next · needs-owner.
5. Append non-obvious architectural choices to `DECISIONS.md` (one paragraph each).
6. Commit on `master` with a conventional message (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `style:`). Push or tag only when the owner asks.

## Hard rules
- Never automate login, type passwords, solve 2FA, or store credentials/cookies anywhere but Playwright profile directories.
- Never delete or weaken a test to make it pass. Never mark acceptance criteria passed without running their verification command.
- Live posting to real platforms is owner-only. Never fake a live result. **Rehearse mode must never reach the submit step.**
- The app makes no network calls except the platforms (through Chrome) and the opt-in Git remote source. No telemetry, update pings, CDN fonts or analytics — in the app and on the website.
- `docs/INBOX_PROTOCOL.md` is a public contract. Changing it means a version bump and updating `schema/`, `integrations/`, `examples/` and tests in the same commit.
- Inbox posts go through the same validation, pacing, caps, jitter and circuit breaker as posts made in the app. No bypasses.
- Keep the honest caveats (ToS risk, UI drift, fragile platforms) in README, the site and the app.

## Commands
```sh
npm ci                 # install (rebuilds better-sqlite3 for Electron)
npm run check          # lint + typecheck + unit + contract + e2e-lite + fingerprint (+ format:check after H0)
npm run dev            # Vite + Electron
npm run build          # production bundles
npm run website:verify # static site checks (updated in H8)
```

## Map
- `src/main/` — Electron main: `scheduler/`, `engine/` (Playwright, humanizer), `adapters/<platform>/`, `db/` (+ `migrations/`), `ipc/`, `media/`, `data/` (CSV, archive), `inbox/` (new in H2)
- `src/renderer/` — React UI; `src/shared/` — types, zod IPC schemas, capability manifests
- `tests/unit`, `tests/contract` (DOM fixtures), `tests/e2e` (MockSocial), `tests/fixtures/`
- `site/` — static landing page + `demo/` (GitHub Pages after H8)
- `docs/` — protocol, design, landing, automation, architecture, live test
- `integrations/` — Claude skill and Codex AGENTS.md for inbox writers; `examples/` — protocol examples; `schema/` — JSON Schemas

## Design
Figma: https://www.figma.com/design/1Tf42IZ4d88k6Hk7lRnRx6/Handpost (file key `1Tf42IZ4d88k6Hk7lRnRx6`). Node ids for every screen and component are in `docs/DESIGN.md`. With the Figma MCP connected, use `get_design_context` / `get_screenshot` on those nodes; variables carry their CSS names (`var(--hp-…)`). Without it, `docs/DESIGN.md` is complete enough to build from.

## Environment notes
The owner develops on Windows. Keep paths cross-platform (`node:path`, no shell-specific scripts), LF line endings (`.gitattributes` from H0), and test anything touching the file system with both `/` and `\` inputs.
