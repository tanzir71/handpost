# CODEX HANDOFF — "Relay" : Browser-Automation Social Media Scheduler

> **Audience:** An autonomous coding agent (Codex) running in a loop.
> **Owner:** Tanzir (single user, personal tool).
> **Repo root:** this folder. This file is the source of truth. Do not deviate from it without recording the deviation in `DECISIONS.md`.

---

## 0. AGENT LOOP PROTOCOL — READ THIS FIRST, EVERY ITERATION

You are being run repeatedly. Each run, follow this exact protocol:

1. Read `PROGRESS.md` (create it from the template in §12 if missing).
2. Find the lowest-numbered milestone in §11 that is not marked `DONE`.
3. If the current milestone has failing acceptance criteria, fix those before writing new features.
4. Implement the smallest coherent unit of work toward that milestone.
5. Run `npm run check` (lint + typecheck + unit tests). Fix everything it reports. A milestone is never DONE with a red check.
6. Update `PROGRESS.md`: what you did, what's verified, what's next, any blockers.
7. If you made an architectural choice not covered by this spec, append it to `DECISIONS.md` with a one-paragraph rationale.
8. Commit with a conventional-commit message (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).

**Hard rules for every iteration:**
- Never mark acceptance criteria passed without running the verification command listed for it.
- Never delete or weaken a test to make it pass.
- Never store credentials in code, config, or the database. Sessions live only in Playwright profile directories (§6.2).
- Platform adapters that can't be E2E-tested in CI get **contract tests against saved DOM fixtures** instead (§10.3). Live posting is only ever triggered manually by the owner.
- When all milestones are DONE, enter the Refinement Loop (§13) — the loop never idles.

---

## 1. Mission

Build **Relay**, a local-first desktop app that schedules and publishes social media posts by **driving a real browser (Playwright) instead of platform APIs**.

**Why no APIs:** API access is the moat of every incumbent (expensive approval processes, rate caps, Instagram/TikTok API restrictions, X API pricing). Browser automation posts exactly like a human does — anything you can post manually, Relay can post. The cost is fragility (UIs change) and detection risk (§6). The entire architecture is designed around managing those two risks.

**Product shape:**
- Desktop app: **Electron** (main process = Node + Playwright; renderer = React + Vite + Tailwind). Electron over Tauri because the automation engine is Node/Playwright — one runtime, one language, no sidecar IPC.
- Storage: **SQLite** via `better-sqlite3` (app data dir). Media files stored on disk, referenced by path.
- Single user, no auth, no billing, no telemetry. Runs in the system tray; scheduler fires while the app is running (and optionally on OS login).
- Language/tooling: **TypeScript strict**, ESLint, Vitest, Playwright.

**Platforms (phased):**
- **Tier 1 (build first, most automation-tolerant):** X/Twitter, LinkedIn, Bluesky, Threads
- **Tier 2:** Facebook Pages, Instagram (feed image/carousel; Reels after)
- **Tier 3 (hardest):** TikTok, YouTube Shorts, Pinterest

---

## 2. Competitor Analysis

### 2.1 Landscape

