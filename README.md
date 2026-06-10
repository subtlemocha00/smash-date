# Smash Date

A collaborative planning app for couples (and small groups) to propose, discuss, and confirm date plans together.

---

## 1. Project Overview

Smash Date reduces the friction of planning shared experiences. One member creates a proposal, others review and refine it, and the group confirms once ready.

**MVP Scope:** Auth, groups, proposals, comments, responsibilities, activity feed.

The data model is group-based (`memberIds[]`) throughout, so a user can belong to multiple groups even though the typical case is a couple.

---

## 2. Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + Vite 7 |
| Routing | React Router 7 |
| Backend | Firebase Auth + Firestore |
| Hosting | Vercel |
| Styling | CSS Modules only |
| State | React Context (theme, auth, groups) + local `useState` |

No Tailwind, Redux, or UI component frameworks.

---

## 3. Architecture Overview

### Provider Tree

`main.jsx` → `App.jsx`:

```text
ThemeProvider          # data-theme (light/dark), persisted to localStorage
  AuthProvider         # Firebase auth state + Firestore user profile
    GroupProvider      # realtime list of the user's groups + active group
      BrowserRouter → Routes
```

### Folder Structure

```text
src/
  App.jsx                        # Provider tree + Routes
  main.jsx                       # Entry point
  components/
    ProtectedRoute.jsx           # Auth guard — redirects to /login if unauthenticated
    GroupSwitcher.jsx            # Active-group dropdown + create/join group (inline)
    GroupManager.jsx             # Rename group, list/remove members, delete group (owner)
    ThemeToggle.jsx              # Light/dark theme switch
  context/
    ThemeContext.jsx             # Theme state, exposes useTheme()
    AuthContext.jsx              # Auth state + user profile, exposes useAuth()
    GroupContext.jsx             # Groups, activeGroupId, setActiveGroup, exposes useGroups()
  pages/
    LoginPage.jsx / .module.css        # Email/password + Google sign-in, register, password reset
    DashboardPage.jsx / .module.css    # Group switcher, needs-attention, my responsibilities, proposals
    ProposalPage.jsx / .module.css     # Proposal detail — fields, status, responsibilities, activity, comments
    SettingsPage.jsx / .module.css     # Account info, theme, group management, sign out
  services/
    firebase/
      config.js               # initializeApp — reads VITE_FIREBASE_* env vars
      auth.js                 # signInWithEmail, registerWithEmail, signInWithGoogle, resetPassword, logOut
      firestore.js            # db export
      groups.js               # createGroup, joinGroupByCode, subscribeToUserGroups, setActiveGroupId,
                              #   setMemberName, renameGroup, removeMember, deleteGroup
      proposals.js            # createProposal, updateProposal, subscribeToGroupProposals, subscribeToProposal
      comments.js             # addComment, subscribeToComments
      responsibilities.js     # addResponsibility, toggleResponsibility, updateResponsibilityDetails, deleteResponsibility, subscribeToResponsibilities
      activityEvents.js       # logActivity, subscribeToActivity
  styles/
    global.css      # Design tokens, light/dark themes, reset, .loading-screen utility
```

### Routing

| Path | Access | Component |
| --- | --- | --- |
| `/login` | Public | LoginPage |
| `/dashboard` | Auth required | DashboardPage |
| `/proposal/:id` | Auth required | ProposalPage |
| `/settings` | Auth required | SettingsPage |
| `*` | — | Redirects to `/dashboard` |

`ProtectedRoute` wraps all non-public routes. If auth is still loading it shows a loading screen; if there is no user it redirects to `/login`.

There is **no** separate group-setup route — creating or joining a group happens inline on the dashboard via `GroupSwitcher`. A user with no groups sees a prompt to create or join one.

### Auth Flow

1. App load → `AuthContext` sets `loading: true`.
2. `onAuthStateChanged` fires → fetch or create the Firestore user profile.
   - If the profile read/create fails (transient network or rules), a minimal in-memory profile is used so the app still renders instead of showing a blank screen.
3. `loading → false`; `user` and `userProfile` become available.
4. `GroupProvider` subscribes to the user's groups in realtime and selects an active group (last-used from localStorage / profile, else the first group).
5. LoginPage redirects to `/dashboard` once authenticated.

The LoginPage has three modes on a single public `/login` route: **Sign In**, **Register**, and a **Forgot password?** reset flow. The reset flow collects an email and calls Firebase's `sendPasswordResetEmail`, then shows a confirmation notice. Auth state is persisted across reloads via Firebase's default browser-local persistence.

### State Management

- Theme: `ThemeContext` (persisted to `localStorage`, applied pre-paint by an inline script in `index.html`).
- Auth + user profile: `AuthContext`, consumed via `useAuth()`.
- Groups + active group: `GroupContext`, consumed via `useGroups()`.
- Page-local UI state: `useState`.
- Firestore reads: `onSnapshot` listeners in `useEffect` per component.
- Firestore writes: async service functions in `src/services/firebase/`.

