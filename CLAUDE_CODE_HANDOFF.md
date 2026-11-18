# CLAUDE CODE HANDOFF — Handpost

> **Audience:** Claude Code, working in this repository over many sessions.
> **Owner:** Tanzir Rahman (single user; Windows is the primary dev and run machine).
> **Goal:** turn the existing “Relay” prototype into **Handpost**, a fully working, installable desktop app whose posts can be scheduled fully automatically by Claude scheduled tasks, Claude Code or Codex dropping files into a folder — plus a landing page on GitHub Pages.
> **Source of truth:** this file. `CODEX_HANDOFF.md` is the original spec and stays valid for everything this file doesn't change (anti-detection posture, error taxonomy, adapter rules, non-goals). Record deviations in `DECISIONS.md`.

Companion documents (all in this commit):

| File | What it is |
|---|---|
| `CLAUDE.md` | Session protocol and hard rules (auto-loaded by Claude Code) |
| `docs/INBOX_PROTOCOL.md` | **Normative** spec of the folder protocol writers use |
| `schema/handpost-post.v1.schema.json` | JSON Schema for inbox files |
| `examples/` | Valid inbox files, a receipt and a status file (become test fixtures) |
| `integrations/claude/handpost-inbox/SKILL.md` | Skill Claude scheduled tasks use to write inbox files |
| `integrations/codex/AGENTS.md` | Same rules for Codex |
| `docs/AUTOMATION.md` | User-facing setup guide for scheduled writers |
| `docs/DESIGN.md` | Design tokens, components, screen specs, Figma node ids |
| `docs/LANDING_PAGE.md` | Landing page spec, copy, GitHub Pages deploy |
| Figma | https://www.figma.com/design/1Tf42IZ4d88k6Hk7lRnRx6/Handpost |

---

## 0. TL;DR

The engine already works against fixtures and a mock site: scheduler, queue, retries, circuit breaker, per-platform adapters, media, CSV import, export/import, 46 unit tests, 22 contract tests, an end-to-end mock pipeline. What it lacks to be a real product:

1. a name and a face (rename to Handpost, new design system, rebuilt screens);
2. **the automation inbox** (the headline feature: Claude/Codex write files → Handpost schedules and posts → receipts flow back);
3. live readiness (real profile URLs for verification, a safe *Rehearse* mode, Chrome detection);
4. an installer and releases;
5. a landing page on GitHub Pages with a Buy Me a Coffee call-to-action near the footer.

Work through milestones **H0 → H10** in order (§4). Each has acceptance criteria and the command that proves them.

---

## 1. Audit of the current repository (2026-11-18)

**Solid, keep:** Electron main/renderer split with zod-validated IPC (`src/shared/ipc.ts`); SQLite migrations (`src/main/db`); scheduler with jitter, cooldowns, caps, overdue handling and circuit breaker (`src/main/scheduler`); config-driven adapters with primary + fallback selectors (`src/main/adapters/configs.ts`, `factory.ts`); sanitized fixtures + contract tests; MockSocial e2e; humanizer; local redacted logging; honest README caveats.

**Gaps and defects found:**

