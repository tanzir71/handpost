# Handpost Inbox Protocol — v1

Status: **normative**. This is a public contract between Handpost and anything that writes posts for it (Claude scheduled tasks, Claude Code, Codex, scripts, people). Changing it means bumping `handpost: 2`, and updating `schema/`, `integrations/`, `examples/` and the inbox tests in the same commit.

Key words MUST, SHOULD and MAY are used in the RFC 2119 sense.

---

## 1. The idea in one paragraph

Handpost watches a folder. A writer drops one file per post into `inbox/`. Handpost validates it, schedules it (or holds it for review), publishes it through the owner's own Chrome at the right time, and keeps a **receipt** for it in `receipts/<id>.json`. It also maintains `handpost.status.json`, a snapshot of connected platforms, limits, free slots and recent results, so the next writer run can make good decisions and learn what happened. Nothing else is needed: no API, no server, no credentials.

```
writer (Claude / Codex / script)                    Handpost (desktop app)
──────────────────────────────────                  ──────────────────────────────────────
read  handpost.status.json  ◄───────────────────────  rewrites status on every change
write inbox/.tmp/<id>.md
rename → inbox/<id>.md      ───────────────────────►  watcher sees a stable file
                                                      parse → validate → schedule / hold
                                                      move file → processed/ or rejected/
read  receipts/<id>.json    ◄───────────────────────  receipt updated until terminal state
```

## 2. Folder layout

The **Handpost folder** defaults to `~/Handpost` (`%USERPROFILE%\Handpost` on Windows) and is configurable in Settings → Automation. Handpost creates it on first run.

```
Handpost/
├─ inbox/                     writers write here (subfolders allowed, e.g. inbox/media/)
│  └─ .tmp/                   optional staging area; always ignored by Handpost
├─ processed/YYYY-MM/         accepted files (and their media) are moved here
├─ rejected/                  rejected files + <file>.error.json beside each
├─ receipts/<id>.json         one receipt per post id, maintained by Handpost
├─ handpost.status.json       snapshot maintained by Handpost
└─ README.txt                 short human explainer written on first run
```

- Writers MUST only create files inside `inbox/`. Writers MAY read everything else.
- Handpost MUST NOT modify files inside `inbox/` other than moving them out once processed.
- Handpost owns `processed/`, `rejected/`, `receipts/` and `handpost.status.json`; writers MUST NOT edit them.

## 3. Writing a file safely

1. Write media (if any) first, anywhere under `inbox/` (convention: `inbox/media/`).
2. Write the post to `inbox/.tmp/<name>` **or** to `inbox/<name>.tmp`.
3. Rename it to its final name `inbox/<name>.md` or `inbox/<name>.json` (same volume ⇒ atomic).

Handpost ignores, at any depth under `inbox/`:
- anything inside a `.tmp/` directory;
- names starting with `.` or `~$`;
- names ending with `.tmp`, `.part`, `.partial`, `.crdownload`, `.swp`, `~`;
- `README*`;
- every extension other than `.md`, `.markdown`, `.json` (those are media or unrelated files; they are only used when referenced).

Because sync clients (Dropbox, OneDrive, Google Drive) and some tools cannot rename atomically, Handpost additionally waits until a candidate's size and mtime are unchanged for **2 seconds** before reading it.

File constraints: UTF-8 (a leading BOM MUST be accepted and stripped — PowerShell 5 writes one), LF or CRLF line endings, at most **256 KB** per post file, at most **50** posts per batch file.

## 4. File formats

### 4.1 Markdown (`.md`, `.markdown`) — one post

YAML front matter between two `---` lines, then the **body**, which becomes `text` (the base post text). One trailing newline is trimmed; everything else is kept verbatim, including blank lines.