---

## 4. Multi-Group Support

- Membership is the `memberIds[]` array on each group document (many-to-many; no hardcoded two-user logic).
- `GroupContext` keeps a realtime list of every group the user belongs to (`array-contains` query) and tracks the **active** group.
- The active group is remembered in `localStorage` (per uid) and mirrored to `users/{uid}.activeGroupId`.
- `GroupSwitcher` switches the active group and hosts inline create/join. `GroupManager` (in Settings) handles rename, member removal, and group deletion.
- Display names are denormalized into `groups/{groupId}.memberNames` because Firestore rules only let a user read their own `users/{uid}` document.

---

## 5. Data Model

### `users/{uid}`

```js
{
  uid: string,
  displayName: string,
  email: string,
  groupId: string | null,       // legacy "primary" group, retained for back-compat
  activeGroupId: string | null, // last-selected group
  createdAt: Timestamp
}
```

### `groups/{groupId}`

```js
{
  name: string,
  memberIds: string[],              // supports >2 members
  createdBy: string,                // owner uid (legacy groups may omit this)
  inviteCode: string,               // 6-char uppercase alphanumeric
  memberNames: { [uid]: string },   // denormalized display names
  createdAt: Timestamp
}
```

### `groupInvites/{inviteCode}`

```js
{ groupId: string }
```

Lookup table — lets authenticated users resolve an invite code to a group ID without querying all groups.

### `proposals/{proposalId}`

