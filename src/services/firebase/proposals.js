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
    // Per-user manual archive. Auto-archive (completed / past date) is derived,
    // not stored — see isArchivedForUser below.
    archivedByUserIds: [],
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

// True when the proposal's date/time exists and is in the past. date is a
// YYYY-MM-DD string and time an optional HH:MM string (both as written in the
// editor). Missing time means end-of-day so a same-day plan stays active.
export function isProposalPast(proposal) {
  if (!proposal?.date) return false
  const dt = new Date(`${proposal.date}T${proposal.time || '23:59'}`)
  if (Number.isNaN(dt.getTime())) return false
  return dt.getTime() < Date.now()
}

// System auto-archive: applies globally to every user because it's derived
// purely from shared fields (status + date), so no write or sync is needed.
export function isAutoArchived(proposal) {
  return proposal?.status === 'completed' || isProposalPast(proposal)
}

export function isArchivedForUser(proposal, userId) {
  if (isAutoArchived(proposal)) return true
  return (proposal?.archivedByUserIds ?? []).includes(userId)
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

export function createFieldOption(value) {
  return { id: crypto.randomUUID(), value, votes: [] }
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
export function computeVotingChanges(proposal, plainFields, toggles) {
  const changes = {}
  for (const field of VOTABLE_FIELDS) {
    const wasEnabled = !!proposal?.voting?.[field]?.allowVoting
    const nowEnabled = !!toggles[field]
    if (nowEnabled && !wasEnabled) {
      const seed = (plainFields[field] ?? '').trim()
      changes[`voting.${field}`] = {
        allowVoting: true,
        votingLocked: false,
        options: seed ? [createFieldOption(seed)] : []
      }
    } else if (!nowEnabled && wasEnabled) {
      changes[`voting.${field}`] = deleteField()
    }
  }
  return changes
}

// One vote per field: removes the user from every option, then adds them to the
// chosen one (re-voting the same option toggles it off). If this completes
// participation with a single leader, the field auto-resolves in the same write.
export async function castVote(proposalId, field, optionId, userId, options, memberIds) {
  const newOptions = (options ?? []).map((o) => {
    const others = (o.votes ?? []).filter((v) => v !== userId)
    if (o.id !== optionId) return { ...o, votes: others }
    const alreadyHere = (o.votes ?? []).includes(userId)
    return { ...o, votes: alreadyHere ? others : [...others, userId] }
  })

  const payload = { [`voting.${field}.options`]: newOptions }
  if (allMembersVoted(newOptions, memberIds)) {
    const leaders = getLeaders(newOptions)
    if (leaders.length === 1) {
      payload[field] = leaders[0].value
      payload[`voting.${field}.votingLocked`] = true
    }
  }
  await updateDoc(doc(db, 'proposals', proposalId), payload)
}

export async function addFieldOption(proposalId, field, value, options) {
  const newOptions = [...(options ?? []), createFieldOption(value.trim())]
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