| Product | Model | Approach | Price | Strengths | Weaknesses (Relay's opening) |
|---|---|---|---|---|---|
| **Buffer** | SaaS | Official APIs | Free: 3 channels/10 posts; ~$6/channel/mo | Polished UX, best free tier, AI assistant | Per-channel pricing scales badly; API-limited (no true Instagram parity for all post types); your content lives on their servers |
| **Hootsuite** | SaaS | Official APIs | ~$99+/mo | Enterprise features, inbox, analytics | Expensive, bloated for a single creator |
| **Later** | SaaS | Official APIs | ~$25+/mo | Visual/IG-first planning, grid preview | IG-centric, weak on X/LinkedIn text content |
| **Publer** | SaaS | Official APIs | ~$12+/mo | Best-in-class bulk CSV scheduling, auto-slot distribution | Still API-bound; subscription |
| **Postiz** | Open source (AGPL) + cloud | Official APIs | Self-host free; cloud $29/mo, 400-post cap | 30+ platforms incl. Reddit/Discord, AI features, most active OSS project in the space | Requires users to create their own API apps/keys per platform — painful setup; API caps still apply |
| **Mixpost** | Open source (MIT) + paid Pro | Official APIs | Self-host free; Pro one-time payment | Clean Laravel app, approval workflows, no subscription | Same API-key setup burden; PHP stack; server required |
| **upload-post / Post Bridge / WoopSocial** | API-wrapper SaaS | Official APIs resold as one unified API | Usage-priced | Developer-friendly single API | You rent their API quota; middleman risk |
| **Jarvee** (dead), Massplanner (C&D'd by Instagram) | Windows apps | Browser emulation | — | Proved massive demand for non-API automation | Built for spam at scale (mass-follow/like across hundreds of accounts) → detection arms race → shut down. Cautionary tale, not a blueprint |

### 2.2 The gap Relay fills

1. **Every living competitor is API-first.** Setup for self-hosted tools means registering developer apps on 9 platforms, OAuth dances, and API approval queues. Relay setup = "log in once in a browser window."
2. **APIs can't do everything.** Many post types/features (certain poll types, some carousel behaviors, community posts, first-comment tricks) are UI-only or API-restricted. A browser can do whatever a human can.
3. **The browser-automation generation (Jarvee) died because it was a spam engine.** Relay is the opposite: low-volume (a handful of posts/day), single account per platform, your own real logged-in session, human-paced. It automates *publishing*, not *engagement*. This is the survivable corner of the browser-automation space.
4. **Local-first privacy.** Drafts, media, and sessions never leave the machine. No incumbent offers this together with scheduling UX.

### 2.3 What to steal from competitors

- **Publer:** CSV bulk import + auto-distribute to time slots (M8).
- **Buffer:** queue-based scheduling ("add to queue" fills next open slot) rather than only pick-a-datetime.
- **Later:** calendar month/week view with drag-to-reschedule.
- **Postiz:** per-platform content overrides on one post (same idea, tweaked caption per network).

---

## 3. Core Product Requirements

1. **Composer:** one post → many platforms. Base text + per-platform overrides (caption, first comment, alt text). Media attach (images, video), drag-drop, paste. Live per-platform validation: char limits, media count/type/size, aspect-ratio warnings.
2. **Scheduling:** exact datetime, "next free queue slot" (per-platform weekly slot templates), and "post now". Timezone-aware (store UTC, display local).
3. **Queue & calendar:** list view (upcoming/past/failed) and calendar view (month/week, drag to reschedule).
4. **Publishing engine:** at fire time, drive the platform's web UI to publish. Verify success by finding the published post, capture its URL + screenshot as proof (§5.4).
5. **Account manager:** per-platform "Connect" opens a headed browser window on the platform's login page; user logs in manually (incl. 2FA); Relay saves nothing but the Playwright profile dir. Session-health indicator with re-login prompt.
6. **Failure handling:** retries with backoff, screenshots + DOM snapshot on failure, desktop notification, one-click "open in browser with content preloaded to clipboard" manual fallback.
7. **Drafts & templates:** save drafts, reusable templates with `{variables}`.
8. **History:** every publish attempt logged with proof screenshot and post URL.

**Non-goals (do not build):** analytics scraping, auto-follow/like/comment/DM, multi-account-per-platform, team features, AI content generation (stub the interface, don't implement), mobile app.

---

## 4. Architecture

```
┌────────────────────────── Electron ──────────────────────────┐
│  Renderer (React/Vite/Tailwind)                              │
│   Composer · Calendar · Queue · Accounts · Settings · Logs   │
│                    ── IPC (typed, zod-validated) ──          │
│  Main process (Node)                                         │
│   ┌───────────┐ ┌──────────────┐ ┌───────────────────────┐   │
│   │ Scheduler │→│ Publish Queue│→│ Automation Engine     │   │
│   │ (tick 30s)│ │ (p-queue,    │ │ (Playwright, 1 headed │   │
│   │           │ │ concurrency 1│ │  persistent ctx per   │   │
│   └───────────┘ │ per platform)│ │  platform profile)    │   │
│                 └──────────────┘ └──────────┬────────────┘   │
│   SQLite (better-sqlite3) · media store · logger (pino)      │
└──────────────────────────────────────────────┼───────────────┘
                                    Platform Adapters (§7)
```

### 4.1 Module layout

```
src/
  main/            # Electron main
    scheduler/     # tick loop, due-post selection, retry policy
    engine/        # Playwright lifecycle, profile mgmt, humanizer
    adapters/      # one dir per platform (§7)
    db/            # schema, migrations, repositories
    ipc/           # typed handlers (zod schemas shared with renderer)
  renderer/        # React app
  shared/          # types, platform capability manifests, validation
tests/
  unit/
  fixtures/        # saved DOM snapshots per platform per flow step
  contract/        # adapter contract tests against fixtures
```

### 4.2 Key mechanisms

- **Scheduler:** 30s tick; selects posts where `scheduled_at <= now AND status = 'scheduled'`; moves to `publishing`; enqueues per-platform jobs. Missed posts while app was closed: on startup, anything overdue < 2h publishes with a notification; overdue ≥ 2h flags `needs_attention` (never silently late-post old content).
- **Publish queue:** global concurrency 1 (one browser doing one thing — mimics a human, halves detection surface). Per-platform cooldown: min 3 min between publishes to the same platform; jitter ±90s on every scheduled fire time (§6.3).
- **Automation engine:** `chromium.launchPersistentContext(profileDir)` per platform. Headed by default (minimized/off-screen); headless is a per-platform opt-in only where verified safe. `channel: 'chrome'` (real Chrome, not bundled Chromium) to reduce fingerprint surface.
- **Adapter API (every platform implements):**

```ts
interface PlatformAdapter {
  id: PlatformId;
  capabilities: CapabilityManifest;      // char limits, media rules, threads, polls…
  checkSession(ctx: BrowserContext): Promise<SessionState>;   // 'ok' | 'logged_out' | 'challenged'
  publish(ctx: BrowserContext, post: RenderedPost, report: StepReporter): Promise<PublishResult>;
  verify(ctx: BrowserContext, post: RenderedPost): Promise<Verification>; // find post, return URL
}
```

- **StepReporter** records every step (name, timing, screenshot on failure) → powers the failure UI and fixture regeneration.

### 4.3 Data model (SQLite)

```sql
accounts(id, platform, display_name, profile_dir, status, last_checked_at, created_at)
posts(id, base_text, created_at, updated_at, status)             -- draft|scheduled|published|partial|failed
post_targets(id, post_id, account_id, override_text, first_comment, scheduled_at_utc,
             jittered_at_utc, status, attempt_count, published_url, error_code, error_detail)
media(id, post_id, path, kind, width, height, duration_s, order_idx, alt_text)
publish_attempts(id, target_id, started_at, finished_at, outcome, step_log_json,
                 screenshot_path, error_class)
queue_slots(id, account_id, weekday, time_local)                 -- Buffer-style slot templates
templates(id, name, body, variables_json)
settings(key, value)
```

Migrations: plain SQL files, applied by version at startup, tested.

---

## 5. Publishing Flow (the critical path)

1. Render the post for the target platform (apply overrides, validate against capability manifest — refuse to attempt an invalid post).
2. `checkSession()` — if `logged_out`/`challenged`, mark target `needs_login`, notify, **do not attempt to log in automatically. Ever.**
3. Navigate to the compose surface. Prefer **direct compose URLs** (e.g. `x.com/compose/post`, `linkedin.com/feed/?shareActive=true`) over clicking through nav.
4. Fill content using the humanizer (§6.3): variable-speed typing into contenteditable/textarea; file uploads via `setInputFiles` on the real `<input type=file>` (never OS dialogs).
5. Submit. Wait for platform-specific success signal (toast, redirect, compose box reset).
6. **Verify (§5.4):** navigate to own profile/feed, locate the new post (match text prefix + recency), capture permalink URL + screenshot. No verification → status `unverified`, not `published`.
7. Record attempt; on failure classify error (§5.5) and apply retry policy.

### 5.4 Verification is non-negotiable
A scheduler that silently fails is worse than no scheduler. Every publish must end in exactly one of: `published` (URL + screenshot proof), `unverified` (submitted, proof not found — notify), or `failed` (classified error — notify).

### 5.5 Error taxonomy → retry policy

| Class | Examples | Policy |
|---|---|---|
| `transient` | timeout, network, element slow to render | retry ×3, backoff 1/5/15 min |
| `session` | logged out, checkpoint/challenge page | no retry; `needs_login`; notify |
| `content` | text too long, media rejected, duplicate-post block | no retry; surface exact platform message |
| `ui_drift` | selector not found / flow changed | retry ×1 with fallback selectors; then `failed(ui_drift)` + save full-page DOM snapshot to `tests/fixtures/_drift/` for repair |
| `suspected_detection` | captcha, "unusual activity", action block | freeze all automation for that platform 24h (circuit breaker); notify prominently |

---

## 6. Anti-Detection & Account Safety (existential risk — treat as P0)

**Threat model:** platforms detect automation via fingerprinting, behavioral analysis, IP reputation, and volume patterns. Consequences range from captcha to permanent account loss. Jarvee/Massplanner died here. Relay survives by being *boring*: one real account, real residential IP (the user's own machine), real Chrome profile, human-scale volume.

### 6.1 Posture
- Real Chrome (`channel:'chrome'`), headed, persistent profile → indistinguishable-from-daily-driver fingerprint baseline.
- No proxies, no multi-accounting, no engagement automation. These are the spam signals; Relay has none of them.
- `rebrowser-playwright` patches (or current maintained equivalent) to remove `navigator.webdriver` and CDP leaks. Verify with a fingerprint self-test page in CI (M2 acceptance).

### 6.2 Sessions
- One Playwright profile dir per platform under the app data dir; OS-level permissions locked to user. Never export/serialize cookies to the DB or logs.
- Login is always manual, in a visible window. Automating login (typing passwords, solving 2FA) is prohibited — it's the highest-signal bot behavior and a credential-security hazard.

### 6.3 Humanizer (shared utility, used by every adapter)
- Typing: 60–140 wpm equivalent, gaussian inter-key delay, occasional 300–900 ms pauses. Paste (clipboard insert) allowed for bodies > 400 chars — humans paste long content too.
- Mouse: move-then-click with slight curve/offset; scroll before interacting with below-fold elements.
- Timing: 1–4 s think-pauses between macro steps; every scheduled time jittered ±90 s; never post to two platforms at the same second.
- Volume guardrails (configurable, defaults): max 10 posts/platform/day, min 3 min gap/platform. Hard-stop with clear error if exceeded.

### 6.4 Circuit breaker
Any `suspected_detection` event → that platform's automation freezes 24 h, tray turns red, queued posts flag for manual publishing. Two events in 7 days → freeze until user manually re-enables.

---

## 7. Platform Adapter Specs

Shared rules for all adapters:
- **Selector strategy:** prefer (in order) `data-testid` / ARIA role+name / stable text anchors. Every critical element gets a primary selector + ≥1 fallback in `adapters/<p>/selectors.ts` — one file to fix per platform when UI drifts.
- Each adapter ships: `capabilities.ts`, `selectors.ts`, `publish.ts`, `verify.ts`, `fixtures/` (saved compose-flow DOM snapshots), contract tests.
- Fixture capture tool (M2): CLI `npm run capture -- --platform=x --step=compose` saves sanitized DOM of each flow step for contract tests.

| Platform | Compose entry | Content notes | Verify | Known hazards |
|---|---|---|---|---|
| **X/Twitter** | `x.com/compose/post` | 280 chars (count by weighted rule, URLs=23); threads = "Add post" loop; ≤4 images or 1 video; alt text per image | own profile, newest post text-prefix match → permalink | aggressive bot detection; duplicate-text block |
| **LinkedIn** | feed → "Start a post" (or `shareActive=true`) | 3,000 chars; "…see more" fold at ~210 chars (warn in composer); docs/carousels later | own recent-activity page | modal structure changes often; editor is contenteditable with mention popups — type `@` carefully |
| **Bluesky** | compose button on `bsky.app` | 300 graphemes; ≤4 images; link cards auto | own profile | lowest risk; also has open API — still do browser to keep the engine honest, note API fallback in DECISIONS.md |
| **Threads** | `threads.net` compose | 500 chars; ≤10 media carousel | own profile | shares Meta detection infra with Instagram |
| **Facebook Page** | Page → compose (avoid Business Suite; more drift) | long text; link previews | Page timeline | Meta checkpoints; ensure posting *as Page* not user |
| **Instagram** | `instagram.com` → Create (web create flow) | image/carousel via web; crop/ratio dialog steps; caption 2,200 chars, ≤30 hashtags | own grid, newest item | **highest detection risk of all** — most conservative pacing; Reels upload via web is flaky, ship feed posts first |
| **TikTok** | `tiktok.com/upload` | video only; processing wait can be minutes — poll with generous timeout; caption/hashtags/cover selection | profile videos tab | upload page A/B tests heavily; virtual-scroll DOM |
| **YouTube Shorts** | `studio.youtube.com` upload | video ≤ 60s ⇒ Short; title/desc/visibility/kids-flag steps | Studio content list (most reliable verify of all) | multi-step wizard; processing wait |
| **Pinterest** | `pinterest.com/pin-builder` | image + title + description + destination link + board picker | own profile pins | board dropdown is virtual-list; must create/select board |

Each adapter's spec-level acceptance test (run manually by owner, scripted): publish a text post (or minimal media post where text-only is impossible), engine verifies and stores permalink + screenshot, row visible in History UI.

---

## 8. UI Spec (renderer)

- **Composer:** left = editor (base text, media strip, per-platform override tabs with live char counters and validation chips); right = per-platform preview cards. Footer: Save draft · Add to queue · Schedule (datetime picker) · Post now.
- **Calendar:** month + week views; chips colored per platform; drag to reschedule (rewrites `scheduled_at_utc`, re-jitters).
- **Queue:** grouped Upcoming / Needs attention / Published / Failed; failure rows expand to step log + screenshot + "Retry" / "Open in browser" fallback.
- **Accounts:** card per platform: status dot (ok / needs_login / frozen), Connect/Reconnect button (opens login window), last-verified time, per-platform settings (slots, daily cap, headless toggle where allowed).
- **Settings:** launch at login, notification prefs, data folder location, export/import (JSON + media zip).
- **Logs:** filterable table of publish_attempts.
- Design: clean, dense, keyboard-friendly; dark mode default. No onboarding wizard — an empty-state card per screen explains itself.

---

## 9. Security & Privacy

- No network calls except to the social platforms themselves (and OS notifications). No telemetry, no update pings (manual updates).
- DB and profile dirs live in the OS app-data dir; media copied into managed store on attach.
- Logs must never contain cookies, tokens, or full page HTML with session data — sanitize DOM snapshots (strip cookie/meta/localStorage script tags) before saving fixtures.
- IPC: renderer never touches Playwright, fs, or DB directly; every channel zod-validated.

## 10. Testing Strategy

1. **Unit (Vitest):** scheduler tick/selection, jitter, retry policy, validation against capability manifests, DB repositories (in-memory SQLite), humanizer distributions (statistical bounds).
2. **Contract tests per adapter:** run `publish()` step logic against saved DOM fixtures served by a local static harness — asserts selectors resolve and step order holds without touching real platforms. These are the drift alarm: they run in CI and on demand.
3. **E2E-lite:** a fake "MockSocial" web app (in-repo, Express + a compose form) that the full engine publishes to end-to-end in CI — proves scheduler → queue → engine → verify → DB pipeline with zero external risk.
4. **Manual live checklist:** `docs/LIVE_TEST.md` — owner-run per-platform smoke script. Codex maintains the doc; only the owner executes it.

`npm run check` = lint + typecheck + unit + contract + e2e-lite. This is the gate for every milestone.

---

## 11. Milestones (execute in order)

### M0 — Scaffold `[ ]`
Electron + Vite + React + TS strict + Tailwind + ESLint + Vitest wired; `npm run dev` opens a window; `npm run check` green; CI config present.
**Accept:** fresh clone → `npm i && npm run check` passes; window renders "Relay".

### M1 — Data layer `[ ]`
Schema §4.3, migrations, typed repositories, seed script.
**Accept:** repo unit tests cover CRUD for all tables; migration runner idempotent (run twice = no-op).

### M2 — Automation engine core `[ ]`
Persistent-context lifecycle per platform, humanizer, StepReporter, fingerprint self-test, fixture-capture CLI.
**Accept:** engine opens real Chrome with a named profile; fingerprint test page reports no `navigator.webdriver` / CDP leak; humanizer unit tests pass; capture CLI saves a sanitized snapshot of example.com.

### M3 — Accounts + login flow `[ ]`
Accounts screen, Connect opens login window, `checkSession` polling, status persistence.
**Accept:** connect flow works against MockSocial (login form → session cookie → status `ok`); real-platform session check verified by owner for X + LinkedIn.

### M4 — Scheduler + queue + MockSocial pipeline `[ ]`
Tick loop, jitter, per-platform serialization, retry/error taxonomy, notifications, MockSocial adapter + e2e-lite test.
**Accept:** e2e-lite: schedule 3 posts 1 min apart → all publish to MockSocial, verified with URLs, correct DB states; kill-app-and-restart overdue logic tested.

### M5 — Composer + queue/calendar UI `[ ]`
Full §8 composer with validation, drafts, queue list, calendar with drag-reschedule.
**Accept:** create → schedule → see on calendar → drag → time updates (unit-tested tz math); validation blocks an over-limit X post with inline error.

### M6 — Tier 1 adapters: X, LinkedIn, Bluesky, Threads `[ ]`
Full publish + verify + fixtures + contract tests per §7.
**Accept:** contract tests green for all four; owner live-smoke: one text post per platform reaches `published` with permalink + proof screenshot.

### M7 — Media pipeline `[ ]`
Attach/paste/drag images + video, per-platform media validation (dimensions/duration/size via ffprobe), alt text, upload steps in Tier-1 adapters.
**Accept:** image post to MockSocial e2e; X 4-image contract test; oversized video rejected at compose time with reason.

### M8 — Tier 2 adapters: Facebook Page, Instagram feed `[ ]`
Per §7 incl. Instagram's conservative pacing profile and crop-dialog handling.
**Accept:** contract tests green; owner live-smoke passes; circuit breaker fires correctly on a simulated checkpoint fixture.

### M9 — Tier 3 adapters: TikTok, YouTube Shorts, Pinterest `[ ]`
Long-processing-wait pattern, wizard flows, board picker.
**Accept:** contract tests green; owner live-smoke; upload-processing timeout handled as `transient`, not `failed`.

### M10 — Polish & resilience `[ ]`
Queue slots ("add to queue"), templates + variables, CSV bulk import (Publer-style, with dry-run preview), export/import, tray + launch-at-login, dark mode pass, empty states, `docs/LIVE_TEST.md` complete.
**Accept:** CSV of 10 posts imports to correct slots (unit-tested); export→wipe→import round-trips; `npm run check` green; zero TODOs left in code.

---

## 12. PROGRESS.md template

```md
# Relay Progress
## Milestone status
M0 [ ] M1 [ ] M2 [ ] M3 [ ] M4 [ ] M5 [ ] M6 [ ] M7 [ ] M8 [ ] M9 [ ] M10 [ ]
## Last iteration
- Did:
- Verified (commands run + results):
- Next:
- Blockers / needs-owner (live login, live smoke tests):
```

Anything requiring the owner (real logins, live smoke tests) goes under **needs-owner** — never fake these; continue with other work.

## 13. Refinement Loop (after M10)

Cycle through, one pass per iteration, forever:
1. **Drift audit:** re-run contract tests; if platform fixtures are stale (>30 days), flag for owner recapture.
2. **Failure-mode hunt:** read `publish_attempts` error patterns in test DBs; strengthen weakest error class.
3. **Perf pass:** cold-start time, composer input latency, memory of idle engine (target: engine fully closed when queue empty).
4. **UX pass:** pick the roughest screen; refine spacing, keyboard nav, a11y (focus order, ARIA labels).
5. **Test-depth pass:** raise coverage of lowest-covered module; add property-based tests for scheduler/jitter.
6. **Docs pass:** README, LIVE_TEST.md, architecture doc accuracy.

## 14. Risks & Honest Caveats (keep in README)

- **ToS:** automated posting via the web UI violates most platforms' terms even for your own account at human volume. Realistic worst case at Relay's volume is a challenge/temporary action-block; account loss is possible. Circuit breaker + manual-fallback exist for this reason. Owner accepts this risk; the app must never hide detection events.
- **UI drift is not an if but a when.** The selectors.ts + fixtures + contract-test design makes repair a one-file fix per platform. Budget: expect ~1 adapter repair/month.
- **Instagram/TikTok are the fragile frontier.** If an adapter can't be made reliable, degrade gracefully: prepare the post, open the browser, prefill what's possible, hand off to the human — a "co-pilot publish" is still better than a Buffer subscription.