```js
{
  groupId: string,
  createdBy: string,           // userId
  title: string,
  description: string,
  date: string,                // YYYY-MM-DD or ''
  time: string,                // HH:MM or ''
  activity: string,
  location: string,            // restaurant / location
  childcareNotes: string,
  budget: string,
  notes: string,
  status: 'draft' | 'proposed' | 'changes_requested' | 'accepted' | 'confirmed' | 'completed' | 'declined',
  decisionDeadline: Timestamp | null, // when collaboration closes (optional)
  locked: boolean,                    // creator's manual collaboration lock
  lockedAt: Timestamp | null,         // when it was manually locked
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Fields not listed for older proposals (`decisionDeadline`, `locked`, `lockedAt`,
`acceptedBy`, `archivedByUserIds`, `dismissedByUserIds`) are treated as absent /
`false` / `[]` on read, so existing documents need no migration.

### `comments/{commentId}`

```js
{ proposalId: string, userId: string, displayName: string, message: string, createdAt: Timestamp }
```

### `responsibilities/{responsibilityId}`

```js
{
  proposalId: string,
  title: string,
  assignedTo: string | null,   // userId, or null if unassigned
  assigneeName: string,        // denormalized at write time
  completed: boolean,
  detailsNote: string,         // optional free-text note (informational; '' when unused)
  detailsList: string[],       // optional list of short items (informational; [] when unused)
  createdAt: Timestamp
}
```

`detailsNote` and `detailsList` are optional supporting context shown in an
inline, collapsible "Details" panel on each responsibility. Either, both, or
neither may be set. They are purely informational — not subtasks — so there is
no per-item completion, due dates, or reminders. Responsibilities written before
these fields existed render normally (the UI treats missing values as `''` /
`[]`); no migration is required. Like the rest of a proposal, details are
editable by any group member until the proposal is locked/confirmed, after which
they become read-only.

### `activityEvents/{eventId}`

```js
{
  proposalId: string,
  type: 'proposal_created' | 'fields_updated' | 'status_changed' | 'comment_added' | 'responsibility_assigned',
  description: string,         // e.g. "Alex added a comment"
  createdAt: Timestamp
}
```

Append-only audit log (no update rule; only the group owner may delete entries).

---

## 6. Proposal Status Machine

| Status | Transitions To |
| --- | --- |
| `draft` | `proposed` |
| `proposed` | `changes_requested`, `accepted`, `declined` |
| `changes_requested` | `proposed` |
| `accepted` | `confirmed`, `declined` |
| `confirmed` | `completed` |
| `completed` | — |
| `declined` | `proposed` |

All status changes are explicit user actions. No automatic transitions.

### Decision Deadline (collaboration lock)

Independent of the status machine, a proposal creator can set a **Decision
Deadline** — the point at which collaboration ends and the plan becomes the
agreed-upon, read-only version.

- A proposal is **locked** when the creator locks it manually (`locked === true`)
  **or** its `decisionDeadline` has passed. The deadline lock is derived on read
  (like completion) — there is no scheduler — so it takes effect the next time
  the proposal is loaded or interacted with.
- **When locked**, the proposal is read-only for regular members: editing,
  voting/suggestions, and comments are disabled. Everyone can still view the
  proposal, its responsibilities, and its activity history. (Responsibilities,
  being task execution rather than planning, remain usable.)
- **Only the creator** may set/clear the deadline, lock manually, or reopen.
  Reopening sets `locked = false` **and clears the deadline** (a deadline already
  in the past would otherwise re-lock instantly), restoring normal collaboration.

This is enforced both in the UI and in Firestore rules (see below).

---

## 7. Security Rules

Rules live in `firestore.rules` and enforce:

- **Users** can read/write only their own `users/{uid}` document.
- **Groups** are readable only by members. Create requires the creator to be a member and to set `createdBy` to themselves. Updates are limited to: the owner (rename / remove members / general edits), a valid-invite holder adding only themselves (`isSelfJoin`), or any member writing only their own `memberNames` entry (`isOwnNameUpdate`). Delete is owner-only.
- **Group invites** are readable by any authenticated user (needed to join); only the referenced group's owner may create or delete one.
- **Proposals / comments / responsibilities** are scoped to group membership. `groupId` (proposals) and `proposalId` / `userId` (comments, responsibilities) are immutable on update.
- **Decision Deadline / lock** (proposals): the `locked`, `lockedAt`, and `decisionDeadline` fields may only be changed by the proposal creator. While a proposal is locked (manual lock or a passed `decisionDeadline`, evaluated against `request.time`), it is read-only to everyone but the creator — except for a member's own personal archive/dismiss write. Comment creation is blocked while the parent proposal is locked.
- **Activity events** are append-only; only the group owner may delete them.

---

## 8. Features

### Implemented

- Email/password and Google authentication (sign in + register), persisted across reloads.
- Password reset via Firebase email ("Forgot password?" on the login screen).
- Firestore user profile auto-created on first sign-in, with a graceful fallback if the profile can't be loaded.
- Light/dark theme with no flash-of-wrong-theme (applied pre-paint).
- Multi-group membership: create, join by invite code, switch active group, rename, remove members, delete group (owner-only).
- Dashboard: group switcher, "Needs Attention" list, "My Responsibilities" (tasks assigned to you, with emphasis that escalates as the proposal date nears), realtime proposals list.
- Proposal creation (title required; all other fields optional) and full field editing with a "Saved" confirmation.
- Proposal status system with explicit transitions and in-flight disabling.
- **Decision Deadline:** creators set a date/time (or lock manually) after which collaboration closes and the proposal goes read-only for other members; creators can reopen to resume. Enforced in the UI and Firestore rules.
- Responsibilities with assignee and completion toggle; comments; per-proposal activity feed.
- Empty states and error states throughout (failed saves, failed status updates, failed comments, failed/denied Firestore reads).
- Duplicate-submission guards on all create/update forms.
- Firestore security rules covering every collection.

### Not Implemented (intentionally out of MVP scope)

- Notifications (in-app or push) — proposal events surface in each proposal's activity feed instead.
- Calendar / external integrations, analytics, AI features.
- Per-proposal delete UI (proposals are removed only when their group is deleted).
- Display-name editing.

---

## 9. Known Limitations

- **Member names:** other members appear by name only after they've opened the app at least once (which records their `memberNames` entry); until then `GroupManager` shows a short `User xxxxxx` fallback.
- **Group deletion** runs as a single Firestore batch (capped at 500 writes), which assumes a group's total document count stays modest. True at the app's intended scale.
- **No automated tests yet** — Vitest is configured but no test files exist.
- **Lint warnings:** `npm run lint` passes with three non-blocking `react-refresh/only-export-components` warnings on the context files (each exports a provider component plus its hook). This is the standard React Context pattern; the rule is intentionally set to `warn`.

---

## 10. Next Development Priorities

1. Display-name editing in Settings.
2. Per-proposal delete UI.
3. Initial Vitest coverage for the service layer and status machine.
4. Pagination / query limits for proposals and activity as data grows.

---

## Environment Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy the environment template and fill in your Firebase **client** config
   (Firebase console → Project settings → General → "Your apps" → SDK setup and configuration):

   ```sh
   cp .env.example .env
   ```

   All six variables are required:

   ```sh
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```

   `.env` is gitignored; `.env.example` is the committed template. These are
   client-side Firebase values (safe in the frontend); access is enforced by
   Firestore rules, not by secrecy. Never add server secrets or service-account keys.

3. Enable these Firebase Auth providers in the Firebase console:

   - Email/Password
   - Google

### Scripts

```sh
npm run dev       # start the Vite dev server
npm run build     # production build
npm run preview   # preview the production build
npm run lint      # ESLint (passes; see Known Limitations for benign warnings)
npm run check     # lint + production build (CI gate)
npm run test      # Vitest (no test files yet)
```

### Firestore Rules

Rules are defined in `firestore.rules`. Deploy with the Firebase CLI:

```sh
firebase deploy --only firestore:rules
```

### Deployment (Vercel)

- Framework preset: **Vite**. Build command `npm run build`, output directory `dist`.
- Add the six `VITE_FIREBASE_*` variables in the Vercel project's Environment Variables
  settings (they must be present at build time, since Vite inlines them into the bundle).
- Add your Vercel domain to Firebase Auth → Settings → **Authorized domains** so Google
  sign-in works in production.
