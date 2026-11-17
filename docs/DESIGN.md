# Handpost design system and screens

Figma file: **https://www.figma.com/design/1Tf42IZ4d88k6Hk7lRnRx6/Handpost** (file key `1Tf42IZ4d88k6Hk7lRnRx6`).
If the Figma MCP server is connected, call `get_design_context` / `get_screenshot` with the node ids below; this document is the fallback and the source for anything Figma can't express (behaviour, states, a11y).

| Page | Node | Contents |
|---|---|---|
| Foundations | `0:1` | Icons `4:2`, Brand `4:173`, Components `5:4`, Inputs & chips `9:68…9:92`, Sidebar `6:8`, Logo directions archive `10:74` |
| App — Desktop | `3:2` | Five 1440×900 screens (table in §5) |
| Landing — GitHub Pages | `3:3` | `Landing / Desktop 1440` `15:80` |

Variables live in the collection **Handpost / Color** (modes Light, Dark). Every variable has WEB code syntax set to its CSS custom property, e.g. `bg/canvas` → `var(--hp-bg-canvas)`, so `get_design_context` emits the right names.

## 1. Direction

Paper, ink and airmail. A warm off-white “paper” canvas, near-black ink text, an ink-blue primary action, and airmail red/blue used only for brand moments (logo stamp, airmail stripe, eyebrows, the Claude source chip). Serif display type gives the product a voice; everything functional is a clean grotesk; machine facts (times, ids, file names, counts) are monospaced. It should feel like a calm desk, not a growth dashboard.

## 2. Tokens

Paste into `src/renderer/styles/tokens.css` and `site/styles.css`. Values are WCAG AA (≥ 4.5:1) for small text on canvas/surface in both modes; `text-muted` on `bg-sunken` is ≥ 4.6:1 — don't put muted text on anything darker.

```css
:root, [data-theme="light"] {
  --hp-bg-canvas: #F4EFE6;  --hp-bg-surface: #FFFCF6;  --hp-bg-sunken: #EBE4D6;  --hp-bg-sidebar: #ECE5D7;  --hp-bg-inverse: #1D1A15;
  --hp-line-default: #DDD3C1;  --hp-line-strong: #C3B7A1;
  --hp-text-primary: #1D1A15;  --hp-text-secondary: #5A5246;  --hp-text-muted: #6B6355;  --hp-text-inverse: #FFFCF6;
  --hp-accent-ink: #2340A0;  --hp-accent-ink-soft: #E2E7F7;  --hp-accent-on-ink: #FFFFFF;
  --hp-brand-red: #B8351F;  --hp-brand-red-soft: #F8E0D8;  --hp-brand-blue: #2340A0;
  --hp-status-ok: #276B43;  --hp-status-ok-soft: #DCEEE2;
  --hp-status-warn: #865410;  --hp-status-warn-soft: #F5E6C8;
  --hp-status-danger: #B42318;  --hp-status-danger-soft: #F7DCD7;
  color-scheme: light;
}
[data-theme="dark"] {
  --hp-bg-canvas: #15130F;  --hp-bg-surface: #1E1B16;  --hp-bg-sunken: #100E0B;  --hp-bg-sidebar: #1A1713;  --hp-bg-inverse: #F2ECE1;
  --hp-line-default: #332E26;  --hp-line-strong: #4A4337;
  --hp-text-primary: #F2ECE1;  --hp-text-secondary: #B9AF9F;  --hp-text-muted: #9A907F;  --hp-text-inverse: #1D1A15;
  --hp-accent-ink: #8EA6FF;  --hp-accent-ink-soft: #1E2645;  --hp-accent-on-ink: #0F1530;
  --hp-brand-red: #F0674F;  --hp-brand-red-soft: #3A1D17;  --hp-brand-blue: #8EA6FF;
  --hp-status-ok: #5BC489;  --hp-status-ok-soft: #16301F;
  --hp-status-warn: #E6A945;  --hp-status-warn-soft: #33270F;
  --hp-status-danger: #F2786D;  --hp-status-danger-soft: #3A1714;
  color-scheme: dark;
}
/* Theme = System: copy the dark block into @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } } */

:root {
  --hp-font-display: "Instrument Serif", "Iowan Old Style", Georgia, serif;
  --hp-font-ui: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --hp-font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace;
  --hp-radius-sm: 6px; --hp-radius-md: 8px; --hp-radius-lg: 12px; --hp-radius-xl: 16px; --hp-radius-pill: 999px;
  --hp-space-1: 4px; --hp-space-2: 8px; --hp-space-3: 12px; --hp-space-4: 16px; --hp-space-5: 20px; --hp-space-6: 24px; --hp-space-8: 32px; --hp-space-9: 36px;
  --hp-shadow-raise: 0 1px 2px rgb(29 26 21 / 0.06);
  --hp-shadow-float: 0 12px 40px rgb(29 26 21 / 0.12);
  --hp-airmail: repeating-linear-gradient(-55deg, var(--hp-brand-red) 0 11px, transparent 11px 22px, var(--hp-brand-blue) 22px 33px, transparent 33px 44px);
}
```

