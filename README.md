# Smash Date

A collaborative planning app for couples to propose, discuss, and confirm date plans together.

---

## 1. Project Overview

Smash Date reduces the friction of planning shared experiences. One partner creates a proposal, the other reviews and refines it, both confirm once ready.

**MVP Scope:** Auth, groups, proposals, comments, responsibilities, activity feed, in-app notifications.

---

## 2. Tech Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + Vite 7 |
| Routing | React Router 7 |
| Backend | Firebase Auth + Firestore |
| Hosting | Vercel |
| Styling | CSS Modules only |
| State | React Context (auth), `useState` elsewhere |

No Tailwind, Redux, or UI component frameworks.

---

## 3. Architecture Overview

### Folder Structure

```text
src/
  App.jsx                        # AuthProvider + BrowserRouter + Routes
  main.jsx                       # Entry point
  components/
    ProtectedRoute.jsx           # Auth guard — redirects to /login if unauthenticated
  context/
    AuthContext.jsx              # Auth state, user profile, exposes useAuth()
  pages/
    LoginPage.jsx / .module.css          # Email/password + Google sign-in and register
    DashboardPage.jsx / .module.css      # Group info + proposal list
    GroupSetupPage.jsx / .module.css     # Create or join a group
    ProposalPage.jsx / .module.css       # Proposal detail — fields, status, comments, responsibilities
    SettingsPage.jsx / .module.css       # Account info + sign out
  services/
    firebase/
      config.js               # initializeApp — reads VITE_FIREBASE_* env vars
      auth.js                 # signInWithEmail, registerWithEmail, signInWithGoogle, logOut
      firestore.js            # db export
      groups.js               # createGroup, joinGroupByCode
      proposals.js            # createProposal, updateProposal, subscribeToGroupProposals, subscribeToProposal
      comments.js             # addComment, subscribeToComments
      responsibilities.js     # addResponsibility, toggleResponsibility, deleteResponsibility, subscribeToResponsibilities
      activityEvents.js       # logActivity, subscribeToActivity
  styles/
    global.css      # Reset + base styles + .loading-screen utility
```

### Routing

| Path | Access | Component |
| --- | --- | --- |
| `/login` | Public | LoginPage |
| `/group-setup` | Auth required | GroupSetupPage |
| `/dashboard` | Auth required | DashboardPage |
| `/proposal/:id` | Auth required | ProposalPage |
| `/settings` | Auth required | SettingsPage |
| `*` | — | Redirects to `/dashboard` |

`ProtectedRoute` wraps all non-public routes. If `loading` is true it shows a loading screen; if no user it redirects to `/login`.

### Auth Flow

1. App load → `AuthContext` sets `loading: true`
2. `onAuthStateChanged` fires → fetch or create Firestore user profile
3. `loading → false`; `user` and `userProfile` are now available
4. Login page redirects away if user already authenticated
5. After sign-in, auth state change drives navigation via `<Navigate>` in LoginPage render

### State Management

- Auth + user profile: `AuthContext` (React Context), consumed via `useAuth()`
- Page-local UI state: `useState`
- Firestore reads: `onSnapshot` listeners in `useEffect` per component
- Firestore writes: async service functions in `src/services/firebase/`

---

## 4. Data Model

### `users/{uid}`

```js
{
  uid: string,
  displayName: string,
  email: string,
  groupId: string | null,
  createdAt: Timestamp
}
```

### `groups/{groupId}`

```js
{
  name: string,
  memberIds: string[],   // supports >2 members
  inviteCode: string,    // 6-char uppercase alphanumeric
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
  date: string,                // ISO date string (YYYY-MM-DD) or ''
  time: string,                // HH:MM or ''
  activity: string,
  location: string,            // restaurant / location
  childcareNotes: string,
  budget: string,
  notes: string,
  status: 'draft' | 'proposed' | 'changes_requested' | 'accepted' | 'confirmed' | 'completed' | 'declined',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `comments/{commentId}`

```js
{
  proposalId: string,
  userId: string,
  displayName: string,         // denormalized at write time
  message: string,
  createdAt: Timestamp
}
```

### `responsibilities/{responsibilityId}`

```js
{
  proposalId: string,
  title: string,
  assignedTo: string,          // userId
  assigneeName: string,        // denormalized at write time
  completed: boolean,
  createdAt: Timestamp
}
```

### `activityEvents/{eventId}`

```js
{
  proposalId: string,
  type: 'proposal_created' | 'fields_updated' | 'status_changed',
  description: string,         // human-readable summary
  createdAt: Timestamp
}
```

### `notifications/{notificationId}`

```js
{
  userId: string,
  message: string,
  read: boolean,
  createdAt: Timestamp
}
```

Security rules defined; notification UI not yet implemented.

---

## 5. Proposal Status Machine

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

---

## 6. Routes

| Route | Purpose | Status |
| --- | --- | --- |
| `/login` | Sign in or register | ✅ |
| `/group-setup` | Create or join a group | ✅ |
| `/dashboard` | Group info + proposals list | ✅ |
| `/proposal/:id` | Proposal detail | ✅ |
| `/settings` | Account info + sign out | ✅ |

---

## 7. Features

### Completed

- Vite + React 19 project scaffold
- React Router with protected and public routes
- Firebase project initialization via env vars
- Email/password authentication (sign in + register)
- Google OAuth sign-in
- Auth state persistence across page reloads
- Firestore user profile auto-created on first sign-in
- Group creation with auto-generated 6-char invite code
- Group join via invite code
- `groupInvites` collection for secure invite resolution
- Dashboard: group name, invite code, real-time proposals list
- Proposal creation (title required, all other fields optional)
- Proposal detail page with all editable fields
- Proposal status system with explicit transitions
- Activity feed on each proposal
- Comments on proposals
- Responsibilities with assignee and completion toggle
- `ProtectedRoute` component — auth guard for all protected pages
- Firestore security rules covering all collections
- Settings page (account info + sign out)

### Planned

- In-app notifications
- User profile editing
- Notification bell / unread count

---

## 8. Development Rules

- **Styling:** CSS Modules only — no Tailwind, no component libraries
- **State:** Context or local state only — no Redux, no Zustand yet
- **Data model:** `memberIds[]` arrays throughout — no hardcoded 2-user logic
- **Security:** All Firestore writes validate ownership/membership via rules
- **Config:** All Firebase values via `VITE_FIREBASE_*` env vars — never hardcoded
- **Scope:** Do not implement features outside the MVP list

---

## Environment Setup

Copy `.env` to `.env.local` and fill in your Firebase project credentials:

```sh
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Enable these Firebase Auth providers in the Firebase console:

- Email/Password
- Google

## Firestore Rules

Rules are defined in `firestore.rules`. Deploy with Firebase CLI:

```sh
firebase deploy --only firestore:rules
```