| # | Finding | Where | Fixed in |
|---|---|---|---|
| G1 | Product was still called Relay everywhere. **App side fixed 2026-11-18** (see PROGRESS.md); README, docs and the website still say Relay. | repo-wide | H1 ✓ app, H8 site |
| G2 | No `.gitattributes`: line endings depend on each machine's git config. The Windows checkout is CRLF, so any git without `core.autocrlf` (WSL, a Linux VM, CI caches) sees every file as modified (`git diff --ignore-cr-at-eol --stat` is empty). | repo | H0 |
| G3 | Most TypeScript is written as minified one-liners; hard to review or repair adapters quickly. | `src/**` | H0 |
| G4 | `RelaySnapshot` and many props are `any[]`. | `src/shared/api.ts`, renderer | H0 |
| G5 | Verification navigates to placeholder profile URLs that don't exist for real users: `bsky.app/profile/me`, `threads.net/@me` (X fixed 2026-11-18 via the nav profile link + status permalink). | `adapters/configs.ts` | H6 |
| G6 | No safe way to check selectors on real platforms without posting publicly. | engine | H6 (Rehearse) |
| G7 | No packaging: no electron-builder/forge, no icons, no installer, no release workflow. Real Chrome is required (`channel:'chrome'`) but its absence only shows as a crash. | `package.json`, `browser.ts` | H6, H7 |
| G8 | Queue slots are edited as free text `1@09:00, 3@15:30`; `queuePost` throws when no slots exist. | `Accounts.tsx`, `handlers.ts` | H4, H2 |
| G9 | Settings accept only two keys (`launchAtLogin`, `notifications`). | `shared/ipc.ts` | H2, H4 |
| G10 | Website deploys to Vercel, uses root-absolute URLs (`/styles.css`, `/demo/`) that break on a GitHub Pages project site, and links the old repo `tanzir71/scheduler`. | `site/`, `vercel.json` | H8 |
| G11 | Owner live gates from the Codex handoff (M2 real-Chrome fingerprint, M3/M6/M8/M9 live smoke) were never run. | `docs/LIVE_TEST.md` | needs-owner, helped by H6 |
| G12 | No automation entry point other than manual CSV import. | — | H2, H5 |

---

## 2. Decisions already made (also recorded in DECISIONS.md)

