import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  writeBatch,
  onSnapshot,
  query,
  where,
  arrayUnion,
  arrayRemove,
  deleteField,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firestore'

export async function createProposal(groupId, userId, title) {
  const ref = await addDoc(collection(db, 'proposals'), {
    groupId,
    createdBy: userId,
    title,
    description: '',
    date: '',
    time: '',
    activity: '',
    location: '',
    childcareNotes: '',
    budget: '',
    notes: '',
    status: 'draft',
    // Per-member acceptance: a proposal can only be confirmed once every group
    // member's uid appears here. Reset whenever the plan changes (see callers).
    acceptedBy: [],
    // Per-user manual archive. Auto-archive (completion / past date) is derived,
    // not stored — see isArchivedForUser below.
    archivedByUserIds: [],
    // Per-user removal of a completed proposal from one's own archive. Hides it
    // for that user only; everyone else still sees it.
    dismissedByUserIds: [],
    // Decision Deadline: the point at which collaboration closes and the plan
    // becomes the agreed-upon, read-only version. `locked` is the creator's
    // manual switch; once `decisionDeadline` passes the proposal is also treated
    // as locked (derived on read — no scheduler). See isProposalLocked below.
    decisionDeadline: null,
    locked: false,
    lockedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

// Creates a brand-new proposal seeded from a copy. `content` is the reusable
// material the caller has already stripped of the original's identity and
// history (and with voting reset to zero votes). Ownership, status, acceptance,
// archive/dismiss state, the decision deadline, and lock all start fresh exactly
// as createProposal would — the copy is a normal new proposal owned by `userId`.
// Returns the new id. Responsibilities are added separately by the caller, after
// this doc exists (their create rule resolves the parent proposal by id).
export async function createProposalFromCopy(groupId, userId, content) {
  const ref = await addDoc(collection(db, 'proposals'), {
    groupId,
    createdBy: userId,
    title: content.title || '',
    description: content.description || '',
    // Date is intentionally not carried over — a copy requires a fresh date.
    date: content.date || '',
    time: content.time || '',
    activity: content.activity || '',
    location: content.location || '',
    childcareNotes: content.childcareNotes || '',
    budget: content.budget || '',
    notes: content.notes || '',
    // Only attach voting when the source had any, so non-voting copies stay clean.
    ...(content.voting && Object.keys(content.voting).length ? { voting: content.voting } : {}),
    status: 'draft',
    acceptedBy: [],
    archivedByUserIds: [],
    dismissedByUserIds: [],
    decisionDeadline: null,
    locked: false,
    lockedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

export async function updateProposal(proposalId, fields) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    ...fields,
    updatedAt: serverTimestamp()
  })
}

// Manual archive is user-scoped: it only adds/removes the current user from
// archivedByUserIds, leaving the proposal active for everyone else. We don't
// bump updatedAt — a personal view preference shouldn't look like a group edit.
export async function setProposalArchivedForUser(proposalId, userId, archived) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    archivedByUserIds: archived ? arrayUnion(userId) : arrayRemove(userId)
  })
}

// ---------------------------------------------------------------------------
// Status flow & acceptance
//
//   draft → proposed → (every member accepts) → accepted → (creator) confirmed
//                                                          → [date passes] → complete (derived)
//
// Acceptance is per-member (acceptedBy). A proposal auto-advances to `accepted`
// only when every member's uid is present, and the creator alone may confirm.
// Acceptances reset whenever the plan returns to a state members must re-approve.
// ---------------------------------------------------------------------------

// Records the caller's acceptance. If this makes acceptance unanimous, the
// proposal advances to `accepted` in the same write. `acceptedBy`/`memberIds`
// are the latest values from the realtime listener so we can detect unanimity.
export async function acceptProposal(proposalId, userId, memberIds, acceptedBy) {
  const next = Array.from(new Set([...(acceptedBy ?? []), userId]))
  const unanimous = memberIds.length > 0 && memberIds.every((m) => next.includes(m))
  await updateDoc(doc(db, 'proposals', proposalId), {
    acceptedBy: arrayUnion(userId),
    ...(unanimous ? { status: 'accepted' } : {}),
    updatedAt: serverTimestamp()
  })
}

// Withdraws the caller's acceptance. Acceptance is no longer unanimous, so the
// proposal returns to `proposed` (safe to set even if already proposed).
export async function revokeAcceptance(proposalId, userId) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    acceptedBy: arrayRemove(userId),
    status: 'proposed',
    updatedAt: serverTimestamp()
  })
}

// Generic status move, optionally clearing acceptances. Acceptances are reset
// on any transition that sends the plan back for (re)approval.
export async function transitionProposal(proposalId, status, { resetAcceptances = false } = {}) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    status,
    ...(resetAcceptances ? { acceptedBy: [] } : {}),
    updatedAt: serverTimestamp()
  })
}