```markdown
---
handpost: 1
id: weekly-tips-20261120-folder-scheduling
platforms: [x, linkedin, bluesky]
when: "2026-11-20T09:30:00+06:00"
source: claude:weekly-tips
media:
  - path: media/tip-047.png
    alt: The Handpost inbox with three posts arriving from Claude
overrides:
  x:
    text: |
      Tip #47 — schedule posts from a folder.
      Drop a .md file in your Handpost inbox; it lands in the queue, paced like a human.
  linkedin:
    first_comment: Source and downloads: github.com/tanzir71/handpost
labels: [weekly-tip]
---
Tip #47 — Schedule posts from a folder.

Drop a markdown file in your Handpost inbox and it lands in the queue, paced like a human. Every post ends with a receipt.
```

YAML is parsed as **YAML 1.2, core schema** only: no custom tags, alias count capped (≤ 50), no merge keys. Under that schema an unquoted timestamp stays a string, but many other YAML tools (PyYAML, YAML 1.1) turn it into a date object — so writers SHOULD quote `when`, and Handpost MUST also accept a date value its parser hands back by converting it to ISO 8601 with the original offset. A file whose front matter is missing or unparsable is rejected with `parse_error`.

### 4.2 JSON (`.json`) — one post, a batch, or a cancel

```json
{ "handpost": 1, "id": "release-0-4-x", "platforms": ["x"], "when": "next-slot",
  "text": "Handpost 0.4 is out: inbox receipts, rehearsal mode and a calmer composer." }
```

Batch (each item is a post; `handpost` is optional inside items):

```json
{ "handpost": 1, "posts": [ { "id": "a", "platforms": ["x"], "text": "…" },
                            { "id": "b", "platforms": ["bluesky"], "text": "…" } ] }
```

Cancel a scheduled post:

```json
{ "handpost": 1, "id": "weekly-tips-20261120-folder-scheduling", "action": "cancel" }
```

The machine-readable schema is `schema/handpost-post.v1.schema.json` (also published at `https://tanzir71.github.io/handpost/schema/handpost-post.v1.schema.json`). For Markdown, validation applies to the front matter object with `text` set to the body.

## 5. Fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `handpost` | `1` | yes (top level) | Protocol version. Anything else → `unsupported_version`. |
| `id` | string `^[a-z0-9][a-z0-9._-]{0,79}$` | yes | Idempotency key, unique within one Handpost folder. Writers SHOULD derive it deterministically from the task and content date, e.g. `weekly-tips-20261120-folder-scheduling`. |
| `platforms` | array of platform ids, 1–9, unique | yes | `x`, `linkedin`, `bluesky`, `threads`, `facebook`, `instagram`, `tiktok`, `youtube`, `pinterest`. |
| `text` | string ≤ 100 000 | yes (JSON) / body (MD) | Base text for every platform without an override. May be empty only for video/image-only platforms. |
| `when` | string | no, default `next-slot` | `now`; `next-slot`; ISO 8601 with offset or `Z` (`2026-11-20T09:30:00+06:00`); or naive local `YYYY-MM-DDTHH:mm[:ss]`, interpreted in Handpost's time zone with warning `naive_time`. |
| `mode` | `schedule` \| `review` \| `draft` | no, default `schedule` | `schedule` follows the Auto-schedule setting. `review` always holds in Inbox for approval. `draft` creates a draft in Compose and never schedules. |
| `media` | array (≤ 10) of `{ path, alt? }` | no | `path` is relative to the post file's directory (forward slashes; backslashes are normalized). Must resolve inside `inbox/` unless the owner enabled “Allow media outside the inbox folder”. `alt` ≤ 2 000 chars. Order is preserved. |
| `overrides` | object keyed by platform id | no | Per-platform `{ text?, thread?, first_comment?, options? }` (see §5.1). Keys must also appear in `platforms`. |
| `labels` | array (≤ 10) of `^[a-z0-9-]{1,32}$` | no | Free tags for filtering in the app. |
| `source` | string `^[a-z0-9-]+(:[A-Za-z0-9._-]+)?$` ≤ 120 | no, SHOULD | Provenance `<tool>:<task>`. First segment drives the Source chip: `claude`, `codex`, `git`, `manual`, anything else → `other`. |
| `on_conflict` | `skip` \| `replace` | no, default `skip` | What to do when `id` already exists with different content (§7). |
| `action` | `upsert` \| `cancel` | no, default `upsert` | `cancel` takes only `handpost` and `id`. |

