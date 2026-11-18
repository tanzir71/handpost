# Fixing selectors

Handpost finds every control on a platform's page — the post text box, the Post button, the "Next" button of a wizard — through a list of selectors. Platforms redesign their pages often; when they do, a selector stops matching and that step fails. This page describes how an owner fixes that without waiting for a new Handpost release: by hand in the app, or by letting Claude (or any agent) propose a fix that the owner reviews.

Format version: **`handpost-selectors/1`**. Schema: [`schema/handpost-selectors.v1.schema.json`](../schema/handpost-selectors.v1.schema.json) (published at `https://tanzir71.github.io/handpost/schema/handpost-selectors.v1.schema.json`). Agent instructions: [`integrations/claude/handpost-selectors/SKILL.md`](../integrations/claude/handpost-selectors/SKILL.md), also written to `<Handpost folder>/selectors/README.md`.

## 1. Slots

A **slot** is one selector list of a platform adapter (`src/main/adapters/configs.ts` and `adapters/<platform>/selectors.ts`). Slot names:

| Slot | Used for |
|---|---|
| `loggedIn`, `challenged` | Home page: logged-in marker; captcha/checkpoint marker |
| `composer`, `text`, `file` | Compose page: the open composer, the post text box, the file input |
| `submit`, `success` | The Post button (never clicked during Rehearse) and the "posted" signal |
| `post`, `permalink`, `profileLink`, `identity` | Own profile: published posts, the link to each, the own-profile link |
| `discard` | Rehearse: the "Discard draft?" confirmation |
| `comment.input`, `comment.submit` | First comment (X, LinkedIn, Threads, Facebook, Instagram) |
| `altText.open`, `altText.input`, `altText.save` | Image descriptions (X, Bluesky, Instagram) |
| `thread.add`, `thread.text` | X threads |
| `flow:<step name>` | Wizard steps, e.g. `flow:confirm crop`, `flow:continue upload wizard` |
| `option:<key>`, `option:<key>:false` | Platform options, e.g. `option:title`, `option:madeForKids:false` |

Accounts → *platform* → **Selectors** lists the slots of each platform with their built-in selectors.

## 2. What happens when a step fails

When a step times out waiting for its element (Playwright's `locator.…: Timeout`), or a selector is invalid, Handpost writes a **repair report** into the Handpost folder — during a scheduled publish and during Rehearse alike:

```
<Handpost folder>/selectors/
  README.md                              the agent instructions (the handpost-selectors skill)
  reports/<platform>/<time>/report.json  what failed
  reports/<platform>/<time>/page.html    the page at that moment, privacy-reduced
  reports/<platform>/<time>/screenshot.png
  proposed/<platform>.json               a fix waiting for the owner (written by an agent)
  archive/                               applied and discarded proposals
```

`report.json` (`handpost-selector-report/1`): `platform`, `at`, `kind`, `step`, `slots` (the slots that step uses), `selectors` (what was tried, per slot), `error` (first line), `page` (origin and path, no query), `appVersion`, `files`.

- `kind: "failed"` — the step could not find its element.
- `kind: "possible"` — a symptom drift can cause: the session check found no logged-in marker (it looks exactly like being logged out), or verification did not find the post on the profile. These may well be a real logout or a slow profile; check the screenshot first.

**`page.html` is reduced for privacy**, because a logged-in page holds other people's names and posts: scripts, styles, `<noscript>`/`<template>`, inline styles, SVG path data and `srcset` are removed; form values are dropped; links lose their query strings and fragments; `data:` URIs are replaced; any text run longer than 40 characters becomes `[text, N chars]` and any attribute value longer than 80 characters (except `href`, `src`, `class`, `id`) becomes `[N chars]`. Tags, short labels and attributes such as `data-testid`, `aria-label`, `role`, `name` and `placeholder` — what selectors are made of — stay. Handpost keeps the newest five reports per platform, and retries of the same step within ten minutes reuse the existing report. If the Handpost folder is in a sync service, these files sync too.

The Accounts card shows "“fill text” could not find its element" with **Fix selectors** for a failure in the last seven days.

## 3. Fixing it yourself

Accounts → *platform* → **Selectors** → *Your selectors*: one selector per line for any slot (CSS, plus Playwright's `:has-text()`, `:has()` and `text=`). They are tried **together with** the built-in selectors — whichever matches first in the page wins — unless you tick **Use only mine**, which drops the built-in ones for that slot (use it when a built-in selector now matches the wrong element). **Save my selectors**, then **Rehearse**. **Remove my selectors** returns to the built-in ones.

Applied fixes are stored in Handpost's database (settings `selectors:<platform>`), are included in Settings → Data → Export, and take effect for the next publish or Rehearse.

## 4. Letting Claude propose a fix

1. In the Selectors dialog, **Copy prompt for Claude** and paste it into Claude (a Claude scheduled task or Claude Code session with the Handpost folder attached, or any agent that can read and write that folder). The prompt names the report, the snapshot, the guide (`selectors/README.md`) and the file to write.
2. The agent writes `selectors/proposed/<platform>.json`:

   ```json
   {
     "format": "handpost-selectors/1",
     "platform": "x",
     "note": "X renamed the composer's test id; the editable box is now inside tweetTextarea_0RichTextInputContainer.",
     "slots": {
       "text": ["[data-testid=\"tweetTextarea_0RichTextInputContainer\"] [contenteditable=\"true\"]"]
     }
   }
   ```

   Fields: `format` (always `handpost-selectors/1`), `platform`, `note` (shown to the owner), `slots` (slot → 1–10 selectors, each one line, ≤ 500 characters), optional `replace` (slots whose built-in selectors are dropped; each must be in `slots`). Unknown fields, unknown slots, empty or multi-line selectors make the file invalid; the dialog lists the problems and **Apply** stays disabled.
3. The Accounts card says "A selector fix is waiting for your review". In the dialog:
   - **Check against snapshot** loads `page.html` into a headless browser with JavaScript off and every request blocked, and counts what each proposed selector matches. "No match" on a slot of the failed step means the fix is wrong; slots of other steps say "not on this page".
   - **Rehearse with this fix** runs a normal Rehearse with the proposal layered on top, without applying it. Like every Rehearse it stops before Post, so a fix for `submit` or `success` is proven only by the next real post.
   - **Apply** merges the proposal into your current fix (slots it names replace yours) and moves the file to `selectors/archive/`; **Discard** only moves it.

**Why a proposal never applies itself:** anything that can write to the Handpost folder can already queue posts, but a selector decides *which control Handpost clicks* on a logged-in page. A bad or malicious `submit` selector could press "Delete" or "Follow". So proposals are inert files until the owner applies them in the app, and the app never reads selectors from anywhere else.

## 5. Fixing it in the source (developers)

From a checkout: capture a sanitized fixture of the new page (`npm run capture -- --platform=x --step=compose --url=…`), update `src/main/adapters/<platform>/selectors.ts` (or `configs.ts` for flow steps and options), and run `npm run contract`. A fix that worked as an owner override is a good candidate for the built-in list; the report's `page.html` can serve as the starting fixture. Ship it in a release so every owner gets it.