// Per-user removal of a completed proposal from one's own archive. Like manual
// archive, it only touches the caller's entry and doesn't bump updatedAt.
export async function dismissProposalForUser(proposalId, userId, dismissed) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    dismissedByUserIds: dismissed ? arrayUnion(userId) : arrayRemove(userId)
  })
}

// True when the proposal's date/time exists and is in the past. date is a
// YYYY-MM-DD string and time an optional HH:MM string (both as written in the
// editor). Missing time means end-of-day so a same-day plan stays active.
export function isProposalPast(proposal) {
  if (!proposal?.date) return false
  const dt = new Date(`${proposal.date}T${proposal.time || '23:59'}`)
  if (Number.isNaN(dt.getTime())) return false
  return dt.getTime() < Date.now()
}

// A proposal is "complete" once the day AFTER its event date has begun — i.e.
// the event is over. Date-only (time is ignored): an event dated today stays
// upcoming all day and only completes at midnight tomorrow. Completion is
// derived, never stored: this app has no scheduler, so it's computed on read.
export function isProposalComplete(proposal) {
  if (!proposal?.date) return false
  const eventDay = new Date(`${proposal.date}T00:00:00`)
  if (Number.isNaN(eventDay.getTime())) return false
  const dayAfter = new Date(eventDay)
  dayAfter.setDate(dayAfter.getDate() + 1)
  return Date.now() >= dayAfter.getTime()
}

// System auto-archive: a proposal leaves the active list once it's complete.
// Derived from the shared date, so it applies to every user with no write.
export function isAutoArchived(proposal) {
  return isProposalComplete(proposal)
}

export function isArchivedForUser(proposal, userId) {
  if (isAutoArchived(proposal)) return true
  return (proposal?.archivedByUserIds ?? []).includes(userId)
}

// A completed proposal that this user removed from their own archive. Personal
// and non-destructive: it only hides the proposal for them.
export function isDismissedForUser(proposal, userId) {
  return (proposal?.dismissedByUserIds ?? []).includes(userId)
}

// ---------------------------------------------------------------------------
// Decision Deadline / collaboration lock
//
// A proposal's collaboration is "locked" once the creator locks it manually
// (locked === true) OR its decision deadline has passed. Like completion, the
// deadline lock is derived on read — there is no scheduler — so it takes effect
// the moment the proposal is next loaded or interacted with. Legacy proposals
// predate these fields and are simply never locked.
// ---------------------------------------------------------------------------

// True once the proposal's decision deadline (a Timestamp) has been reached.
export function isDeadlinePassed(proposal, now = Date.now()) {
  const dl = proposal?.decisionDeadline
  if (!dl?.toMillis) return false
  return now >= dl.toMillis()
}

export function isProposalLocked(proposal, now = Date.now()) {
  return proposal?.locked === true || isDeadlinePassed(proposal, now)
}

// Creator sets or clears the decision deadline. `deadline` is a JS Date (stored
// as a Timestamp) or null to clear. Setting a deadline doesn't lock immediately
// — the lock is derived once it passes (isProposalLocked).
export async function setDecisionDeadline(proposalId, deadline) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    decisionDeadline: deadline ?? null,
    updatedAt: serverTimestamp()
  })
}

// Creator closes collaboration now, regardless of any deadline.
export async function lockProposal(proposalId) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    locked: true,
    lockedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
}

// Creator reopens collaboration. Clears the manual lock AND any deadline — a
// deadline already in the past would otherwise re-lock the proposal instantly —
// returning it to normal collaborative behavior.
export async function reopenProposal(proposalId) {
  await updateDoc(doc(db, 'proposals', proposalId), {
    locked: false,
    lockedAt: null,
    decisionDeadline: null,
    updatedAt: serverTimestamp()
  })
}

// Permanently removes a proposal and everything scoped to it (comments,
// responsibilities, activity events) in one atomic batch. Mirrors deleteGroup:
// Firestore evaluates each delete against pre-batch state, so the membership
// reads still pass. Caller must enforce that only the creator may delete.
//
// Note: a single batch is capped at 500 writes; a proposal's child docs stay
// well within that for this app's scale.
export async function deleteProposal(proposalId) {
  const [comments, responsibilities, activityEvents] = await Promise.all([
    getDocs(query(collection(db, 'comments'), where('proposalId', '==', proposalId))),
    getDocs(query(collection(db, 'responsibilities'), where('proposalId', '==', proposalId))),
    getDocs(query(collection(db, 'activityEvents'), where('proposalId', '==', proposalId)))
  ])

  const batch = writeBatch(db)
  ;[comments, responsibilities, activityEvents].forEach((snap) =>
    snap.docs.forEach((d) => batch.delete(d.ref))
  )
  batch.delete(doc(db, 'proposals', proposalId))
  await batch.commit()
}