Unknown fields are an error (`schema_invalid`). This is deliberate: it catches `platform:` vs `platforms:` style mistakes before anything posts.

### 5.1 Overrides

| Key | Applies to | Meaning |
|---|---|---|
| `text` | all | Replaces `text` for that platform. |
| `thread` | `x` | Extra posts after the first, in order (≤ 24). Stored as the existing `options.threadParts`. |
| `first_comment` | `x`, `linkedin`, `threads`, `facebook` | Posted as the first comment/reply after verification. |
| `options` | platform-specific | Object of string/boolean values, mapped to adapter option fields: `facebook.page_name` (**required** for Facebook) → `pageName`; `tiktok.cover_time` → `coverTime`; `youtube.title`, `youtube.visibility` (`public`\|`unlisted`\|`private`), `youtube.made_for_kids` (boolean) → `title`, `visibility`, `madeForKids`; `pinterest.title`, `pinterest.destination_url`, `pinterest.board` → `title`, `destinationUrl`, `board`. Unknown option keys → `schema_invalid`. |

## 6. Processing (what Handpost does)

Processing runs one item at a time (global concurrency 1), in order of file mtime.

1. **Discover** — recursive watch on `inbox/` plus a full rescan at startup, every 60 s, and on resume from sleep. Watch events are hints; the rescan is the truth.
2. **Filter & settle** — apply §3 ignore rules; wait for a 2 s stable size/mtime.
3. **Parse** — Markdown front matter or JSON. Failure → reject `parse_error`; > 256 KB → `too_large`.
4. **Schema** — validate against the v1 schema. Failure → reject `schema_invalid` with JSON-pointer paths.
5. **Batch split** — each post in a batch is processed independently and gets its own receipt. A batch file goes to `processed/` if at least one post was accepted, otherwise to `rejected/`.
6. **Idempotency** — see §7.
7. **Media** — resolve with `realpath`; reject `media_outside_root` if the resolved path escapes the inbox root (symlinks included). If a file is missing, the item enters `waiting_media` and is retried on every rescan for **10 minutes** from first sight, then rejected `media_missing`. Type is checked by extension and magic bytes (images: png, jpg/jpeg, gif, webp; video: mp4, mov, webm) → `media_unsupported`; size/duration/dimensions via the existing media inspector → `media_too_large` or capability errors.
8. **Content** — render each platform (overrides applied) and run the existing capability validation. Any error on any platform rejects the **whole post** with `content_invalid` (errors list the platform). Capability warnings (e.g. LinkedIn's “see more” fold) become receipt warnings.
9. **Time** — resolve `when` per platform:
   - ISO with offset/Z → that instant. Naive → Handpost time zone + warning `naive_time`.
   - `now` → now + 60 s.
   - `next-slot` → the account's next free queue slot. If the platform has no slots configured, use the default template (every day 09:30 and 17:30 local) + warning `default_slots_used`.
   - In the past by < 2 h → now + 60 s + warning `late`. By ≥ 2 h → reject `stale_time`.
   - Jitter (±90 s), cooldowns and daily caps are applied by the scheduler exactly as for posts made in the app. If a cap would be exceeded that day, accept with warning `over_daily_cap` (the scheduler defers it).
10. **Accounts** — a platform that is not connected or needs login is accepted with warning `platform_not_connected` (the target will be `needs_login` at fire time). A frozen platform is accepted with warning `platform_frozen` (the target goes to manual handling if still frozen at fire time).
11. **Decide state** — `mode: draft` → `draft`. `mode: review`, or Auto-schedule off → `held`. Otherwise → `scheduled`.
12. **Commit** — one SQLite transaction: `posts`, `post_targets`, managed media copies, `inbox_items`. Only after commit:
13. **Move** — the post file to `processed/YYYY-MM/<name>` (suffix `-1`, `-2`… on collision). Referenced media move to `processed/YYYY-MM/media/` unless another unprocessed file in `inbox/` references the same path.
14. **Receipt + status** — write `receipts/<id>.json` and refresh `handpost.status.json` (debounced 2 s). All writes are atomic (temp file + rename).
15. **Notify** — desktop notification for `rejected` and `held` items (respecting the notifications setting).

Rejected files move to `rejected/<name>` with `rejected/<name>.error.json`:

```json
{ "handpost": 1, "file": "inbox/2026-11-21-launch.md", "id": "launch-day-3",
  "received_at": "2026-11-18T03:14:07Z",
  "errors": [ { "code": "media_missing", "message": "media/day3.jpg was not found after 10 minutes", "path": "/media/0/path" } ] }
```

If the rejected file had a parseable `id`, a receipt with `state: "rejected"` is written too. Rejections without an id are recorded under the synthetic id `file-<first 12 hex of sha256>`.

**Crash safety.** If Handpost stops after step 12 but before step 13, the next run sees the same file again; step 6 finds the same id and content hash, treats it as `duplicate`, and moves the file — no second post.

## 7. Idempotency, replace and cancel

The content hash is SHA-256 of the canonical JSON (sorted keys, normalized line endings) of the parsed post, excluding `on_conflict`.

| Situation | Result |
|---|---|
| New id | Process normally. |
| Same id, same hash | `duplicate`: nothing changes; file moves to `processed/`; existing receipt untouched. |
| Same id, different hash, `on_conflict: skip` | Reject `duplicate_id`. |
| Same id, different hash, `on_conflict: replace`, no target `publishing`/`published` | Update the post and every target (times re-resolved, re-jittered). Receipt `replaced_at` set. |
| Same as above but a target is already `publishing`/`published` | Reject `already_publishing`. |
| `action: cancel`, nothing published yet | Targets → `cancelled`; receipt state `cancelled`. |
| `action: cancel`, some target published | Unpublished targets cancelled; receipt keeps `partial`; warning `partially_published`. |
| `action: cancel` for unknown id | Reject `unknown_id`. |

Ids are never reused for a different post, even after the receipt is pruned (the `inbox_items` row is kept).

## 8. Receipts — `receipts/<id>.json`

Rewritten atomically whenever the item or any of its targets changes, until a terminal state. Kept for 90 days after the terminal state, then pruned.

```json
{
  "handpost": 1,
  "id": "weekly-tips-20261120-folder-scheduling",
  "state": "published",
  "source": "claude:weekly-tips",
  "file": "processed/2026-11/2026-11-20-tip-047.md",
  "received_at": "2026-11-18T03:14:07Z",
  "updated_at": "2026-11-20T03:31:02Z",
  "mode": "schedule",
  "warnings": [ { "code": "text_folds", "platform": "linkedin", "message": "Text will fold behind “see more” after 210 characters" } ],
  "errors": [],
  "targets": [
    { "platform": "x", "status": "published", "scheduled_at": "2026-11-20T03:30:00Z", "published_at": "2026-11-20T03:31:02Z",
      "url": "https://x.com/tanzir/status/1859…", "error": null },
    { "platform": "linkedin", "status": "scheduled", "scheduled_at": "2026-11-20T03:30:00Z", "published_at": null, "url": null, "error": null }
  ]
}
```

`state` (item): `waiting_media`, `held`, `draft`, `scheduled`, `publishing`, `published` (all targets published), `partial`, `failed`, `cancelled`, `rejected`, `duplicate`.
Target `status`: the app's target statuses — `draft`, `scheduled`, `publishing`, `published`, `unverified`, `failed`, `needs_login`, `needs_attention`, `manual`, `cancelled`. `error` is `{ "code", "class", "message" }` when present (`class` is the engine's error taxonomy: `transient`, `session`, `content`, `ui_drift`, `suspected_detection`).

