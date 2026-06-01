# Smash Date — Design System

A friction-free way to plan a date with friends, family, and significant others. One person drafts a proposal; everyone in the group reviews, refines, assigns who-does-what, and confirms together — asynchronously, so plans sync up with everybody's schedule and preferences.

> **Tagline in use:** *Propose. Refine. Lock it in.*

---

## 1. Product Context

Smash Date (codebase name **Smash Date** / working title **DateSync**) is a **mobile-first PWA** for collaborative plan-making. It deliberately stays small: it is *not* social media, *not* a chat app, *not* a family OS. The whole product is a short, linear loop:

1. A member **creates a proposal** (title + optional date, time, activity, location, budget, notes).
2. Other members get a **notification**, open it, and **comment / fill gaps / assign responsibilities**.
3. The proposal moves through an explicit **status machine** until everyone **confirms** — then it's officially planned.

### Surfaces / Products

There is **one product**: the Smash Date PWA. Its core screens are:

| Screen | Purpose |
| --- | --- |
| **Login** | Email/password + Google sign-in, with a Register tab |
| **Group Setup** | Create a group or join one with a 6-char invite code |
| **Dashboard** | Group info, "Needs Attention", notifications, proposal list |
| **Proposal Detail** | Editable fields, status actions, responsibilities, comments, activity feed |
| **Settings** | Account info + sign out |

### Proposal status machine

`draft → proposed → {changes_requested ↔ proposed, accepted, declined}` , `accepted → {confirmed, declined}` , `confirmed → completed` . All transitions are **explicit user actions** — nothing auto-advances. The seven statuses each have a dedicated badge color (see Colors).

---

## 2. Sources

This system was built by reading the product's real source code. Explore these to go deeper:

* **GitHub — application codebase:** `https://github.com/subtlemocha00/smash-date` (branch `main`)
  + Key files read: `README.md`,  `CLAUDE.md`,  `PROJECT_PLAN.md`, all `src/pages/*.module.css`, and the page components (`LoginPage`,  `DashboardPage`,  `ProposalPage`,  `GroupSetupPage`,  `SettingsPage`).
  + Stack: React 19 + Vite 7, React Router 7, Firebase Auth + Firestore, **CSS Modules only** (no Tailwind / UI frameworks).

The reader is encouraged to browse that repository directly to build higher-fidelity designs — it holds the authoritative data model, Firestore rules, and the full status machine.

### A note on the brand palette

The shipped codebase is intentionally monochrome (black `#111` on greys) — a "clean productivity tool." This design system layers on the **brand palette supplied by the product owner** (coral / granite / pollen / chartreuse / azure) and adds **dark mode**, both of which are not yet in the codebase. The structure, spacing, and component anatomy are lifted faithfully from the code; the color identity is the intended brand direction on top.

---

## 3. Content Fundamentals

How Smash Date talks. Pulled from real UI strings in the codebase.

* **Voice:** calm, plain, low-friction. It reads like a capable assistant, never bubbly or "romantic." The product brief explicitly says *avoid romantic clichés and gamification* — the copy follows.
* **Person:** addresses the user as **"you"**, refers to people by **display name** ("Alex added a comment"). System messages are written in third person about the actor.
* **Casing:** **Sentence case** for body, hints, and buttons-that-are-sentences ("Mark all read", "Create your first date idea."). **Title Case** only for proper labels and status names ("Needs Attention", "Changes Requested"). Section headings are short noun phrases ("Proposals", "Notifications", "Responsibilities", "Activity").
* **Buttons:** terse verb-first — "Sign In", "Create Account", "Save", "Cancel", "+ New", "Continue with Google". Status actions name the destination state: "Accept", "Request Changes", "Confirm", "Decline".
* **Empty states:** encouraging and concrete, never cute — *"Create your first date idea."*, *"You're all caught up."* (note the contraction — casual but clean).
* **Feedback:** minimal and immediate — a quiet "Saved" confirmation, inline progress on buttons ("Saving…", "Creating…", "Loading…" with an ellipsis character `…`, not three dots).
* **Errors:** full sentences, blame-free, with a next step — *"Failed to create proposal. Please try again."*, *"No account found with this email."*
* **Time:** compact, human — `Mar 4` style short dates; relative where natural.
* **Emoji:** **none.** The brand does not use emoji in product copy. Keep it text-only.
* **Vibe in one line:** *Notion-grade neatness with a warm coral heartbeat.*

**Examples (verbatim from product):**

> "Needs Attention" · "Awaiting response" · "Awaiting confirmation"
> "Invite code: **3F9K2A**" · "You're all caught up." · "Create your first date idea."
> "Alex created a new proposal: Anniversary dinner"

---

## 4. Visual Foundations

The look: **tight, neat, engaging.** A restrained granite-grey productivity skeleton, punctuated by confident coral and a small set of brand accents. Mobile-first; everything scales from a single phone column.

