---
name: handpost-inbox
description: Schedule social posts through the Handpost desktop app by writing a post file into its inbox folder, and read back what was published. Use when a task asks to schedule, queue or publish a post via Handpost, or to check Handpost receipts.
---

# Handpost inbox

Handpost is a desktop app on the owner's computer. It watches a folder and publishes whatever valid post files appear in `inbox/`, through the owner's own logged-in Chrome, at human pace. You never touch a social platform directly — you only write a file and later read a receipt.

Full spec: `docs/INBOX_PROTOCOL.md` in the Handpost repo (https://github.com/tanzir71/handpost). Schema: `https://tanzir71.github.io/handpost/schema/handpost-post.v1.schema.json`.

## 0. Find the Handpost folder

Default `~/Handpost` (`%USERPROFILE%\Handpost` on Windows); the owner may have moved it — use the folder the task names or the one attached to this session. It contains `inbox/`, `receipts/` and `handpost.status.json`.

If you cannot reach that folder with any file tool you have, **stop and report it**. Never write the post somewhere else, and never try to post on a platform yourself.

## 1. Read the status first

Read `handpost.status.json`:
- `platforms.<id>.connected` / `status` — only target platforms that are `ok`. Mention any that need login or are frozen.
- `platforms.<id>.limits` — `max_chars`, `max_media`, `media_kinds`, `threads`. Count characters yourself and stay under the limit with margin (X counts every URL as 23 characters).
- `platforms.<id>.next_free_slots`, `daily_cap`, `scheduled_today` — prefer `when: next-slot` unless the task gives a time.
- `upcoming` and `recent` — do not write something that repeats a post from the last 14 days.
- `alive_until` older than now → Handpost is probably not running. Still write the file (it is processed on next start) but say so in your summary.

No status file → write anyway with `when: next-slot`, and say you could not confirm which platforms are connected.

## 2. Write the post file

One file per post, Markdown with YAML front matter. The body is the base text.

```markdown
---
handpost: 1
id: <task>-<yyyymmdd>-<short-slug>
platforms: [x, linkedin, bluesky]
when: next-slot
source: claude:<task-name>
overrides:
  x:
    text: |
      Shorter version for X (≤ 280 chars).
  linkedin:
    first_comment: "Link or extra context goes here"
labels: [<topic>]
---
Base text used for every platform without an override.
```

Rules:
- `handpost: 1`, `id`, `platforms` and the body are required. Unknown fields are rejected — spell them exactly as above.
- `id`: lowercase `a–z 0–9 . _ -`, max 80, **deterministic** (same task + same date + same topic ⇒ same id). If this task runs twice, the second file becomes a harmless duplicate instead of a second post.
- `when`: `next-slot` (default), `now`, or an ISO time with offset in quotes, e.g. `"2026-11-20T09:30:00+06:00"`. Times more than 2 hours in the past are rejected.
- `mode: review` makes the owner approve it in Handpost first — use it when the task says so or when the content is sensitive. `mode: draft` only creates a draft.
- Platform ids: `x`, `linkedin`, `bluesky`, `threads`, `facebook`, `instagram`, `tiktok`, `youtube`, `pinterest`. Facebook needs `overrides.facebook.options.page_name`. Instagram needs an image; TikTok and YouTube need a video.
- X threads: `overrides.x.thread: ["second post", "third post"]`.
- Media: save the file inside `inbox/media/` first, then reference it relative to the post file: `media: [{ path: media/chart.png, alt: "Bar chart of …" }]`. Always write alt text. Never reference files outside the Handpost folder.
- Changing an already scheduled post: write the same `id` again with `on_conflict: replace`. Cancelling: write `{"handpost": 1, "id": "<id>", "action": "cancel"}` as `inbox/cancel-<id>.json`.

## 3. Write it atomically

Write to a temporary name first, then rename, so Handpost never reads half a file.

bash / zsh:
```bash
H="$HOME/Handpost"; ID="weekly-tips-20261120-folder-scheduling"
mkdir -p "$H/inbox/.tmp"
cat > "$H/inbox/.tmp/$ID.md" <<'EOF'
---
handpost: 1
id: weekly-tips-20261120-folder-scheduling
platforms: [x, linkedin]
when: next-slot
source: claude:weekly-tips
---
Tip #47 — Schedule posts from a folder.
EOF
mv "$H/inbox/.tmp/$ID.md" "$H/inbox/$ID.md"
```

PowerShell:
```powershell
$H = "$env:USERPROFILE\Handpost"; $id = "weekly-tips-20261120-folder-scheduling"
New-Item -ItemType Directory -Force "$H\inbox\.tmp" | Out-Null
Set-Content -Path "$H\inbox\.tmp\$id.md" -Value $content -Encoding utf8
Move-Item -Force "$H\inbox\.tmp\$id.md" "$H\inbox\$id.md"
```

If you only have a "write file" tool and no rename, write `inbox/<id>.md.tmp` and then write the final `inbox/<id>.md` with identical content — Handpost waits until a file is stable for 2 seconds before reading it.

## 4. Check the result

- Within a minute the file leaves `inbox/`: it moves to `processed/YYYY-MM/` (accepted) or `rejected/` (with `<file>.error.json` explaining why — fix and write a new file).
- `receipts/<id>.json` has `state` (`held`, `scheduled`, `published`, `partial`, `failed`, `rejected`, `duplicate`, …), per-platform `status`, `scheduled_at`, `url` once published, and `warnings`/`errors` with codes.
- On a later run, read receipts of your earlier ids and report published URLs or failures in your summary.

## 5. Never

- Never post, log in, or open a social platform yourself; Handpost does that.
- Never put passwords, cookies, tokens or personal data that should not be public into a post or file.
- Never edit `processed/`, `rejected/`, `receipts/` or `handpost.status.json`.
- Never bypass a rejection by renaming the id to dodge `duplicate_id` unless the content really is a different post.

## Summary to give the owner

End with: the file you wrote (path), the id, target platforms, when it will go out (from the receipt if it already exists, otherwise what you requested), and any warnings — e.g. "Threads needs login", "LinkedIn text folds after 210 characters", or "Handpost doesn't appear to be running".
