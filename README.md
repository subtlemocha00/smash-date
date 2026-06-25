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
      comments.js             # addComment, deleteComment, subscribeToComments
      responsibilities.js     # addResponsibility, toggleResponsibility, updateResponsibility, deleteResponsibility, subscribeToResponsibilities
      activityEvents.js       # logActivity, subscribeToActivity
    email/
      proposalEmailService.js # builds + queues `mail` docs for proposal events (Trigger Email extension)
    export/
      xlsxBuilder.js          # low-level ExcelJS helpers (workbook/sheet creation, styled rows, download trigger)
      exportFormatters.js     # shared date/time/status formatting utilities
      responsibilityExport.js # responsibility export — buildResponsibilitySheet() + standalone download
      proposalExport.js       # full proposal export (two-sheet workbook) — reuses buildResponsibilitySheet()
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
- **Per-group display name:** each member may override how they appear in a given group via `groups/{groupId}.memberDisplayNames[uid]` (edited under Settings → Group). Name resolution is override → denormalized account name → email prefix (`resolveMemberName`), so a member can use a different name in each group without touching their Firebase Auth profile. Missing field falls back gracefully; no migration. Changes propagate live (the proposal page subscribes to the group), updating the assignee picker, assignee labels, comment authors, and newly written activity/comments.

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
  memberNames: { [uid]: string },   // denormalized account names (fallback)
  memberDisplayNames: { [uid]: string }, // optional per-group name overrides
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

`detailsList` items support custom ordering. In the editor, each item has a grip
handle: drag it (mouse or touch) — or focus it and press Up/Down — to reorder.
Order is simply the array position, so the chosen order is preserved on save and
across refreshes with no extra fields or migration. Reordering follows the same
lock rules as other detail edits (available until the proposal is locked).

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

### `mail/{docId}`

Outbound email queue consumed by the **Firebase "Trigger Email from Firestore"**
extension (connected to SendGrid). The app writes one document per recipient;
the extension sends the email and stamps a `delivery` field on the doc.

```js
{
  toUids: string[],            // recipient UIDs — extension resolves emails from
                               //   its configured Users collection (`users`)
  message: {
    subject: string,
    text: string,
    html: string
  },
  // Extra metadata (ignored by the extension) used by the security rules:
  groupId: string,             // group the notification concerns
  proposalId: string,
  createdBy: string,           // author uid (must equal the caller)
  event: 'proposal_created' | 'proposal_proposed' | 'proposal_reproposed' | 'changes_requested' | 'proposal_locked',
  createdAt: Timestamp
}
```

Recipients are addressed by **UID** (`toUids`), not raw email: the Firestore
rules forbid the browser from reading other members' emails, so the extension
performs the lookup server-side. See **§8. Email Notifications**.

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
- **Groups** are readable only by members. Create requires the creator to be a member and to set `createdBy` to themselves. Updates are limited to: the owner (rename / remove members / general edits), a valid-invite holder adding only themselves (`isSelfJoin`), or any member writing only their own `memberNames` / `memberDisplayNames` entry (`isOwnNameUpdate` — a member can't edit anyone else's name). Delete is owner-only.
- **Group invites** are readable by any authenticated user (needed to join); only the referenced group's owner may create or delete one.
- **Proposals / comments / responsibilities** are scoped to group membership. `groupId` (proposals) and `proposalId` / `userId` (comments, responsibilities) are immutable on update.
- **Comment deletion** is restricted to the comment's own author (the proposal creator and group owner may also remove comments as part of the proposal / group cascade delete).
- **Decision Deadline / lock** (proposals): the `locked`, `lockedAt`, and `decisionDeadline` fields may only be changed by the proposal creator. While a proposal is locked (manual lock or a passed `decisionDeadline`, evaluated against `request.time`), it is read-only to everyone but the creator — except for a member's own personal archive/dismiss write. Comment creation is blocked while the parent proposal is locked.
- **Activity events** are append-only; only the group owner may delete them.
- **Mail queue** (`mail/{docId}`): read/update/delete are fully closed (clients never inspect or tamper with the queue). A create is allowed only when the author is the caller (`createdBy == request.auth.uid`), the caller is a member of the referenced `groupId`, and every recipient in `toUids` is also a member of that group. This prevents the collection from being used as an open relay to email arbitrary users.