- **D1 Name.** The product is **Handpost** (repo `tanzir71/handpost`). User data migrates from the old Relay location on first run (H1).
- **D2 Automation = folder protocol.** Scheduled writers integrate through files, not an API: `~/Handpost/inbox/` in, `receipts/` + `handpost.status.json` out. Works with Claude scheduled tasks on the owner's computer, Claude Code/Codex headless runs, sync folders, and (optionally) a pulled Git repo for cloud-only writers. Spec: `docs/INBOX_PROTOCOL.md`. A local MCP server is backlog, and if built must only write the same files.
- **D3 Strict schema.** Unknown fields reject the file. Catching an LLM's typo before anything posts beats leniency; receipts explain the rejection.
- **D4 Inbox posts obey every guardrail** (concurrency 1, cooldowns, daily caps, jitter, circuit breaker, manual login). Inbox never bypasses the engine.
- **D5 Design.** “Paper, ink & airmail”: warm paper canvas, ink-blue actions, airmail red/blue for brand only; Instrument Serif / Instrument Sans / IBM Plex Mono, self-hosted. Light and dark themes from the same tokens; theme follows the system by default. This replaces the old dark-only mint UI (the original spec's “dark mode default” is superseded).
- **D6 Logo.** Perforated postage stamp with an italic serif “h” (direction C, chosen by the owner 2026-11-18). Figma `4:161`.
- **D7 Website on GitHub Pages**, static, no third-party requests; Vercel removed.
- **D8 Support link.** A Buy Me a Coffee CTA (“Tanzir Rahman is — Fueling open-source code, local utilities, and late-night builds.” → https://buymeacoffee.com/tanzir) sits directly above the landing-page footer and in the footer, README and Settings → About. Plain link, no widget script.
- **D9 Defaults.** Handpost folder `~/Handpost`; Auto-schedule **on** after the owner confirms a one-time explanation (until then items are held); status file includes text previews (toggle).

---

## 3. Architecture after this handoff

```
┌──────────────────────────────── owner's computer ─────────────────────────────────┐
│                                                                                     │
│  Claude scheduled task / Claude Code / Codex / scripts                              │
│        │ write inbox/<id>.md (atomic)            ▲ read receipts/, status.json       │
│        ▼                                         │                                   │
│  ~/Handpost/ ── inbox/ ── processed/ ── rejected/ ── receipts/ ── handpost.status.json│
│        │ watch + 60 s rescan                     ▲ atomic writes                     │
│  ┌─────┴──────────── Handpost (Electron main) ───┴────────────────────────────┐      │
│  │ InboxService ─► parse ─► validate ─► idempotency ─► media ─► time ─► commit │      │
│  │        │                                                       │           │      │
│  │        ▼                                                       ▼           │      │
│  │   SQLite (posts, post_targets, media, inbox_items, attempts…)  ◄── Scheduler│     │
│  │                                                    (tick 30 s, p-queue 1)   │      │
│  │                                                        │                    │      │
│  │                                   Playwright ─► real Chrome, persistent     │      │
│  │                                   profile per platform (manual login only)  │      │
│  └────────────────────────────── IPC (zod) ───────────────────────────────────┘      │
│                                     ▲                                                │
│  Renderer (React): Inbox · Compose · Calendar · Queue · Accounts · History · Settings│
└─────────────────────────────────────────────────────────────────────────────────────┘
Optional: Git remote source ─(git pull every 5 min)─► .sources/<name>/inbox/  (off by default)
```

---

## 4. Milestones

Format per milestone: **Tasks**, **Accept** (all must hold), **Verify** (commands you must run before marking DONE). `npm run check` must be green at the end of every milestone and every commit.

### H0 — Baseline hygiene (no behaviour change)
**Tasks**
- Add `.gitattributes` (`* text=auto eol=lf`; `*.png *.ico *.icns *.woff2 *.zip binary`). Confirm `git diff --ignore-cr-at-eol --stat` is empty, then `git add --renormalize .` in its own commit.
- Add Prettier (`printWidth: 110`, single quotes) and format `src/`, `tests/`, `scripts/` in one commit titled `style: format codebase (no logic change)`. Add `format:check` to `npm run check`.
- Replace `any` in `src/shared/api.ts` and renderer props with row types in `src/shared/rows.ts`; enable `@typescript-eslint/no-explicit-any: error` for `src/`.
- D1–D9 were appended to `DECISIONS.md` and `PROGRESS.md` was reset to the H-milestones with the handover commit; keep both current from here on (template in §9).
**Accept** no test files changed except imports/types; zero `any` in `src/`; check green on Windows and in CI.
**Verify** `npm ci && npm run check && npm run build`; `git diff --stat HEAD~3 -- tests | tail -1`.

### H1 — Rename to Handpost + data migration
**Tasks**
- `package.json`: `name: "handpost"`, `productName: "Handpost"`, version `0.2.0` (first Handpost line), `description`. App id `com.tanzir.handpost`. Window title, tray tooltip/menu, notifications, logger, README, docs, site, `llms.txt`.
- Code identifiers: `RelayDatabase` → `HandpostDatabase`, `relayApi` → `handpostApi`, `RELAY_DEV_SERVER_URL` → `HANDPOST_DEV_SERVER_URL`, DB file `handpost.db`, `relay-data/` → `handpost-data/`, `data-relay` → `data-handpost` in fixtures, configs and mock server together.
- Migration (`src/main/migrate-legacy.ts`, runs before `openDatabase`): if `app.getPath('appData')/relay-scheduler` exists and the new userData dir has no `handpost.db`, **copy** (never move) `relay.db*` → `handpost.db*`, `profiles/`, `media/`, `artifacts/`, `logs/`; write `migrated-from-relay.json`; show a one-time notification. Never touch the old folder.
**Accept** `git grep -i relay -- src site scripts tests` only hits the migration module and its test; migration unit test with a temp dir covers: nothing to migrate, migrate, already migrated.
**Verify** `npm run check`; `npm run dev` shows “Handpost”.

### H2 — Inbox service (backend, test-first)
Implement `docs/INBOX_PROTOCOL.md` exactly. Guide in §5.
**Accept**
- Every row of the test matrix in §5.6 is a passing test.
- `examples/inbox/*` copied to `tests/fixtures/inbox/` validate against the JSON Schema and are accepted.
- e2e-lite extended: a test writes `inbox/*.md` targeting `mock` into a temp Handpost folder → MockSocial publishes → `receipts/<id>.json` reaches `published` with URL; a second identical file yields `duplicate` and no second MockSocial post.
- Crash test: kill between DB commit and file move → restart → exactly one post.
**Verify** `npm run check` (unit + e2e-lite); `npm run test -- inbox`.

### H3 — Design system in the renderer
**Tasks** tokens (`docs/DESIGN.md` §2) into `src/renderer/styles/tokens.css`; self-hosted fonts; theme setting (System/Light/Dark, stored as `theme`); components from DESIGN §4 in `src/renderer/ui/` (Button, StatusPill, PlatformBadge, SourceChip, NavItem, Toggle, Field, Card, AirmailStripe, Receipt, EmptyState); new Sidebar with watcher card (fed by an `inbox-health` IPC); brand assets (favicon, stamp SVG, tray icon from the mark). Dev-only route `#/__gallery` rendering every component in both themes.
**Accept** a unit test computes WCAG contrast for every text/background token pair used in DESIGN §2 and asserts ≥ 4.5 (≥ 3 for large display text); gallery renders without console errors (`scripts/verify-ui.ts` extended); no hard-coded hex colours in `src/renderer` outside `tokens.css` (lint rule or test grep).
**Verify** `npm run check`; screenshot the gallery and compare with Figma Foundations `0:1`.

### H4 — Screens per Figma
**Tasks** rebuild Inbox (new), Compose, Queue, Accounts, Settings (tabs; Automation tab), restyle Calendar and History, per `docs/DESIGN.md` §5. New/changed IPC: `inbox-list`, `inbox-approve`, `inbox-reject`, `inbox-open`, `inbox-choose-folder`, `inbox-health`, `pacing-today`, `breakers`; extend `settingSchema` with `theme`, `inbox.path`, `inbox.autoSchedule`, `inbox.writeStatus`, `inbox.statusPreviews`, `inbox.allowOutsideMedia`, `git.enabled`, `git.url`. Slots & caps modal replaces the `weekday@HH:MM` text field; `queue-post` with no slots uses the default template (09:30, 17:30) instead of throwing. Settings → About shows version, links and the Buy Me a Coffee line.
**Accept** each screen visually matches its Figma frame at 1440×900 (use `get_screenshot` on the node ids if the Figma MCP is available); existing renderer tests updated, none weakened; new tests for Inbox list filtering, approve/reject flows, slot editor, and Compose schedule modes; keyboard-only walkthrough of every screen; empty states on every screen.
**Verify** `npm run check`; `npx tsx scripts/verify-ui.ts` (navigation, console, overlay, screenshots of all screens in both themes).

### H5 — Writer integrations
**Tasks** keep `integrations/claude/handpost-inbox/SKILL.md`, `integrations/codex/AGENTS.md`, `docs/AUTOMATION.md` in sync with the implementation; on first run write `~/Handpost/README.txt` and `~/Handpost/HANDPOST_WRITER.md` (copy of the skill); Settings → Automation *Copy prompt*, *Copy AGENTS.md into Handpost folder*, *Open protocol*; generate `schema/handpost-post.v1.schema.json` from the zod schema (`zod-to-json-schema`) and add a test that the committed file equals the generated one; add `schema/handpost-status.v1.schema.json` and `schema/handpost-receipt.v1.schema.json` and validate the app's real outputs against them in tests.
**Accept** schema-equality test passes; every code block in SKILL.md and AGENTS.md that is a complete file validates (test extracts fenced blocks with `handpost: 1`); a dry-run script `npm run inbox:smoke` copies `examples/inbox/*` into a temp Handpost folder with a MockSocial account and prints the receipts.
**Verify** `npm run check`; `npm run inbox:smoke`.

### H6 — Live readiness
**Tasks**
- Migration `005_account_identity.sql` (or within 004): `accounts.handle`, `accounts.profile_url`. After manual login, detect the handle per platform (selectors in each `adapters/<p>/selectors.ts`, e.g. X account switcher, Bluesky profile link) and store it; verification uses `profile_url` (remove `x.com/profile`, `bsky.app/profile/me`, `threads.net/@me` placeholders). If unknown, ask the owner in the Accounts card (“Your profile URL”).
- **Rehearse** mode: `adapter.publish(ctx, post, report, { rehearse: true })` runs every step up to but **not including** `submit`, screenshots the filled composer, then discards (Escape/close, confirm “Discard”) and records a `rehearsal` attempt. Guard in `factory.ts` so the submit click is unreachable when `rehearse` is true; contract tests assert `submit` is never invoked for every platform fixture.
- Chrome detection on startup (Playwright `chromium.executablePath` for channel `chrome` / known install paths); Accounts footer shows version or a clear “Install Google Chrome” empty state; scheduler marks targets `needs_attention: chrome_missing` instead of throwing.
- `npm run fingerprint -- --chrome` documented in Accounts → Rehearse help.
**Accept** rehearsal contract tests for all 9 platforms; unit tests for handle → profile URL per platform; no placeholder profile URLs remain.
**Verify** `npm run check`; `npm run contract`.
**Needs-owner** Rehearse each connected platform once and confirm the screenshots look right; then run `docs/LIVE_TEST.md`.

### H7 — Packaging and releases
**Tasks** `electron-builder` config: Windows NSIS (per-user install, desktop shortcut optional), macOS dmg (unsigned is acceptable; document Gatekeeper right-click → Open), Linux AppImage; `asarUnpack` for `better-sqlite3` and SQL migrations; icons from Figma `brand/app-icon` `12:79` (`build/icon.png` 1024, `.ico`, `.icns`); `npm run dist`. GitHub Actions `release.yml` on tag `v*`: matrix windows-latest / macos-latest / ubuntu-latest → `npm ci && npm run check && npm run dist` → upload to a draft GitHub Release. No auto-updater (privacy promise); About shows the version and a “Check releases” link that only opens the browser.
**Accept** CI builds all three artifacts; installing the Windows build on a clean profile launches, creates `%APPDATA%/Handpost/handpost.db` and `~/Handpost/`, and runs the inbox smoke.
**Verify** `npm run dist` locally on Windows; tag `v0.2.0-rc.1` on a branch to exercise the workflow (ask the owner before pushing tags).

### H8 — Landing page on GitHub Pages
Implement `docs/LANDING_PAGE.md` (Figma `15:80`), including the Buy Me a Coffee section above the footer and the footer link; restyle `site/demo/`; Pages workflow; remove Vercel files; README “Support” section.
**Accept / Verify** as listed in LANDING_PAGE §4.
**Needs-owner** enable Pages (Settings → Pages → Source: GitHub Actions).

### H9 — Remote Git source (optional, after H2–H8)
Per INBOX_PROTOCOL §12, using the system `git` via `child_process.execFile` (no shell), clone into `~/Handpost/.sources/<name>`, pull every 5 min with a 60 s timeout, read-only by default; “push receipts” opt-in. Health shown in the watcher card. Tests with a local bare repo.

### H10 — Refinement loop
Continue `CODEX_HANDOFF.md` §13 (drift audit, failure-mode hunt, perf, UX, test depth, docs) with two additions: inbox fuzzing (random/malformed files must never crash the service or double-post) and receipt/state consistency audits. Backlog: local MCP server (`handpost-mcp`) whose tools only write inbox files and read receipts/status.

---

## 5. Inbox implementation guide (H2)

### 5.1 Modules
```
src/shared/inbox-schema.ts   zod schema for protocol v1 (post, batch, cancel) + types + error/warning code enums
src/main/inbox/
  paths.ts       Handpost folder resolution, ensureLayout(), ignore rules
  fsx.ts         atomicWrite(path,data), safeMove(src,dst) (rename; EXDEV → copy+fsync+unlink), uniqueName()
  parse.ts       BOM strip, CRLF→LF, front matter split, YAML 1.2 core (`yaml` pkg: {schema:'core', maxAliasCount:50, customTags:[]}), JSON; Date → ISO
  normalize.ts   defaults; override mapping (thread → options.threadParts JSON, snake_case options → adapter keys); content hash
  resolve-time.ts  when → per-target UTC (reuse scheduler/slots.ts nextFreeSlot + zonedDateTimeToUtc); late/stale rules
  media.ts       realpath inside-root check, existence, magic bytes, waiting_media bookkeeping, copy into managed store (reuse media/inspect.ts)
  validate.ts    schema → content (capabilities.validatePost per platform) → accounts (connected/frozen warnings)
  store.ts       inbox_items repository
  receipts.ts    buildReceipt(itemId) from DB; writeReceipt; buildStatus(); debounced writeStatus
  service.ts     InboxService: start/stop, watch (chokidar v4, awaitWriteFinish 2000/250), rescan timer 60 s, powerMonitor 'resume' rescan,
                 serial processing queue (p-queue concurrency 1), state machine, notifications, events for IPC
```
New dependencies: `chokidar@^4`, `yaml@^2`; dev: `zod-to-json-schema`, `ajv` (for schema tests). No others.

### 5.2 Database — `src/main/db/migrations/004_inbox.sql`
```sql
CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,                    -- protocol id, or file-<sha12> when unparseable
  post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  source TEXT,                            -- e.g. claude:weekly-tips
  source_kind TEXT NOT NULL DEFAULT 'other',
  file_name TEXT NOT NULL,
  stored_path TEXT,                       -- relative to the Handpost folder after the move
  content_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'schedule',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  errors_json TEXT NOT NULL DEFAULT '[]',
  first_seen_at TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  terminal_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_inbox_state ON inbox_items(state);
CREATE INDEX IF NOT EXISTS idx_inbox_post ON inbox_items(post_id);
ALTER TABLE posts ADD COLUMN labels_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE accounts ADD COLUMN handle TEXT;
ALTER TABLE accounts ADD COLUMN profile_url TEXT;
```
Register version 4 in `database.ts`. Add `'cancelled'` to `TargetStatus`; held items keep targets in `draft` with `scheduled_at_utc` set; *Approve* sets `scheduled` and computes `jittered_at_utc`.

### 5.3 Wiring
- `index.ts` boot: `ensureLayout()` → `InboxService.start()` after the scheduler starts; stop it in `before-quit` before the scheduler drains.
- Receipts must follow target changes: add a tiny `postEvents` emitter (`emit('post-changed', postId)`) called wherever `recalculatePostStatus` runs and from IPC handlers that change targets (retry, reschedule, save, cancel). `InboxService` listens and rewrites the receipt if the post has an inbox item; also refreshes the status file (debounced 2 s) and every 5 min.
- Create posts through one shared function used by both IPC (`save-post`, `queue-post`) and the inbox, so validation, jitter and media handling cannot drift apart.

### 5.4 State machine
`waiting_media → (held | draft | scheduled | rejected)`; `held → scheduled (approve) | rejected (reject)`; `scheduled → publishing → published | partial | failed`; any non-published → `cancelled`; `duplicate` and `rejected` are terminal for that file.

### 5.5 UX hooks
Desktop notification on `rejected` (“tip-047 rejected: media_missing”) and on `held` (“2 posts waiting for review”); sidebar Inbox badge = held + rejected-today; first time Auto-schedule is enabled, a confirm dialog states the trust-boundary sentence from INBOX_PROTOCOL §11.

### 5.6 Test matrix (each line ≥ 1 test)
| Area | Cases |
|---|---|
| Discovery | `.md` / `.markdown` / `.json` picked up; `.tmp`, `.part`, dotfiles, `~$x`, `inbox/.tmp/**`, README ignored; growing file waits for 2 s stability; rescan finds files the watcher missed |
| Parsing | BOM, CRLF, missing front matter → `parse_error`; YAML alias bomb, custom tag → `parse_error`; > 256 KB → `too_large`; YAML date object for `when` accepted |
| Schema | minimal md/json/batch/cancel OK; unknown field, `platform` typo, bad id, `handpost: 2` → errors with JSON pointers |
| Time | offset/Z exact; naive → local + `naive_time`; `now`; `next-slot` with slots; no slots → default + `default_slots_used`; late < 2 h → `late`; ≥ 2 h → `stale_time`; DST boundary in `Europe/London` and `America/New_York` |
| Content | X 281 weighted chars → `content_invalid` naming x; LinkedIn fold → `text_folds` warning; thread mapping; Facebook without `page_name` rejected; TikTok without video rejected |
| Media | relative path OK; `../../x.png` and symlink escaping root → `media_outside_root`; missing → `waiting_media`, then `media_missing` after 10 min (fake timers); wrong magic bytes → `media_unsupported`; shared media not moved while still referenced |
| Idempotency | same hash → `duplicate`, no new rows; different hash + skip → `duplicate_id`; replace before publish updates targets; replace after publishing → `already_publishing`; cancel scheduled → `cancelled`; cancel partially published → `partially_published` warning; cancel unknown → `unknown_id` |
| Modes | auto on → scheduled; auto off → held; `mode: review` → held; `mode: draft` → draft only; approve/reject IPC |
| Accounts | not connected → accepted + warning; frozen → accepted + warning |
| Output | receipt shape validates; status shape validates; previews omitted when setting off; atomic writes (no partial file observed by a concurrent reader) |
| Safety | concurrency 1 (two files never processed in parallel); crash between commit and move → no double post; random-bytes fuzz (100 files) never throws out of the service |
| Windows | backslash media paths normalized; case-only filename collision in `processed/` gets a suffix |

---

## 6. UI notes beyond the Figma frames
- Times: store UTC, display local with the zone name; show “±90 s” wherever a scheduled time is shown for automation-created posts.
- Every destructive action (Reject, Cancel, Re-enable early) uses a confirm popover, never a native `confirm()` (it would block Playwright in tests too).
- Inbox list virtualizes above 200 rows; filters persist per session.
- The receipt panel and Queue evidence reuse the same `Receipt`/`StepLog` components.
- Empty states use the stamp mark at 64 px, a one-line explanation and one action.

## 7. Packaging specifics
- `better-sqlite3` must be rebuilt for Electron (`electron-builder install-app-deps` in `postinstall`, replacing `electron-rebuild`).
- Ship migrations as files next to `index.cjs` (already copied by `scripts/copy-assets.ts`) and add them to `asarUnpack`, or inline them as strings at build time — pick one and record it.
- Playwright: only the `playwright` package is needed at runtime (channel `chrome` drives the installed Chrome). Do not bundle Chromium.
- Code signing is out of scope; document SmartScreen/Gatekeeper prompts in README.

## 8. Testing strategy additions
- Unit: everything in §5.6; contrast test (H3); handle → profile URL (H6); legacy migration (H1).
- Contract: rehearsal never submits (H6).
- e2e-lite: inbox → MockSocial → receipt (H2); UI smoke of all screens in both themes (H4).
- Website: link/asset/CTA verifier (H8).
- Live: owner only, `docs/LIVE_TEST.md` gains a “Rehearse first” step and an “Inbox to live” step (drop a `mode: review` file, approve, verify receipt URL).

## 9. PROGRESS.md template
```md
# Handpost Progress
## Milestone status
H0 [ ] H1 [ ] H2 [ ] H3 [ ] H4 [ ] H5 [ ] H6 [ ] H7 [ ] H8 [ ] H9 [ ] H10 [ ]
## Last iteration
- Did:
- Verified (commands run + results):
- Next:
- Blockers / needs-owner:
```

## 10. Needs-owner checklist
- [ ] Review the Figma file; flag any screen to change before H4.
- [x] Enable GitHub Pages (Source: GitHub Actions) after H8 merges. → Owner chose no GitHub Actions (2026-11-19): Source is the `gh-pages` branch, pushed by `npm run website:publish`.
- [ ] Install Google Chrome on the dev machine if missing; run `npm run fingerprint -- --chrome`.
- [ ] Connect accounts and run Rehearse on each (H6), then `docs/LIVE_TEST.md`.
- [ ] Add the `handpost-inbox` skill to Claude and create the first scheduled task (`docs/AUTOMATION.md` §A), initially with `mode: review`.
- [x] Decide the license (no LICENSE file exists yet; the site says “open source”, so one is needed before the first release). → MIT, chosen by the owner 2026-11-18.
- [x] Approve pushing the first release tag. → Approved 2026-11-18; `v0.2.0-rc.1` built and published as a pre-release 2026-11-19.

## 11. Risks (unchanged in substance — keep them in README and on the site)
- Automating platform web UIs violates most platforms' terms even at human volume; challenges, blocks and account loss are possible. Handpost reduces risk and never hides detection events; it cannot remove the risk.
- UI drift is constant; budget about one adapter repair per month. Rehearse makes repairs safe to check.
- Instagram and TikTok are fragile; manual hand-off is a feature.
- The inbox is a trust boundary: anything that can write to it can publish. Keep it local or in a sync service the owner controls.
