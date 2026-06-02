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