---

## 8. Email Notifications

Email notifications are delivered entirely through the **Firebase "Trigger Email
from Firestore"** extension (connected to **SendGrid**) — there is **no backend,
no Cloud Functions, and no second email provider**. To send an email the app
simply writes a document to the `mail` collection (see §5); the extension does
the rest.

### Events that send email

| Event | Triggered by | Subject |
| --- | --- | --- |
| **Proposal created** | Creating a proposal (new or copied), after it's written | `New Proposal Created: {title}` |
| **Proposed** | A member clicking **Propose** (draft → proposed), after it succeeds | `Date Proposed: {title}` |
| **Re-proposed** | A member clicking **Re-propose** (→ proposed), after it succeeds | `Date Re-proposed: {title}` |
| **Changes requested** | A member selecting **Request changes**, after the transition succeeds | `Changes Requested: {title}` |
| **Collaboration locked** | The creator clicking **Lock collaboration now**, after the lock succeeds | `Proposal Locked: {title}` |

No other events send email. (The **Reopen collaboration** action, which also returns a proposal to `proposed`, does not send email.)

The **locked** email additionally includes the proposal's **planning details**
(description, date, time, activity, location, childcare notes, budget, notes —
empty fields omitted). It deliberately does **not** include responsibilities,
comments, or the activity feed.

In the **created** and **changes-requested** emails, the words **"Smash Date"**
are a hyperlink to that proposal (`/proposal/{id}`). Because the route is
auth-guarded, a recipient who is already signed in lands on the proposal; one who
isn't is redirected to the login page. The link's origin is read from
`window.location.origin` at send time (callers may override via `baseUrl`); the
plain-text body also includes the raw URL for non-HTML mail clients.

### Recipients & exclusion

Recipients are **all active members of the proposal's group except the user who
triggered the event** — e.g. when Kev creates a proposal, Sarah, Ted, and Jenny
are emailed but Kev is not. Removed members are absent from `memberIds`, so
they're never included. Each email's actor name uses the same group-aware
display-name logic as the rest of the app (`resolveMemberName`: group override →
account name → email-prefix fallback).

### How recipients are addressed (important)

Members are addressed by **UID** via the extension's `toUids` field — not by raw
email address. The Firestore rules deliberately forbid the browser from reading
other members' `users/{uid}` documents, so the client cannot build an email-
address list itself. The extension resolves each UID's email **server-side** from
its configured Users collection, which also keeps members' addresses private from
one another.

> **Required extension configuration:** the Trigger Email extension must have its
> **"Users collection"** parameter set to **`users`** (the app's existing user
> docs, keyed by uid, each with an `email` field). Without this, `toUids` cannot
> be resolved and **no mail is sent**. The default From address and SendGrid
> credentials are configured in the extension itself — the app never sets them.

### Architecture

All email logic is centralized in
[`src/services/email/proposalEmailService.js`](src/services/email/proposalEmailService.js):

- `buildRecipientUids(group, actorUid)` — members minus the actor.
- `buildProposalEmailContent(event, …)` — subject + text/HTML bodies (pure).
- `buildProposalMailDocuments(event, …)` — the array of `mail` docs (pure; one per recipient).
- `sendProposalCreatedEmail` / `sendProposalProposedEmail` / `sendProposalReproposedEmail` / `sendChangesRequestedEmail` / `sendProposalLockedEmail` — write the docs.

The pure builders are unit-tested in `proposalEmailService.test.js`. New email
types can reuse the same builders/writer.

### Failure handling

Email is strictly **best-effort and non-blocking**: the send is fired after the
proposal action has already succeeded, and `sendProposalEventEmail` catches and
logs any error rather than throwing. A failure to queue mail never prevents (or
rolls back) proposal creation, locking, or requesting changes.

---

## 9. Features

### Implemented

