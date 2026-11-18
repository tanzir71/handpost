# AGENTS.md — writing posts for Handpost

Copy this file into your Handpost folder (default `~/Handpost`) so Codex picks it up when it runs there.

You schedule social posts by writing files into `./inbox/`. The Handpost desktop app validates them, publishes them through the owner's own Chrome at human pace, and writes `./receipts/<id>.json`. You never open, log in to, or post on a platform yourself.

## Before writing
1. Read `./handpost.status.json`. Target only platforms with `"status": "ok"`. Respect `limits.max_chars` (X counts URLs as 23), `max_media`, `media_kinds`.
2. Check `upcoming` and `recent`; never repeat a post from the last 14 days.
3. If `alive_until` is in the past, Handpost isn't running — still write the file, and say so in your final message.

## File format (one post per file)
```markdown
---
handpost: 1
id: release-notes-20261118-v0-4
platforms: [x, linkedin]
when: next-slot
source: codex:release-notes
overrides:
  x:
    thread: ["Second post of the thread", "Third post"]
---
Base text for every platform.
```
- Required: `handpost: 1`, `id`, `platforms`, body text. Unknown keys are rejected.
- `id`: `^[a-z0-9][a-z0-9._-]{0,79}$`, deterministic for the task and date (re-runs become harmless duplicates).
- `when`: `next-slot` (default) · `now` · quoted ISO time with offset `"2026-11-20T09:30:00+06:00"`.
- `mode: review` to require the owner's approval; `mode: draft` to only create a draft.
- Media: put files in `./inbox/media/` first; reference as `media: [{ path: media/x.png, alt: "…" }]`. Never reference files outside this folder.
- Replace a scheduled post: same `id` + `on_conflict: replace` (without it, changed content under a used id is rejected as `duplicate_id`). Cancel: `{"handpost":1,"id":"…","action":"cancel"}`. A rejected id was never used — fix it and resend the same id.
- JSON schema: `https://tanzir71.github.io/handpost/schema/handpost-post.v1.schema.json`. Full spec: `docs/INBOX_PROTOCOL.md` in github.com/tanzir71/handpost.

## Write atomically
```sh
mkdir -p inbox/.tmp && cat > "inbox/.tmp/$ID.md" <<'EOF'
…file content…
EOF
mv "inbox/.tmp/$ID.md" "inbox/$ID.md"
```

## Afterwards
Read `receipts/<id>.json` (state, per-platform status, url, warnings, errors). If the file went to `rejected/`, read `rejected/<file>.error.json`, fix the problem and write a new file.

Never write outside `./inbox/`; never edit `processed/`, `rejected/`, `receipts/` or the status file.

## Fixing selectors (only when asked)
If the owner asks you to fix a Handpost selector, follow `./selectors/README.md` instead: read the newest report under `selectors/reports/<platform>/`, and write only `selectors/proposed/<platform>.json`. The owner reviews and applies it in Handpost; it does nothing on its own.
