# Handpost Progress

Milestones are defined in `CLAUDE_CODE_HANDOFF.md` §4. The previous “Relay” milestones M0–M10 from `CODEX_HANDOFF.md` are complete for everything automatable (see git history up to `dd021e5`); their owner-only live gates are carried into H6 and the needs-owner list.

## Milestone status
H0 [ ] H1 [DONE — app; README/docs/site copy moves with H8] H2 [ ] H3 [ ] H4 [ ] H5 [ ] H6 [~ X only, see below] H7 [ ] H8 [ ] H9 [ ] H10 [ ]

## Last iteration
- Did (2026-11-18, ahead of H0 at the owner's request): app rebrand to Handpost — package/productName/app id, window, tray, notifications, sidebar stamp mark + serif wordmark, favicon, window icon, PNG tray icons (normal + frozen), all identifiers (`HandpostDatabase`, `handpostApi`, `window.handpost`, `data-handpost`, `exportArchive`), log/db/archive file names with backward-compatible archive import, one-time Relay → Handpost data migration with path rewriting. Edge support (`HANDPOST_BROWSER`, auto-detect Chrome → Edge), `npm run dev:edge`, `scripts/windows/start-handpost-edge.cmd`. X adapter made live-ready: real composer selector, SPA-aware session check, own-profile resolution from the nav profile link (replaces the non-existent `x.com/profile`), status permalink instead of the first link in the post, verification retries. Renderer `base: './'` so packaged builds load.
- Verified (scratch copy on Linux, Node 22, Electron-free): `tsc --noEmit` 0 errors; `eslint . --max-warnings=0` clean; `vitest run tests/unit` 18 files / 55 tests passed (46 existing + 5 migration + 4 browser-channel); `vitest run tests/contract` 22 passed; `vitest run tests/e2e` 1 passed (MockSocial login → three verified posts); `npm run build` succeeded, built `index.html` uses `./assets/…`; renderer screenshot shows the stamp + “Handpost”, no console errors.
- Next: live X proof on the owner's Windows PC with Edge (owner logs in once in the Handpost Edge window; owner approves the test post text). Then H0.
- Blockers / needs-owner: X login in the Handpost Edge profile; approval of the live test post. README and the website still say Relay (H8).