- Email/password and Google authentication (sign in + register), persisted across reloads.
- Password reset via Firebase email ("Forgot password?" on the login screen).
- Firestore user profile auto-created on first sign-in, with a graceful fallback if the profile can't be loaded.
- Light/dark theme with no flash-of-wrong-theme (applied pre-paint).
- Multi-group membership: create, join by invite code, switch active group, rename, remove members, delete group (owner-only).
- Per-group display name override (Settings → Group): customize how you appear in each group independently of your account name; blank reverts to the account name.
- Dashboard: group switcher, "Needs Attention" list, "My Responsibilities" (tasks assigned to you, with emphasis that escalates as the proposal date nears), realtime proposals list.
- Proposal creation (title required; all other fields optional) and full field editing with a "Saved" confirmation.
- **Proposal dates cannot be earlier than today** (today or any future date only). Enforced when setting a date while editing, when copying a proposal, and when adding or editing a **date voting option** — the date picker's minimum is today (in the user's local timezone) and a pre-save check rejects any past date that bypasses the picker. Existing proposals whose date is already in the past are unaffected: they still load, display, and stay editable as long as the date is left unchanged.
- **Copy proposal:** any group member can reuse an existing proposal as the basis for a new one (handy for recurring plans). It opens the create form pre-filled and only writes to Firestore once the copy is confirmed, so abandoned copies are never created. The person making the copy becomes the new proposal's creator/owner, and the copy stays in the original's group. The **date is reset** and a new one is required before saving; **votes are cleared** (option choices carry over with zero votes, voting reopened; stale date options are dropped); **responsibilities carry over but reset to incomplete** (including their note/list details). History does not carry over — the copy starts as a fresh `draft` with no status/acceptance/lock/activity, and **comments are not copied** (discussion is specific to the original).
- Proposal status system with explicit transitions and in-flight disabling.
- **Decision Deadline:** creators set a date/time (or lock manually) after which collaboration closes and the proposal goes read-only for other members; creators can reopen to resume. Enforced in the UI and Firestore rules.
- Responsibilities with assignee and completion toggle; comments; per-proposal activity feed.
- Empty states and error states throughout (failed saves, failed status updates, failed comments, failed/denied Firestore reads).
- Duplicate-submission guards on all create/update forms.
- Firestore security rules covering every collection.

- **Export Proposal:** any group member can download a two-sheet `.xlsx` workbook from a proposal's Manage section ("Export proposal"). Sheet 1 ("Proposal") contains the proposal title, status, optional decision deadline, and all detail fields (description, date, time, activity, location, childcare notes, budget, notes) in a labeled-block planning-document layout. Sheet 2 ("Responsibilities") is identical to the standalone responsibilities export (see below). For finalized proposals (collaboration locked, confirmed, or completed) all fields export their resolved plain values. For active proposals with field-level voting, fields that have active voting export a bullet list of available options (no vote counts, no winner identification); fields without voting export their plain value.
- **Export Responsibilities:** any group member can download a standalone `.xlsx` file from a proposal's Manage section ("Export responsibilities"). The workbook contains a single "Responsibilities" sheet with a proposal header block (title, date, status, exported date) followed by each responsibility as a labeled block: Responsibility, Assigned To, Completed (Yes/No), Notes (if present), and Items (if present). Responsibilities export in displayed order. Assignees use their group display name (group override → account name → snapshot fallback). All responsibilities are exported regardless of completion status. The export is entirely client-side (no server, no cloud storage). Built on [ExcelJS](https://github.com/exceljs/exceljs); export logic lives in `src/services/export/` as an extension point for future exports.

### Not Implemented (intentionally out of MVP scope)

- In-app and push notifications — proposal events surface in each proposal's activity feed; **email** notifications are sent for proposal creation, collaboration locking, and change requests (see §8), but there is no in-app notification center or push delivery.
- Calendar / external integrations, analytics, AI features.
- Per-proposal delete UI (proposals are removed only when their group is deleted).
- Display-name editing.

---

## 10. Known Limitations

- **Member names:** other members appear by name only after they've opened the app at least once (which records their `memberNames` entry); until then `GroupManager` shows a short `User xxxxxx` fallback.
- **Group deletion** runs as a single Firestore batch (capped at 500 writes), which assumes a group's total document count stays modest. True at the app's intended scale.
- **No automated tests yet** — Vitest is configured but no test files exist.
- **Lint warnings:** `npm run lint` passes with three non-blocking `react-refresh/only-export-components` warnings on the context files (each exports a provider component plus its hook). This is the standard React Context pattern; the rule is intentionally set to `warn`.

---

## 11. Next Development Priorities

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
