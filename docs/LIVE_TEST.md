# Owner live test checklist

These checks create real public posts. Run them manually; never put credentials in issue text, fixtures, screenshots, or logs. Delete test posts afterward from the platform UI if desired.

## Before each platform

1. Run `npm run check` and `npm run fingerprint -- --chrome`.
2. Open Relay → Accounts → Connect. Complete login and 2FA manually; verify status becomes `ok`.
3. Use a unique low-risk caption such as `Relay live smoke YYYY-MM-DD HH:mm`.
4. Schedule at least three minutes ahead (ten minutes for Instagram). Keep daily volume below the configured cap.
5. Confirm History ends in `published` with a permalink and proof screenshot. `unverified` is not a pass.

## Platform flows

- [ ] X: text-only post under 280 weighted characters; then one image with alt text; finally a four-image post.
- [ ] LinkedIn: text-only post; confirm the activity permalink and proof.
- [ ] Bluesky: text-only post and up to four images.
- [ ] Threads: text-only post; confirm the own-profile permalink.
- [ ] Facebook Page: verify the active identity is the Page, not the personal profile, before submit.
- [ ] Instagram: one feed image, then a two-image carousel; confirm crop handling and conservative pacing.
- [ ] TikTok: short test video; confirm long processing is waited on and profile verification succeeds.
- [ ] YouTube Shorts: vertical video ≤60 seconds; complete title/visibility/kids steps and verify in Studio content.
- [ ] Pinterest: image, title/description, destination and board; verify the created pin.

## Failure drills

- [ ] Log out of MockSocial or a disposable test session and confirm the target becomes `needs_login` without retrying credentials.
- [ ] Use the saved checkpoint fixture/test to confirm `suspected_detection` freezes the platform and moves queued work to manual handling.
- [ ] Break a fixture selector locally and confirm one retry, `ui_drift`, screenshot, and sanitized `_drift` DOM snapshot.
- [ ] Submit a known-invalid post and confirm an exact content error with no browser attempt.
- [ ] Force an unverified submission and confirm the notification and manual fallback.

Record the date, platform, Relay commit, result, and any permalink in a private owner log. Never commit live session artifacts.
