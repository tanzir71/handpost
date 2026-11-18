# Owner live test checklist

These checks create real public posts. Run them manually; never put credentials in issue text, fixtures, screenshots, or logs. Delete test posts afterward from the platform UI if desired.

## Before each platform

1. Run `npm run check` and `npm run fingerprint -- --chrome` (it opens your installed Chrome with a throwaway profile and confirms it does not report automation).
2. Open Handpost → Accounts → **Connect in Chrome**. Complete login and 2FA yourself in the window that opens; verify the status becomes `Connected` and the card shows your handle. If the handle stays "not captured yet", paste your profile link into **Your profile URL** (for Facebook, the Page's address).
3. **Rehearse first.** Press **Rehearse** on the card. Handpost fills the real composer with a harmless rehearsal text (plus a blank image for Instagram/Pinterest, or a video you pick for TikTok/YouTube), screenshots it and discards it — the Post button is never pressed. Check the screenshot: the text is in the right box, media attached, options filled. A failed rehearsal names the step that broke; fix that before posting live. The rehearsal also appears in History with outcome `rehearsal`.
4. Use a unique low-risk caption such as `Handpost live smoke YYYY-MM-DD HH:mm`.
5. Schedule at least three minutes ahead (ten minutes for Instagram). Keep daily volume below the configured cap.
6. Confirm History ends in `published` with a permalink and proof screenshot. `unverified` is not a pass.

## Platform flows

- [ ] X: text-only post under 280 weighted characters; a two-post thread; then one image with alt text; finally a four-image post.
- [ ] LinkedIn: text-only post; confirm the activity permalink and proof.
- [ ] Bluesky: text-only post and up to four images.
- [ ] Threads: text-only post; confirm the own-profile permalink.
- [ ] Facebook Page: verify the active identity is the Page, not the personal profile, before submit.
- [ ] Instagram: one feed image, then a two-image carousel; confirm crop handling and conservative pacing.
- [ ] TikTok: short test video; confirm long processing is waited on and profile verification succeeds.
- [ ] YouTube Shorts: vertical video ≤60 seconds; complete title/visibility/kids steps and verify in Studio content.
- [ ] Pinterest: image, title/description, destination and board; verify the created pin.

## Inbox to live

- [ ] With Auto-schedule still **off**, drop a file into `~/Handpost/inbox/` (or have a Claude scheduled task write it) with `mode: review`, one connected platform and `when: now`:

  ```markdown
  ---
  handpost: 1
  id: live-inbox-smoke-20261120
  platforms: [bluesky]
  when: now
  mode: review
  source: manual:live-smoke
  ---
  Handpost inbox live smoke — written as a file, approved by hand.
  ```

- [ ] Within a minute the file moves to `processed/YYYY-MM/` and the Inbox screen shows it **Held for review**; `receipts/live-inbox-smoke-20261120.json` says `"state": "held"`.
- [ ] Press **Approve & schedule**. When the post is published, the receipt reaches `"state": "published"` with the permalink in `targets[0].url`, and `handpost.status.json` lists it under `recent`.
- [ ] Drop the same file again: it becomes a `duplicate` (Inbox → Duplicates) and nothing posts twice.

## Failure drills

- [ ] Log out of MockSocial or a disposable test session and confirm the target becomes `needs_login` without retrying credentials.
- [ ] Use the saved checkpoint fixture/test to confirm `suspected_detection` freezes the platform and moves queued work to manual handling.
- [ ] Break a fixture selector locally and confirm one retry, `ui_drift`, screenshot, and sanitized `_drift` DOM snapshot.
- [ ] Submit a known-invalid post and confirm an exact content error with no browser attempt.
- [ ] Force an unverified submission and confirm the notification and manual fallback; *Retry verify* must only revisit the profile (no second post).
- [ ] Press *Pause publishing* on the Queue with a post due in a few minutes; confirm nothing opens until *Resume publishing*.
- [ ] Selector repair (docs/SELECTORS.md): in Accounts → X → *Selectors*, give *Post text box* a wrong selector with *Use only mine* and save; *Rehearse* must stop at “fill text” and the card must offer *Fix selectors*. *Copy prompt for Claude*, let Claude write `selectors/proposed/x.json`, then *Check against snapshot* (1+ match), *Rehearse with this fix* (passes, nothing posted) and *Apply*. Remove your wrong selector afterwards and Rehearse once more.
- [ ] Temporarily start Handpost with `HANDPOST_BROWSER=chrome` on a machine without Chrome: due posts become `needs_attention` (`chrome_missing`) and Accounts shows **Install Google Chrome** instead of crashing.

Record the date, platform, Handpost commit, result, and any permalink in a private owner log. Never commit live session artifacts.
