# Landing page — GitHub Pages

Design: Figma `Landing / Desktop 1440` — node **`15:80`** on page `Landing — GitHub Pages` (https://www.figma.com/design/1Tf42IZ4d88k6Hk7lRnRx6/Handpost?node-id=15-80).
Target URL: **https://tanzir71.github.io/handpost/** (project site ⇒ every URL is under `/handpost/`).

## 1. Build rules

- Plain static files in `site/` — semantic HTML, one CSS file using the tokens from `docs/DESIGN.md`, a few lines of vanilla JS at most. No framework, no build step, no analytics, no third-party requests (self-host fonts in `site/fonts/`).
- **All internal URLs relative** (`./styles.css`, `./demo/`, `./schema/…`) so the site works under `/handpost/` and from a local file server. Today's `site/index.html` uses root-absolute paths (`/styles.css`, `/demo/`) — those break on Pages.
- Repo links point to `https://github.com/tanzir71/handpost` (the current site links the old `tanzir71/scheduler`).
- Download buttons → `https://github.com/tanzir71/handpost/releases/latest`. Until the first release exists (H7), link “Read the source” prominently and label Download “Coming soon” rather than linking a 404.
- Keep `site/demo/` (the mock queue walkthrough), restyled with the new tokens. Keep `site/.nojekyll` and `site/llms.txt` (rename Relay → Handpost; add the inbox protocol line).
- Publish `schema/handpost-post.v1.schema.json` at `site/schema/handpost-post.v1.schema.json` (copied by the Pages workflow, not duplicated by hand).
- Responsive: 1440 design, fluid down to 360. Breakpoints: ≤ 1080 px → how-it-works and caveats become 2 columns, automation and local-first stack (code card below text); ≤ 720 px → single column, nav collapses to logo + Download + a menu `<details>`, hero headline 56 px, product shot keeps aspect ratio and scrolls horizontally inside its frame rather than shrinking text below 10 px.
- Metadata: `<title>Handpost — your posts, delivered by hand</title>`, description from the hero subtitle, OG image 1200×630 (stamp + headline on canvas, export from Figma or render with the same HTML), `favicon.svg` = the stamp mark, `theme-color` `#F4EFE6`.

## 2. Sections (top to bottom, with copy)

1. **Airmail stripe** (6 px) across the very top.
2. **Nav** — lockup (links to top) · *How it works · Automation · Platforms · Honest caveats · FAQ* (anchor links) · *GitHub* (ghost, code icon) · *Download* (primary, download icon).
3. **Hero** (centered) — pill “● Free · open source · runs on your computer”; H1 **“Your posts, delivered *by hand.*”** (96 px Instrument Serif, “by hand.” italic in brand red); subtitle “Handpost is a local-first desktop scheduler. It publishes through your own logged-in Chrome — and takes new posts from Claude, Codex or any script as plain files dropped in a folder.”; buttons *Download for Windows* / *Read the source*; mono line “Also for macOS and Linux · no account · no cloud · no telemetry”; product shot = the Inbox screen (render a real screenshot of the built app at 2×, `loading="eager"`, with alt text), on a sunken “desk” with the stamp mark tilted 8° overlapping the top-right corner. Until the app is restyled, export the Figma Inbox frame `6:101` as the image.
4. **Airmail stripe** (8 px).
5. **How it works** (`#how`) — eyebrow, H2 “From draft to receipt, without renting an API.”, four cards: 01 *Write it — or let Claude* · 02 *Handpost checks it* · 03 *Posted from your Chrome* · 04 *You get a receipt* (copy in Figma).
6. **Automation** (`#automation`, inverse background) — H2 “Claude writes. Your computer posts.”, paragraph, five ✓ bullets (plain files, atomic, idempotent, receipts + status, guardrails), *Read the inbox protocol* → `docs/INBOX_PROTOCOL.md` on GitHub. Right: the `post.md` card (real example from `examples/inbox/`, syntax-coloured: `---` red, keys ink) and an overlapping receipt card with an airmail top edge.
7. **Platforms** (`#platforms`) — H2 “Nine platforms. Honest labels.”, note about contract tests vs live posts, table: Platform · What it posts · Confidence pill · When automation can't (copy in Figma). Use a real `<table>`.
8. **Local-first** — H2 “Nothing leaves your computer.”, paragraph, data-folder card (`handpost.db`, `media/`, `profiles/` 🔒, `proof/`, `inbox/`) and the “Outbound only: your Chrome → the platform” strip.
9. **Honest caveats** (`#caveats`, red-soft tint) — H2 “Powerful. Not risk-free.”, three cards: 01 / Terms, 02 / Drift, 03 / Fallback. This section must stay on the page in every redesign — it is the product's integrity, carried over from the old site.
10. **FAQ** (`#faq`) — six Q&As, two columns, `<details>` on mobile.
11. **Support — Buy Me a Coffee** (required, directly above the footer) — dashed-border card: coffee icon in a red-soft circle; eyebrow **“TANZIR RAHMAN IS”**; headline **“Fueling open-source code, local utilities, and late-night builds.”**; line “Handpost is free. If it saves you a scheduler subscription, a coffee keeps the late-night builds going.”; button **Buy me a coffee** (brand-red fill, coffee icon) and mono caption `buymeacoffee.com/tanzir`. Both the button and the headline link to **https://buymeacoffee.com/tanzir** (`target="_blank" rel="noopener"`). No embedded Buy Me a Coffee widget or script — a plain link keeps the page free of third-party requests.
12. **Airmail stripe** (8 px) + **Footer** (sidebar tint) — lockup + italic tagline; columns *Product* (Download, Mock demo, Changelog) · *Docs* (Inbox protocol, Architecture, Live test checklist, llms.txt) · *Project* (GitHub, Report an issue, **Buy me a coffee** in brand red → same URL). Bottom row: “© 2026 Tanzir Rahman · Open source on GitHub” and “Not affiliated with any platform named on this page.”

The same Buy Me a Coffee line and link also go in `README.md` (a “Support” section at the end) and the app's Settings → About tab.

## 3. Deploy

Replace the Vercel setup with GitHub Pages:

- Delete `vercel.json`, `.vercelignore`, `DEPLOY_VERCEL.md`; drop `.vercel` from `.gitignore`.
- Add `.github/workflows/pages.yml`:

```yaml
name: pages
on:
  push: { branches: [master], paths: ["site/**", "schema/**", ".github/workflows/pages.yml"] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: mkdir -p site/schema && cp schema/*.json site/schema/
      - run: node scripts/verify-website.mjs
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: site }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- Owner, once: GitHub → repo Settings → Pages → Source: **GitHub Actions** (needs-owner).
- Update `scripts/verify-website.mjs` to assert: no root-absolute internal `href`/`src`; every internal link resolves to a file in `site/`; the Buy Me a Coffee link `https://buymeacoffee.com/tanzir` appears in the support section and the footer; no `<script src>` or font/CSS from another origin; the caveats section exists; `schema/handpost-post.v1.schema.json` is present after the copy step.

## 4. Acceptance

- `node scripts/verify-website.mjs` passes locally and in the workflow.
- `npx http-server site -p 4173` (or any static server) serving the folder under a `/handpost/` prefix renders with no 404s in the browser console (use `scripts/verify-website-browser.mjs`, updated for the prefix).
- Visual check against Figma `15:80` at 1440, plus manual checks at 1080, 720 and 390 widths.
- After the owner enables Pages: https://tanzir71.github.io/handpost/ loads, the coffee button opens buymeacoffee.com/tanzir.
