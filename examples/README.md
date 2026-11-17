# Inbox examples

Valid protocol-v1 files. They double as test fixtures: H2 copies them into `tests/fixtures/inbox/` and asserts they validate against `schema/handpost-post.v1.schema.json` and are accepted by the inbox service.

| File | Shows |
|---|---|
| `inbox/2026-11-20-weekly-tip.md` | Markdown post, three platforms, X override, LinkedIn first comment, exact time with offset |
| `inbox/release-0-4.json` | Batch of two posts using `next-slot`, an X thread and `mode: review` |
| `inbox/cancel-weekly-tip.json` | Cancelling a scheduled post by id |
| `receipts/weekly-tips-20261120-folder-scheduling.json` | What Handpost writes back once the first target is published |
| `handpost.status.json` | The snapshot writers read before writing |

Media is omitted so the examples stay valid without binary files; see `docs/INBOX_PROTOCOL.md` §4.1 for a media example.
