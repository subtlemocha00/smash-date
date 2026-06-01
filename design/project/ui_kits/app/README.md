# Date Smash — App UI Kit

A high-fidelity, interactive recreation of the **Date Smash** mobile PWA, built from the real `smash-date` codebase (`github.com/subtlemocha00/smash-date`). It mirrors the product's screens, component anatomy, copy, and the proposal **status machine** — with the brand palette and dark mode layered on per the design system.

> These are cosmetic recreations for prototyping, **not** production code (no Firebase, no routing, no persistence). Mock data lives in `app.jsx`.

## Run it
Open `index.html`. Everything is loaded from CDN (React 18, Babel, Lucide) plus the design tokens in `../../colors_and_type.css`.

## Interactive flow
1. **Login** — Sign In lands on the Dashboard (existing group); Register routes through **Group Setup** (create / join). "Continue with Google" works too.
2. **Dashboard** — group info + invite code, "Needs Attention", notifications (mark-all-read, unread dots), proposals list. The **+ New** button and coral **FAB** create a proposal.
3. **Proposal detail** — edit all fields inline, advance the **status machine** (Accept / Request Changes / Decline / Confirm…), toggle & add **responsibilities**, post **comments**, watch the **activity feed** update live.
4. **Settings** — account, group, appearance (theme), sign out.
5. **Theme** — toggle light/dark from the header sun/moon or Settings.

## Files
| File | Role |
| --- | --- |
| `index.html` | Loads deps + mounts the prototype inside the iOS device frame |
| `ios-frame.jsx` | Device bezel + status bar (starter component, used as a shell only) |
| `kit.css` | All component styles, consuming `colors_and_type.css` tokens |
| `primitives.jsx` | `Icon`, `Wordmark`, `Avatar`, `StatusBadge`, `Btn`, `Field`, `Card`, `SectionHead` |
| `AuthScreens.jsx` | `LoginScreen`, `GroupSetupScreen` |
| `DashboardScreen.jsx` | `DashboardScreen` (header, sections, FAB) |
| `ProposalScreen.jsx` | `ProposalScreen` (fields, status machine, responsibilities, comments, activity) |
| `SettingsScreen.jsx` | `SettingsScreen` |
| `app.jsx` | Mock data, navigation, theme state, Lucide re-render |

## Notes & fidelity
- **Structure** (56px header, ≤680px column, hairline-divided list rows, 8px cards, 6px controls) is lifted directly from the codebase's CSS Modules.
- **Status colors, labels, and transitions** match `ProposalPage` / `DashboardPage` exactly.
- **Color & dark mode** are the design-system brand direction (the shipped app is monochrome). Icons are **Lucide** (CDN) standing in for the planned `react-icons`/Feather set.
- Components export to `window`; each `<script type="text/babel">` shares globals that way.