Fonts are all SIL OFL: **Instrument Serif**, **Instrument Sans**, **IBM Plex Mono**. Self-host the `.woff2` files (renderer: `src/renderer/assets/fonts/`, site: `site/fonts/`) — no Google Fonts requests; the app promises no third-party network calls, and the site should load fast on Pages.

### Type scale (Figma text styles)

| Style | Font | Size / line-height / tracking | Use |
|---|---|---|---|
| Display/XL | Instrument Serif | 84 / 96% / −2% (96px in landing hero) | Landing hero only |
| Display/L | Instrument Serif | 56 / 104% / −1.5% | Landing section titles |
| Display/M | Instrument Serif | 34 / 110% / −0.5% | App screen titles, donate headline (40) |
| Heading/M | Instrument Sans SemiBold | 20 / 130% / −0.5% | Card titles, receipt title |
| Heading/S | Instrument Sans SemiBold | 15 / 135% / −0.2% | Panel titles |
| Body/L | Instrument Sans | 18 / 155% | Landing body, composer text area |
| Body/M | Instrument Sans | 14 / 150% | Default app text |
| Body/S | Instrument Sans | 13 / 145% | Secondary text, meta |
| Label/M | Instrument Sans Medium | 14 / 130% | Buttons, nav |
| Label/S | Instrument Sans Medium | 12 / 130% | Pills, chips, small buttons |
| Mono/S | IBM Plex Mono | 12 / 145% | Times, ids, file paths, counts |
| Mono/Eyebrow | IBM Plex Mono Medium | 11 / 130% / +8%, UPPERCASE | Eyebrows above titles (brand red), table headers (muted) |

## 3. Brand

- **Mark** (`brand/logo-mark` `4:161`, chosen 2026-11-18, direction C): a perforated postage stamp in `brand/red`, a thin inner frame rule at 70% opacity, an italic Instrument Serif “h” in `accent/on-ink`, and a tiny “1” denomination top-right. Perforations are real semicircular bites (`stampPath()` — radius 2.2, pitch 6.6 on a 40×48 stamp). Drop the denomination below 20 px tall.
- **Lockup** (`4:164`): mark + “Handpost” in Instrument Serif, gap 10.
- **App icon** (`brand/app-icon` `12:79`): stamp tilted −6° with a soft shadow on a `bg/canvas` rounded tile (radius 28/128). Export 1024 px PNG → `build/icon.png`, generate `.ico` / `.icns` in the packaging step.
- **Favicon**: the mark alone as SVG (`site/favicon.svg`, `src/renderer/public/favicon.svg`).
- **Airmail stripe** (`brand/airmail-stripe` `4:172`): 6–10 px rule on top of receipts, the “Connect Claude” card, landing section breaks and the footer. CSS `background: var(--hp-airmail)`.
- Export the mark/stamp as SVG from Figma into `assets/brand/`, or generate it with the same function used to draw it:

```js
// Perforated stamp outline: w×h rectangle with semicircular bites of radius r every `step` px.
function stampPath(w, h, r, step) {
  const nx = Math.round(w / step), ny = Math.round(h / step), sx = w / nx, sy = h / ny; let d = 'M0 0 ';
  for (let i = 0; i < nx; i++) { const c = (i + 0.5) * sx; d += `L${c - r} 0 A${r} ${r} 0 0 0 ${c + r} 0 `; } d += `L${w} 0 `;
  for (let i = 0; i < ny; i++) { const c = (i + 0.5) * sy; d += `L${w} ${c - r} A${r} ${r} 0 0 0 ${w} ${c + r} `; } d += `L${w} ${h} `;
  for (let i = nx - 1; i >= 0; i--) { const c = (i + 0.5) * sx; d += `L${c + r} ${h} A${r} ${r} 0 0 0 ${c - r} ${h} `; } d += `L0 ${h} `;
  for (let i = ny - 1; i >= 0; i--) { const c = (i + 0.5) * sy; d += `L0 ${c + r} A${r} ${r} 0 0 0 0 ${c - r} `; } return d + 'Z';
}
// Mark: <path d={stampPath(40,48,2.2,6.6)} fill="var(--hp-brand-red)"/>, inner frame rect x5 y5 30×38 stroke on-ink 0.75 @70%,
// italic serif "h" 34px centred in the frame, "1" IBM Plex Mono 6px at (29,7).
```

## 4. Components

