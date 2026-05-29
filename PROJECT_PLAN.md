# PROJECT_PLAN.md

# App Name (Working Title)

DateSync

Alternative names:

* TwoPlan
* PlanTogether
* DateDraft
* PairPlan
* UsTime

---

# Core Product Vision

DateSync is a collaborative planning app designed primarily for couples.

The app allows one person to propose a date idea and collaborate with their partner asynchronously to finalize the plan through suggestions, edits, responsibilities, and confirmations.

The goal is to reduce the mental load and friction associated with planning quality time together.

The app is NOT:

* social media
* messaging-first
* a generic event planner
* a family management platform
* a shared calendar replacement

The app IS:

* lightweight
* collaborative
* structured
* asynchronous
* focused on planning experiences together

---

# Primary User Flow
01. User creates a proposal
02. Partner receives notification
03. Partner reviews proposal
04. Partner:

   * suggests changes
   * fills missing details
   * assigns responsibilities
   * accepts
   * declines
05. Original creator reviews changes
06. Proposal is updated collaboratively
07. Both users confirm final version
08. App marks proposal as officially planned
09. Notifications sent to both users

---

# MVP Scope

## Included Features

### Authentication

* Email/password login
* Google login
* Persistent sessions

### Group System

* Users can create groups
* MVP optimized for 2-person groups
* Architecture must support larger groups later

### Proposal Creation

Proposal fields:

* title
* description
* proposed date
* proposed time
* activity
* restaurant/location
* childcare notes
* budget
* notes

### Proposal Editing

* Proposal remains a single live document
* No version branching
* Users edit collaboratively

### Comments / Suggestions

Users can:

* suggest changes
* discuss details
* leave comments

### Responsibilities

Users can assign tasks:

* reserve restaurant
* arrange babysitter
* drive
* bring supplies
* etc.

Responsibilities include:

* title
* assigned user
* completed state

### Proposal Statuses

Statuses:

* draft
* proposed
* changes_requested
* accepted
* confirmed
* completed
* declined

### Activity Feed

Track:

* proposal created
* proposal updated
* comments added
* responsibilities assigned
* acceptance
* confirmation

### Notifications

MVP:

* in-app notifications

Future:

* push notifications
* email notifications

---

# Explicit Non-MVP Features

These MUST NOT be implemented during MVP development:

* live chat system
* voice/video calling
* AI-generated dates
* social feed
* public profiles
* calendar sync
* recurring events
* payment handling
* reservations APIs
* maps integration
* advanced analytics
* collaborative real-time cursors/editing
* React Native app
* offline mode

---

# Technical Stack

Frontend:

* React
* Vite
* React Router

Backend:

* Firebase Auth
* Firestore

Hosting:

* Vercel

Styling:

* CSS Modules only
* No Tailwind
* No CSS frameworks

State Management:

* React Context OR Zustand

Preferred Libraries:

* date-fns
* react-icons

Avoid unnecessary dependencies.

---

# Database Design

## Collections

### users

Fields:

* id
* displayName
* email
* avatarUrl
* createdAt

### groups

Fields:

* id
* name
* memberIds[]
* createdAt

### proposals

Fields:

* id
* groupId
* createdBy
* title
* description
* date
* time
* activity
* restaurant
* location
* childcareNotes
* budget
* notes
* status
* acceptedBy[]
* confirmedBy[]
* createdAt
* updatedAt

### responsibilities

Fields:

* id
* proposalId
* title
* assignedTo
* completed
* createdAt

### comments

Fields:

* id
* proposalId
* userId
* message
* createdAt

### activityEvents

Fields:

* id
* proposalId
* type
* userId
* metadata
* createdAt

### notifications

Fields:

* id
* userId
* type
* read
* payload
* createdAt

---

# Security Requirements

Firestore rules MUST ensure:

* only authenticated users can access data
* only group members can access proposals
* only group members can access comments/responsibilities/events
* users cannot access other groups' data

Security rules are mandatory before production deployment.

---

# UX Principles

The app should feel:

* calm
* modern
* clean
* lightweight
* collaborative

Avoid:

* overly romantic design
* excessive animations
* clutter
* gamification

Design priorities:

01. clarity
02. speed
03. readability
04. responsiveness

---

# Mobile Experience

The app is mobile-first.

All screens must:

* work well on phones
* support touch interactions
* avoid overflow issues
* use responsive layouts

Desktop support is secondary but required.

---

# Future Roadmap

## Phase 2

* push notifications
* email notifications
* proposal templates
* archived dates

## Phase 3

* Google Calendar integration
* recurring events
* reminders

## Phase 4

* group planning support
* vacations
* family outings
* friend groups

---

# Development Priorities

Build order:

01. Authentication
02. Group creation/invites
03. Proposal CRUD
04. Proposal detail page
05. Comments
06. Responsibilities
07. Status workflow
08. Activity feed
09. Notifications
10. Polish

---

# Success Criteria For MVP

MVP is successful if two users can:

* join a shared group
* collaboratively create a date proposal
* assign responsibilities
* discuss changes
* finalize a plan
* receive notifications

without confusion or friction.