Receipts never contain cookies, file system paths outside the Handpost folder, or screenshots (proof stays in the app's data directory; the app shows it).

## 9. Status — `handpost.status.json`

Rewritten atomically on every relevant change and at least every 5 minutes while the app runs.

```json
{
  "handpost": 1,
  "app_version": "0.2.0",
  "generated_at": "2026-11-18T03:14:09Z",
  "alive_until": "2026-11-18T03:24:09Z",
  "timezone": "Asia/Dhaka",
  "inbox": { "auto_schedule": true, "accepts": ["md", "json"], "max_file_kb": 256, "media_outside_inbox": false },
  "platforms": {
    "x": { "connected": true, "status": "ok", "handle": "@tanzir", "daily_cap": 4, "scheduled_today": 2, "frozen_until": null,
           "next_free_slots": ["2026-11-18T04:30:00Z", "2026-11-18T11:00:00Z", "2026-11-19T04:30:00Z"],
           "limits": { "max_chars": 280, "max_media": 4, "media_kinds": ["image", "video"], "threads": true } },
    "instagram": { "connected": true, "status": "frozen", "frozen_until": "2026-11-19T08:20:00Z", "…": "…" }
  },
  "upcoming": [ { "id": "weekly-tips-20261120-folder-scheduling", "platforms": ["x", "linkedin"], "scheduled_at": "2026-11-20T03:30:00Z", "state": "scheduled", "preview": "Tip #47 — Schedule posts from a folder…" } ],
  "recent":   [ { "id": "daily-digest-20261118", "platform": "linkedin", "status": "published", "published_at": "2026-11-18T02:15:40Z", "url": "https://www.linkedin.com/feed/update/…" } ]
}
```

- `upcoming`: next 14 days, max 100. `recent`: last 14 days, max 100.
- `preview` (first 120 characters) is present only when “Include post text in status file” is on.
- `alive_until` = `generated_at` + 10 minutes. A writer that sees an older value SHOULD still write its file (Handpost processes the inbox on next start) and SHOULD say in its own output that Handpost appears not to be running.

## 10. Error and warning codes

Errors (item rejected): `parse_error`, `too_large`, `unsupported_version`, `schema_invalid`, `content_invalid`, `media_missing`, `media_outside_root`, `media_unsupported`, `media_too_large`, `stale_time`, `duplicate_id`, `already_publishing`, `unknown_id`, `internal_error`.

Warnings (item accepted): `naive_time`, `late`, `default_slots_used`, `over_daily_cap`, `platform_not_connected`, `platform_frozen`, `text_folds` and any other capability warning, `partially_published`.

## 11. Security model

- The inbox is a trust boundary: **anything that can write to `inbox/` can publish to the owner's connected accounts.** Keep the folder local, or in a sync service the owner fully controls. The first time Auto-schedule is turned on, the app says this in plain words.
- Media cannot be read from outside `inbox/` unless the owner opts in (prevents a crafted file from posting `~/.ssh/id_rsa` as an “image”).
- Handpost never executes anything found in the inbox and never fetches URLs from it. Media must be files.
- All guardrails apply to inbox posts exactly as to posts made in the app: global concurrency 1, cooldowns, daily caps, jitter, the 24 h circuit breaker, manual login only.

## 12. Optional remote source (Git)

For writers that run in the cloud and cannot reach the owner's computer, the owner MAY configure one Git repository (Settings → Automation → Remote source). Handpost clones it into `Handpost/.sources/<name>/` with the system `git` and the owner's existing credentials, pulls every 5 minutes, and treats `<clone>/inbox/` as an additional inbox root with `source` defaulting to `git:<name>`. Files in the clone are never moved; processed state is tracked by id + hash in the database. Receipts are written locally; pushing receipts back to a `receipts/` folder in the repo is a separate opt-in. This is the only network access Handpost makes besides the platforms themselves, and it is off by default.

## 13. Versioning

`handpost: 1` files will be accepted by every future Handpost release. A future `handpost: 2` will be announced in the status file (`inbox.accepts_versions`), and writers SHOULD keep writing the highest version listed there.