export function subscribeToGroupProposals(groupId, callback, onError) {
  const q = query(collection(db, 'proposals'), where('groupId', '==', groupId))
  return onSnapshot(
    q,
    (snap) => {
      const proposals = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const at = a.updatedAt?.toMillis?.() ?? 0
          const bt = b.updatedAt?.toMillis?.() ?? 0
          return bt - at
        })
      callback(proposals)
    },
    onError ?? (() => {})
  )
}

export function subscribeToProposal(proposalId, callback, onError) {
  return onSnapshot(
    doc(db, 'proposals', proposalId),
    (snap) => {
      if (snap.exists()) callback({ id: snap.id, ...snap.data() })
      else callback(null)
    },
    onError ?? (() => {})
  )
}

// ---------------------------------------------------------------------------
// Field-level voting
//
// Voting is an optional, additive layer on top of existing proposals. The plain
// string field (e.g. proposal.location) stays the canonical resolved value, so
// non-voting fields and every existing reader keep working unchanged. Voting
// metadata lives in a parallel `voting` map keyed by field name:
//
//   voting: {
//     location: {
//       allowVoting: true,
//       votingLocked: false,
//       options: [{ id, value, votes: [userId] }]
//     }
//   }
//
// When a field resolves, the winning value is written back into the plain field
// (the resolvedValue) and votingLocked is set, so the dashboard and detail view
// display it with no special handling.
// ---------------------------------------------------------------------------

// Fields that may be put to a vote. Title/description/notes are freeform and
// stay plain-text only.
export const VOTABLE_FIELDS = ['date', 'time', 'activity', 'location', 'childcareNotes', 'budget']

// An option records its author (createdBy) so the UI can let that person edit or
// delete their own suggestion while voting is open. Legacy options predate the
// field and simply carry createdBy: null (no owner controls shown).
export function createFieldOption(value, createdBy = null) {
  return { id: crypto.randomUUID(), value, votes: [], createdBy }
}

// Builds a fresh `voting` map for a copied proposal: each field keeps its
// allowVoting flag and its option *values*, but votes are cleared, voting is
// reopened (votingLocked: false), and every option gets a new id/author (the
// copier). The `date` field's options are dropped — they're past dates and the
// copy requires a new date — while its allowVoting flag is preserved so members
// can re-suggest dates. Returns {} when the source had no voting.
export function buildCopiedVoting(proposal, userId = null) {
  const src = proposal?.voting
  if (!src) return {}
  const out = {}
  for (const field of Object.keys(src)) {
    const v = src[field]
    if (!v) continue
    const sourceOptions = field === 'date' ? [] : (v.options ?? [])
    out[field] = {
      allowVoting: !!v.allowVoting,
      votingLocked: false,
      options: sourceOptions.map((o) => createFieldOption(o.value, userId))
    }
  }
  return out
}

// Time options read best in chronological order. HTML time inputs produce 24h
// "HH:MM" strings, which already sort chronologically as plain strings, so a
// value sort suffices. Other fields keep their insertion order.
export function sortOptionsForField(field, options) {
  if (field !== 'time') return options
  return [...options].sort((a, b) => (a.value || '').localeCompare(b.value || ''))
}

export function getFieldVoting(proposal, field) {
  return proposal?.voting?.[field] ?? null
}

export function isFieldVotingEnabled(proposal, field) {
  return !!proposal?.voting?.[field]?.allowVoting
}

export function isFieldVotingActive(proposal, field) {
  const v = proposal?.voting?.[field]
  return !!v?.allowVoting && !v.votingLocked
}

// Options sharing the highest vote count. Returns [] when no votes have been
// cast (no leader yet) — a single entry means a clear winner, more means a tie.
export function getLeaders(options) {
  const opts = options ?? []
  const max = Math.max(0, ...opts.map((o) => o.votes?.length ?? 0))
  if (max === 0) return []
  return opts.filter((o) => (o.votes?.length ?? 0) === max)
}

export function allMembersVoted(options, memberIds) {
  if (!memberIds || memberIds.length === 0) return false
  const voters = new Set()
  ;(options ?? []).forEach((o) => (o.votes ?? []).forEach((v) => voters.add(v)))
  return memberIds.every((id) => voters.has(id))
}

