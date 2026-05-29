# CLAUDE.md

# Project Overview

This project is a collaborative planning application optimized for couples planning date nights and shared activities.

The application is intentionally lightweight and focused.

Do NOT expand scope beyond the documented MVP unless explicitly instructed.

---

# Core Product Philosophy

The app exists to:

* reduce planning friction
* support asynchronous collaboration
* distribute planning responsibilities
* help users finalize shared plans

The app is NOT intended to become:

* social media
* a messaging platform
* a generalized productivity suite
* a family operating system

All implementation decisions should support simplicity and clarity.

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

* CSS Modules ONLY

State Management:

* React Context OR Zustand

Do NOT introduce:

* Redux
* Tailwind
* Material UI
* Chakra
* Bootstrap
* large UI frameworks
* unnecessary abstraction layers

Keep dependencies minimal.

---

# Architecture Requirements

## General Rules

* Keep components modular and readable
* Avoid premature optimization
* Prefer simple explicit code over clever abstractions
* Keep files reasonably small
* Avoid deeply nested component trees

---

# Data Model Rules

The system MUST support future group expansion.

Do NOT hardcode logic for only 2 users.

Use:

* groups
* group members
* participant arrays

even if MVP UX targets couples.

---

# Proposal Rules

A proposal is:

* a single live editable entity
* collaboratively updated over time

Do NOT implement:

* proposal version branching
* diff systems
* collaborative cursors
* operational transforms

Changes should instead be represented through:

* activity events
* comments
* timestamps

---

# Notification Rules

Notifications should be event-driven.

Examples:

* proposal created
* proposal updated
* comment added
* responsibility assigned
* proposal accepted
* proposal confirmed

MVP notifications are in-app only.

Do NOT implement push notifications yet.

---

# Styling Rules

Use:

* CSS Modules

Requirements:

* responsive layouts
* mobile-first
* clean spacing
* accessible contrast
* minimal visual clutter

Avoid:

* excessive gradients
* glassmorphism
* flashy animations
* oversized shadows
* romantic clichés

The app should resemble a clean productivity tool.

---

# UX Rules

Prioritize:

1. clarity
2. low friction
3. responsiveness
4. readability

Users should never feel overwhelmed.

Keep workflows:

* linear
* obvious
* fast

Avoid modal overload.

---

# Firestore Rules

Firestore structure must remain:

* predictable
* queryable
* scalable

Prefer:

* flat collections
* explicit references

Avoid:

* excessive nesting
* duplicated state where unnecessary

All writes should:

* validate ownership
* validate membership
* update timestamps

---

# Security Rules

Security is mandatory.

Firestore rules MUST ensure:

* users can only access their own groups
* users can only access proposals within their groups
* unauthorized reads/writes are impossible

Never leave Firestore open during development.

---

# State Management Rules

Keep client state simple.

Prefer:

* local component state
* Context API
* Zustand if global state becomes necessary

Avoid:

* Redux
* overly complex stores
* duplicated cached data

Firestore realtime listeners should remain primary data source.

---

# Performance Rules

Optimize for:

* perceived responsiveness
* minimal loading states
* lightweight bundles

Avoid premature optimization.

Only optimize after identifying actual bottlenecks.

---

# Code Quality Rules

Write:

* readable code
* consistent naming
* clear component responsibilities

Prefer:

* explicit naming
* simple functions
* straightforward logic

Avoid:

* excessive generic abstractions
* unnecessary custom hooks
* large utility dumping grounds

---

# MVP Feature Checklist

Required:

* authentication
* group invites
* proposal creation/editing
* proposal statuses
* comments
* responsibilities
* activity feed
* notifications

Do NOT implement non-MVP features unless explicitly instructed.

---

# Deployment Rules

Deploy using:

* Vercel
* environment variables
* Firebase config separation

Never hardcode secrets.

---

# Important Development Principle

This app succeeds through:

* simplicity
* reliability
* low friction
* clean collaboration

Not through feature quantity.

When uncertain:
choose the simpler implementation.
