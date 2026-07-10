# Acceptance evidence

This matrix separates automatable evidence from the handoff's explicitly owner-run live gates. Commands are rerun before a milestone is reported as verified in `PROGRESS.md`.

| Milestone | Automatable evidence | Owner-only evidence |
|---|---|---|
| M0 | Fresh clone, native `npm ci`, `npm run check`, production build, and renderer title/content/console/navigation check | None |
| M1 | In-memory CRUD for every table, legacy migration upgrade, three-version idempotence | None |
| M2 | Named persistent Chromium profile in E2E, humanizer interaction/statistical tests, fingerprint self-test, sanitized example capture | Real installed Chrome launch and `--chrome` fingerprint |
| M3 | Express MockSocial login form → persistent cookie → polling → DB `ok` → browser closure in E2E | X and LinkedIn manual login/session checks |
| M4 | Three posts one minute apart publish serially with URLs, proof, DB states; recent/stale overdue recovery tests; retry taxonomy tests | None |
| M5 | Draft restoration, inline errors/warnings, schedule/post-now persistence, calendar drag and keyboard reschedule, timezone/DST math | None |
| M6 | Tier-1 publish/verify fixture contracts, primary+fallback assertions, X thread and four-image contracts | One verified live post per Tier-1 platform |
| M7 | ffprobe metadata mapping, size/duration/type/orientation rules, MockSocial image E2E, alt persistence, X four-image upload | None |
| M8 | Facebook identity flow, Instagram crop/alt flow, conservative gap, checkpoint-to-platform-freeze test | Facebook Page and Instagram live smoke |
| M9 | TikTok/YouTube/Pinterest wizard contracts and transient processing-timeout scheduler test | Tier-3 live smoke |
| M10 | Queue slots, template variables, ten-row CSV distribution, archive wipe/restore including evidence, tray/login settings, filterable History, empty states, zero TODO scan | None |

The detailed owner procedure and failure drills are in `docs/LIVE_TEST.md`. Live gates are never inferred from fixture or CI results.
