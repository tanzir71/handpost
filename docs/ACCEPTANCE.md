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

## Handpost milestones (H0–H10)

| Milestone | Automatable evidence (commands) | Owner-only evidence |
|---|---|---|
| H0 | `npm ci && npm run check && npm run build`; LF everywhere (`git ls-files --eol`); no `any` in `src/` (lint) | CI run on GitHub |
| H1 | `git grep -iw relay -- src tests` only in the migration module and its test; migration unit tests | — |
| H2 | `npm run test -- inbox` (full §5.6 matrix), inbox → MockSocial → receipt e2e, crash-between-commit-and-move test | — |
| H3 | WCAG contrast test for every token pair, no hex outside `tokens.css`, `#/__gallery` in `scripts/verify-ui.ts` | Compare with Figma Foundations `0:1` |
| H4 | Screen tests (Inbox filters/approve/reject, slot editor, Compose modes, empty states), `npx tsx scripts/verify-ui.ts` (both themes, keyboard) | Compare each screen with its Figma frame |
| H5 | Schema-equality test, guide code-block validation, receipt/status schema validation, `npm run inbox:smoke` | Add the skill to Claude and run a scheduled task |
| H6 | Identity per platform, no placeholder URLs, rehearsal contract on all 9 fixtures, `chrome_missing`, rehearsal e2e | Rehearse each connected platform; `docs/LIVE_TEST.md` |
| H7 | `npm run dist`; `npm run dist:dir && npm run smoke:packaged`; installed-copy smoke (`HANDPOST_EXE=… npm run smoke:packaged`) | Push a `v*` tag to run `release.yml`; publish the draft release |
| H8 | `npm run website:verify`, `npm run website:browser` (served under `/handpost/`); `npm run website:publish` pushes `gh-pages`, then the live URL answers 200 for `/`, `/demo/` and `/schema/*.json` | Pages → Source: Deploy from a branch, `gh-pages` / (done 2026-11-19) |
| H9 | Git source tests against a local bare repository (`npm run test -- git-source`) | Point it at a real repository |
| H10 | Seeded inbox fuzzing, receipt/state audit, `npm run drift-audit`, MCP server tests | Recapture fixtures from real pages over time |
