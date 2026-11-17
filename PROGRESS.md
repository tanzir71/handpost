# Handpost Progress

Milestones are defined in `CLAUDE_CODE_HANDOFF.md` §4. The previous “Relay” milestones M0–M10 from `CODEX_HANDOFF.md` are complete for everything automatable (see git history up to `dd021e5`); their owner-only live gates are carried into H6 and the needs-owner list.

## Milestone status
H0 [DONE] H1 [DONE — app; README/docs/site copy moves with H8] H2 [ ] H3 [ ] H4 [ ] H5 [ ] H6 [~ X only, see below] H7 [ ] H8 [ ] H9 [ ] H10 [ ]

## Last iteration
- Did (2026-11-18, H0 + H1 tidy): committed the pending rebrand (`afd29c8`); added `.gitattributes` (LF everywhere, CRLF for `.cmd`) and renormalized; added Prettier (110 cols, single quotes) and formatted `src/ tests/ scripts/` in `style: format codebase (no logic change)`; `format:check` now runs in `npm run check`; replaced every `any` in `src/` with row types from `src/shared/rows.ts` and turned on `no-explicit-any: error` for `src/` (tests changed only in type annotations); moved the remaining legacy Relay strings (old archive manifest name, import notice) into `src/main/migrate-legacy.ts` so `git grep -i relay -- src tests` only hits the migration module and its test.
- Verified (Windows 11, Node 24, `npm ci` fresh): `npm run check` exit 0 — lint clean, format:check clean, tsc clean, unit 18 files / 55 tests, contract 22, e2e-lite 1, fingerprint `{"webdriver":false,"cdpLeak":false}`; `npm run build` exit 0; `git diff --stat HEAD~3 -- tests` shows only formatting + type-annotation changes; `git ls-files --eol` all `i/lf w/lf` except the `.cmd` (`w/crlf`).
- Next: H2 inbox service (test-first).
- Blockers / needs-owner: X login in the Handpost Edge profile and approval of a live test post (from the previous iteration). README, docs and the website still say Relay (H8).

## Earlier iterations
- 2026-11-18 rebrand: app rebrand to Handpost — package/productName/app id, window, tray, notifications, sidebar stamp mark + serif wordmark, favicon, window icon, PNG tray icons, identifiers (`HandpostDatabase`, `handpostApi`, `window.handpost`, `data-handpost`), file names with backward-compatible archive import, one-time Relay → Handpost data migration with path rewriting; Edge support (`HANDPOST_BROWSER`); X adapter made live-ready (nav profile link, status permalink, verification retries); renderer `base: './'`.
