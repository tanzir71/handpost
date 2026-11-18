---
name: handpost-selectors
description: Repair the selectors the Handpost desktop app uses on a social platform after the platform changed its page, by reading Handpost's failure report and writing a proposed fix that the owner reviews and applies. Use when Handpost says a step "could not find its element", or the owner asks to fix or update Handpost selectors.
---

# Fixing Handpost selectors

Handpost publishes by driving the owner's own logged-in browser. Every step finds its control through a list of selectors called a **slot** (`text` is the post text box, `submit` the Post button, …). When a platform redesigns a page, a slot stops matching and that step fails. Handpost then saves a **report** with a privacy-reduced copy of the page. You read the report, work out selectors that match the new page, and write them to a **proposal** file. The owner checks it against the snapshot, rehearses it and applies it in Handpost — a proposal changes nothing on its own.

You never open the platform, log in, drive a browser, or change Handpost's settings. You only read files and write one proposal file.

Full spec: `docs/SELECTORS.md` in the Handpost repo (https://github.com/tanzir71/handpost). Schema: `https://tanzir71.github.io/handpost/schema/handpost-selectors.v1.schema.json`.

## 0. Find the files

The Handpost folder is `~/Handpost` by default (`%USERPROFILE%\Handpost` on Windows); use the folder the task names or the one attached to this session. Inside it, `selectors/`:

- `reports/<platform>/<time>/report.json` — the newest `<time>` folder is the latest problem. Fields: `platform`, `step` (what failed), `slots` (the slots that step uses), `selectors` (what was tried, per slot), `error`, `page` (URL without query), `kind`, `files`.
- `reports/<platform>/<time>/page.html` — the page at the moment of failure. Scripts and styles are removed, long text is replaced by `[text, N chars]` and long attribute values by `[N chars]`; tags, short labels (buttons, headings, field names) and attributes such as `data-testid`, `aria-label`, `role`, `name` and `placeholder` are intact.
- `reports/<platform>/<time>/screenshot.png` — what the page looked like. Look at it if you can view images.
- `proposed/<platform>.json` — where your fix goes. One file per platform; replace your own earlier proposal if there is one.

If you cannot reach the folder with the file tools you have, **stop and say so**.

## 1. Understand the problem

- `kind: "failed"` — the step named in `step` waited for every selector of its slots and none matched. Those selectors are in `report.selectors`; none of them is in `page.html` (or matches the right element) any more.
- `kind: "possible"` — a symptom that drift can cause: `check session` found no logged-in marker, or `verify on own profile` did not find the post. First decide from `page.html` and the screenshot whether the page really shows the logged-in app or the post. If it shows a login form, a checkpoint or an empty profile, the owner has to act (log in, complete the check) — say that and **write no proposal**.

## 2. Find the right element in page.html

Search `page.html` for the control by its label, `role`, `aria-label`, `data-testid` (`data-e2e`, `data-test-id`), `placeholder` or `name`. Make sure it is the control the slot is for:

- `text`: the editable element of the compose box (`contenteditable` or `textarea`) — not the search field or a reply box elsewhere on the page.
- `submit`: the compose box's own Post/Share button — not a "Posts" tab, a reply button or a menu item. This is the one control Handpost clicks to publish; be strict.
- `composer`: something that exists once the composer is open (often the text box itself).
- `post` (on the profile): one element per published post, containing the post text. `permalink`: a link inside such a post whose `href` is the post's own URL.
- `flow:<name>` and `option:<key>`: the button or field the step name describes.

## 3. Write the selectors

- Prefer, in this order: test ids (`[data-testid="…"]`, `[data-e2e="…"]`, `[data-test-id="…"]`); `aria-label` (exact, or `*=` for a stable part); role plus name (`button:has-text("Post")`, `[role="textbox"][aria-label*="Post text"]`); `name` / `placeholder`; short, stable structure (`form [contenteditable="true"]`).
- Avoid generated class names (`.css-1dbjc4n`, `.x1n2onr6`, `._ab8w`), `:nth-child` chains, and text that changes with the owner's language unless nothing else exists.
- Syntax is Playwright's: any CSS selector, plus `:has-text("…")`, `:has(…)` and `text=…`. One selector per string, on one line, at most 500 characters, at most 10 per slot.
- Every selector you give must match the intended element in `page.html`, and only it (when several elements match, Handpost uses the first in document order). Give two or three alternatives built from different hooks, so the next small change does not break the slot again.
- Include only the slots that need a change. Your selectors are tried **together with** the built-in ones. Add a slot to `replace` only when a built-in selector now matches the *wrong* element — never casually for `submit`.

## 4. The proposal file

Write `selectors/proposed/<platform>.json` (write `<platform>.json.tmp` first, then rename it):

```json
{
  "format": "handpost-selectors/1",
  "platform": "x",
  "note": "X renamed the composer's test id; the editable box is now inside tweetTextarea_0RichTextInputContainer.",
  "slots": {
    "text": [
      "[data-testid=\"tweetTextarea_0RichTextInputContainer\"] [contenteditable=\"true\"]",
      "div[role=\"textbox\"][aria-label*=\"Post text\"]"
    ]
  }
}
```

- `format` is always `handpost-selectors/1`; `platform` is the report's platform.
- `note` (required in practice): one or two sentences on what changed on the page and what you matched instead. The owner reads it before applying.
- `slots`: slot name → selectors. Slot names: `loggedIn`, `challenged`, `composer`, `text`, `file`, `submit`, `success`, `post`, `identity`, `profileLink`, `permalink`, `discard`, `comment.input`, `comment.submit`, `altText.open`, `altText.input`, `altText.save`, `thread.add`, `thread.text`, `flow:<step name>`, `option:<key>`, `option:<key>:false`. Not every platform has every slot; the report names the ones that failed, and Handpost → Accounts → <platform> → Selectors lists them all.
- `replace` (optional): slot names whose built-in selectors are dropped.

Handpost rejects files with unknown fields, unknown slots, empty or multi-line selectors.

## 5. Hand over

Tell the owner which slots you changed and why (your note), then: open Handpost → Accounts → <platform> → **Selectors** → **Check against snapshot** → **Rehearse with this fix** → **Apply**. Never claim the fix works — only the owner's Rehearse shows that, and Rehearse stops before Post, so a fix for `submit` or `success` is only proven by the next real post.

## Never

- Never write anywhere except `selectors/proposed/`.
- Never edit `report.json`, `page.html`, the app's database, settings or browser profiles.
- Never open the platform, log in, or try the selectors on the live site.
- Never point a slot at a control with a different purpose (for example a `submit` selector that matches "Delete" or "Follow").