* **Color usage.** Neutrals (granite-tinted greys) carry 90% of every screen — backgrounds, cards, text, borders. **Coral is the single primary** — used for the wordmark, the main call-to-action, focus, and selection. Azure / pollen / chartreuse appear almost exclusively as **status semantics** (proposed = azure, changes = pollen, accepted/confirmed = green-chartreuse, declined = coral-red). Color is meaning, not decoration. Never more than one coral CTA per view.
* **Backgrounds.** Flat. A cool granite-tinted off-white (`--bg #f3f6f6`) in light, deep granite (`#161d1e`) in dark. **No gradients, no photographic hero images, no patterns or textures.** Cards are plain `--surface`. The only "imagery" is the typographic wordmark.
* **Cards / sections.** White (light) / raised granite (dark) surfaces,  `--radius` (8px) corners, a **1px `--border` hairline**, and a whisper-soft shadow (`0 1px 4px rgba(...,.08)`). Sections stack with `--space-5` gaps in a single ≤680px centered column. Internal rows are separated by `#f0f0f0`-style hairline dividers, not gaps.
* **Borders & dividers.** Hairlines do the structural work. 1px borders on cards, inputs, and between list rows. Inputs go from `--border` to `--fg`/coral on focus.
* **Corner radii.** Buttons / inputs / badges = **6px** (brand spec). Cards = 8px. Sheets/modals = 14px. Avatars / chips / FAB = pill.
* **Shadows / elevation.** Minimal and tight — the brief forbids "oversized shadows." Cards use `--shadow`. Floating elements (FAB, menus, sheets) step up to `--shadow-md`/`--shadow-lg`. No glow, no colored shadows.
* **Buttons.** Primary = solid coral, white text, 6px radius, medium weight. Secondary = surface fill with a 1px border. Text buttons = underlined, muted. Hover: primary darkens one step (`--primary-hover`); secondary fills with `--surface-2`. **Press: darken a further step** (`--primary-press`) — no scale-bounce (animations are kept subtle by brief).
* **Inputs.** 1px border, 6px radius,  `0.45–0.625rem` padding,  `--text-base`. Focus swaps the border to `--fg` (neutral) and adds a soft coral focus ring. Placeholders use `--fg-subtle`.
* **Hover / press states.** Hover = subtle fill change or darken-one-step + underline on links/rows. Press = darken a further step. Disabled = `opacity: 0.4–0.6` + `not-allowed`. No transforms by default.
* **Animation.** Sparing and functional. Short opacity/position fades (120–180ms,  `ease-out`) for sheets, toasts, and status changes. **No bounces, no spring, no parallax.** Respect `prefers-reduced-motion`.
* **Transparency / blur.** Used only for scrims behind bottom sheets / modals (granite at ~45% alpha). No glassmorphism on content surfaces.
* **Layout rules.** Fixed top header (56px) with the wordmark and notifications; content in a centered single column capped at 680px; a fixed coral FAB (or "+ New") for proposal creation. Touch targets never below 44px.
* **Imagery vibe.** There is essentially none — the aesthetic is typographic and chromatic. Avatars are initials on a tinted brand chip. If photography is ever introduced, keep it warm and candid; but the default brand is image-free.

---

## 5. Iconography

The codebase is **icon-light by design.** What's actually shipped:

* **Unicode glyphs as icons:** the back affordance is a literal `←` ("← Dashboard"), "new" is a text `+ New`, the comment remove control is a `×` character. No icon font is bundled.
* **No emoji** anywhere in the product.
* The `PROJECT_PLAN.md` names **`react-icons`** as the intended icon library (its default set is Feather-style: 2px stroke, rounded caps, 24px grid).

**This system's icon recommendation:** use **[Lucide](https://lucide.dev)** (the maintained successor to Feather) loaded from CDN — it matches the intended `react-icons` /Feather look exactly: **2px stroke, round line caps/joins, 24×24 grid, `currentColor` fill: none.** This is a **substitution** for the unbundled set and is flagged as such below. Icons should inherit text color ( `currentColor` ), sit at 18–20px in dense UI / 24px standalone, and never be filled. Keep usage minimal — a handful of system icons (bell, settings, chevron, plus, check, x, calendar, map-pin), not decorative spot icons.

```html
<!-- Lucide via CDN -->
<script src="https://unpkg.com/lucide@latest"></script>
<i data-lucide="bell"></i>
<script>
    lucide.createIcons();
</script>
```

---

## 6. Brand Mark

There is **no logo image** in the codebase — the brand is a **typographic wordmark**: the words "Smash Date" / "Smash Date" set in **Space Grotesk** semibold. The system provides a styled wordmark (coral "Date", granite "Smash" + a coral dot) in `assets/wordmark.html` and as a favicon-style mark. No raster or vector logo files exist to import; if an official logo is later produced, drop it in `assets/` and update this section.

---

## 7. Substitutions & Flags

The codebase ships **no custom fonts** (it uses `system-ui` ) and **no icon assets**. This system makes two brand-direction substitutions — please confirm or replace:

* **Fonts → Google Fonts.** Display: **Space Grotesk**; Body/UI: **DM Sans**; Mono: **DM Mono** (invite codes, meta). Loaded from the Google Fonts CDN. *If you have licensed brand fonts, send the files and I'll swap them in.*
* **Icons → Lucide (CDN).** Stands in for the planned `react-icons`/Feather set. Matches stroke weight and grid. *Swap for your final set if different.*

---

## 8. Index / Manifest

Root files:
* **`README.md`** — this document.
* **`colors_and_type.css`** — all design tokens: brand palette, light + dark mode, type scale, spacing, radii, shadows, status colors, semantic element styles. **Import this in every artifact.**
* **`SKILL.md`** — Agent-Skill front-matter wrapper so this folder can be used directly in Claude Code.

Folders:
* **`assets/`** — `wordmark.html` (brand mark treatments). Icons come from the Lucide CDN.
* **`preview/`** — the Design System tab cards (type, color, spacing, components). Each is a small standalone HTML specimen.
* **`ui_kits/app/`** — high-fidelity, interactive recreation of the Smash Date PWA: `index.html` (clickable prototype) plus modular JSX components (login, dashboard, proposal detail, settings, primitives).
* **`src/`** — *(reference only)* the original imported `.jsx` / `.module.css` files from the codebase, kept for traceability.

> Start any new Smash Date design by importing `colors_and_type.css` , adding `class="ds-scope"` to the body, and pulling components from `ui_kits/app/` .