// Builds the dot-path payload that enables/disables voting per field, to merge
// into an edit save. Enabling seeds the first option from the current value (if
// any); disabling removes the field's voting entry entirely (full revert).
export function computeVotingChanges(proposal, plainFields, toggles, userId = null) {
  const changes = {}
  for (const field of VOTABLE_FIELDS) {
    const wasEnabled = !!proposal?.voting?.[field]?.allowVoting
    const nowEnabled = !!toggles[field]
    if (nowEnabled && !wasEnabled) {
      const seed = (plainFields[field] ?? '').trim()
      changes[`voting.${field}`] = {
        allowVoting: true,
        votingLocked: false,
        options: seed ? [createFieldOption(seed, userId)] : []
      }
    } else if (!nowEnabled && wasEnabled) {
      changes[`voting.${field}`] = deleteField()
    }
  }
  return changes
}

// One vote per field: removes the user from every option, then adds them to the
// chosen one (re-voting the same option toggles it off). Voting stays open — a
// field only resolves and locks when the creator locks it (lockFieldToLeader,
// resolveFieldTo, or lockProposalVoting). Until then members may freely change
// or undo their vote.
export async function castVote(proposalId, field, optionId, userId, options) {
  const newOptions = (options ?? []).map((o) => {
    const others = (o.votes ?? []).filter((v) => v !== userId)
    if (o.id !== optionId) return { ...o, votes: others }
    const alreadyHere = (o.votes ?? []).includes(userId)
    return { ...o, votes: alreadyHere ? others : [...others, userId] }
  })

  await updateDoc(doc(db, 'proposals', proposalId), {
    [`voting.${field}.options`]: newOptions
  })
}

export async function addFieldOption(proposalId, field, value, options, userId) {
  const newOptions = [...(options ?? []), createFieldOption(value.trim(), userId)]
  await updateDoc(doc(db, 'proposals', proposalId), {
    [`voting.${field}.options`]: sortOptionsForField(field, newOptions)
  })
}

// Edits a single option's value, preserving its id, votes, and author. The
// caller restricts this to the option's own author while voting is open; the
// result is re-sorted so time options stay in chronological order after an edit.
export async function updateFieldOption(proposalId, field, optionId, value, options) {
  const newOptions = (options ?? []).map((o) =>
    o.id === optionId ? { ...o, value: value.trim() } : o
  )
  await updateDoc(doc(db, 'proposals', proposalId), {
    [`voting.${field}.options`]: sortOptionsForField(field, newOptions)
  })
}

// Removes a single option (its votes go with it). Gated by the caller so only
// the option's author may remove it while voting is open.
export async function removeFieldOption(proposalId, field, optionId, options) {
  const newOptions = (options ?? []).filter((o) => o.id !== optionId)
  await updateDoc(doc(db, 'proposals', proposalId), {
    [`voting.${field}.options`]: newOptions
  })
}

// Creator locks a field to its current clear leader. Throws if there's no
// single leader (caller should resolve a tie via resolveFieldTo instead).
export async function lockFieldToLeader(proposalId, field, options) {
  const leaders = getLeaders(options)
  if (leaders.length !== 1) throw new Error('No single leader to lock')
  await updateDoc(doc(db, 'proposals', proposalId), {
    [field]: leaders[0].value,
    [`voting.${field}.votingLocked`]: true,
    updatedAt: serverTimestamp()
  })
}

// Creator selects a specific option as the winner — used to break ties or
// override. Sets the resolved value and locks the field.
export async function resolveFieldTo(proposalId, field, optionId, options) {
  const opt = (options ?? []).find((o) => o.id === optionId)
  if (!opt) throw new Error('Option not found')
  await updateDoc(doc(db, 'proposals', proposalId), {
    [field]: opt.value,
    [`voting.${field}.votingLocked`]: true,
    updatedAt: serverTimestamp()
  })
}

// Creator finalizes the whole proposal: locks every active voting field that has
// a clear leader (or no options). Returns the fields it couldn't auto-resolve
// (ties / no votes among multiple options) so the UI can prompt a manual pick.
export async function lockProposalVoting(proposalId, proposal) {
  const payload = {}
  const unresolved = []
  for (const field of VOTABLE_FIELDS) {
    const v = proposal?.voting?.[field]
    if (!v?.allowVoting || v.votingLocked) continue
    const opts = v.options ?? []
    const leaders = getLeaders(opts)
    if (leaders.length === 1) {
      payload[field] = leaders[0].value
      payload[`voting.${field}.votingLocked`] = true
    } else if (opts.length === 0) {
      payload[`voting.${field}.votingLocked`] = true
    } else {
      unresolved.push(field)
    }
  }
  if (Object.keys(payload).length > 0) {
    payload.updatedAt = serverTimestamp()
    await updateDoc(doc(db, 'proposals', proposalId), payload)
  }
  return unresolved
}