| Figma component | Node | React component | Notes |
|---|---|---|---|
| Button (Kind × Size) | `5:46` | `Button` | Kinds: `primary` (ink), `secondary` (surface + strong line), `ghost`, `danger` (danger-soft). Sizes M (36 px) / S (26 px). Optional leading lucide icon. Radius 8. |
| Status pill (Tone) | `5:62` | `StatusPill` | OK, Warn, Danger, Ink, Neutral. 6 px dot + Label/S. Mapping below. |
| Platform badge | `5:83` | `PlatformBadge` | 24 px rounded-6 tile with mono monogram (𝕏, in, bs, @, f, ig, tt, yt, p, mk). Never use official logos. Platform hues are fixed, not themed. |
| Source chip | `9:91` | `SourceChip` | Claude (red-soft + sparkles), Codex (terminal), Git (git-branch), Manual (pen-line), Other. |
| Nav item | `5:98` | `NavItem` | Default / Active (surface, line, shadow-raise; icon ink). Optional count badge (red when active screen has items needing attention). |
| Toggle | `9:68` | `Toggle` | 34×20, ink when on. Real `<button role="switch" aria-checked>`. |
| Field | `9:92` | `Field` | 36 px, surface, strong line, optional leading icon. |
| App/Sidebar | `6:8` | `Sidebar` | 232 px. Lockup, nav, spacer, **watcher card** (dot = watcher health: ok / warn when rescans fail / danger when the folder is missing), “Local-only · no telemetry”. |
| Icons | `4:2` | `lucide-react` | Each icon component's description names the lucide export (`Inbox`, `PenLine`, `CalendarDays`…). Stroke 2, 16–20 px. |

Status → tone mapping: `published` OK · `scheduled`, `publishing` Ink · `held`, `needs_login`, `unverified`, `manual`, `waiting_media` Warn · `failed`, `rejected`, `frozen` Danger · `draft`, `duplicate`, `cancelled`, `not connected` Neutral.

## 5. Screens (App — Desktop page)

All screens: sidebar + main column, padding 28/36, header = eyebrow (Mono/Eyebrow, brand red) + Display/M title + Body/M secondary subtitle, actions right-aligned to the header's baseline. Min window 1024×700; at < 1280 px wide, side panels (receipt, previews, pacing) drop below the main list.

| Screen | Node | Notes |
|---|---|---|
| Inbox (new) | `6:101` | Filter pills with counts (All, Held for review, Scheduled, Published, Rejected, Duplicates) + search. Table: Source chip + task, post text (2-line clamp) + file name/time, platform badges, when, status. Selecting a row opens the **Receipt** panel (392 px, airmail stripe on top): why it's held/rejected, Source/File/Received/Post id, Checks (✓/⚠ list from validation), Will publish (per platform + time ±90 s), actions *Approve & schedule* · *Edit* (opens Compose with the post) · *Reject*. Header: Auto-schedule toggle (writes `inbox.autoSchedule`), *Open folder*. Empty state: a stamp illustration + “Nothing in the inbox. Drop a file in ~/Handpost/inbox or connect a Claude scheduled task →” linking to Settings → Automation. |
| Compose | `6:183` | Platform toggle chips (selected = ink 1.5 px border, live count `142/280`), tabs Base text / per-platform overrides, text area (Body/L), validation pills, media strip with alt text field and dashed *Add* tile, first comment, schedule bar with segmented *Next free slot / Exact time / Post now*, date field, `Asia/Dhaka · ±90s`, *Save draft* · *Add to queue* · *Schedule*. Right: live previews per selected platform (X shows media; LinkedIn shows the 210-char fold). |
| Queue | `6:264` | “Next up” banner (ink-soft) with countdown and *Publish now*. Agenda grouped by day (Mono/Eyebrow headers), rows: time, badge, 1-line text, source chip, pill, ⋯ menu (Reschedule, Edit, Cancel, Open manually). Failed/unverified rows expand to the step log (✓ per step with durations, failing step in warn/danger), proof screenshot thumbnail, *Retry* / *Open manually · copies text*. Right column: **Today's pacing** (per-platform `n / cap` bars, cooldown line) and **Circuit breakers** (frozen platforms with reason and *Review*). |
| Accounts | `6:346` | 3-column cards: badge, name, handle (captured at connect), status pill, optional warn/danger banner, meta rows (Last verified, Queue slots, Daily cap), actions: *Rehearse* · *Reconnect* · *Slots & caps* (opens a modal with a weekday × time editor replacing today's `1@09:00` text input); *Log in in Chrome* when `needs_login`; *Re-enable early* (danger) when frozen; *Connect in Chrome* when not connected. Banner explains Rehearse. Footer line: Chrome version found + profile path. |
| Settings — Automation | `6:428` | Tabs General · Automation · Data & export · About. Automation: Inbox folder (path field, *Change…*, *Open*, folder tree legend), Behaviour toggles (Auto-schedule, Write receipts & status, Include post text in status, Allow media outside inbox), Remote source (Git, optional, off). Right: **Connect a Claude scheduled task** (3 steps, prompt in an inverse code block, *Copy prompt*, *Inbox protocol*), **Writers seen** (source chip, task, file count, last seen). About tab (not drawn): version, links, and the Buy Me a Coffee line from the landing page. |
| Calendar, History | — | Not redrawn: restyle the existing screens with the new tokens and components (chips = platform badge + time; History = Queue row style + filters). |

Interaction rules: every action reachable by keyboard; visible focus ring `2px solid var(--hp-accent-ink)` offset 2; pills and badges always pair colour with text; respect `prefers-reduced-motion`.

## 6. Landing page

See [`LANDING_PAGE.md`](LANDING_PAGE.md).
