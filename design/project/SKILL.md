---
name: smash-date-design
description: Use this skill to generate well-branded interfaces and assets for Smash Date, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## What's here
- **`README.md`** — product context, content fundamentals, visual foundations, iconography, brand mark, substitutions, and a full file index. Start here.
- **`colors_and_type.css`** — all design tokens (brand palette, light + dark mode, type scale, spacing, radii, shadows, status colors, semantic element styles). Import this in every artifact and add `class="ds-scope"` (or `data-theme="light|dark"`) to the root.
- **`assets/`** — the typographic wordmark treatments. Icons are Lucide (CDN).
- **`preview/`** — small standalone specimen cards (type, color, spacing, components).
- **`ui_kits/app/`** — an interactive, high-fidelity recreation of the Smash Date PWA with reusable JSX components. Lift components from here for new mocks.
- **`src/`** — reference copies of the original codebase CSS/JSX.

## Quick rules
- One coral CTA per view; neutrals carry everything else. Color = meaning (status), not decoration.
- 6px radius on buttons/inputs/badges, 8px on cards. Tight, neutral shadows. No gradients, no emoji, no romantic clichés.
- Voice: calm, plain, sentence case, addresses the user as "you". Buttons are verb-first.
- Mobile-first. 44px minimum touch targets. Support light AND dark mode.
