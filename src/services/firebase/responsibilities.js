import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firestore'

export async function addResponsibility(proposalId, title, assignedTo, assigneeName) {
  await addDoc(collection(db, 'responsibilities'), {
    proposalId,
    title,
    assignedTo,
    assigneeName,
    completed: false,
    createdAt: serverTimestamp()
  })
}

export async function toggleResponsibility(id, completed) {
  await updateDoc(doc(db, 'responsibilities', id), { completed })
}

export async function reassignResponsibility(id, assignedTo, assigneeName) {
  await updateDoc(doc(db, 'responsibilities', id), { assignedTo, assigneeName })
}

export async function deleteResponsibility(id) {
  await deleteDoc(doc(db, 'responsibilities', id))
}

// Responsibilities across a set of proposals (used by the dashboard's "My
// Responsibilities" section, passing the active group's loaded proposal IDs and
// filtering to the current user client-side).
//
// Deliberately scoped by proposalId rather than a global `assignedTo == uid`
// query: the read rule resolves each responsibility's group via a get() on its
// proposal, and Firestore fails the WHOLE query if any matched doc is
// unreadable (e.g. an orphaned responsibility on a deleted proposal, or one in a
// group the user has left). Scoping to proposals we already loaded guarantees
// every matched doc is readable. Firestore caps `in` at 30 values, so we chunk
// and merge across one listener per chunk.
export function subscribeToResponsibilitiesForProposals(proposalIds, callback, onError) {
  if (!proposalIds || proposalIds.length === 0) {
    callback([])
    return () => {}
  }

  const chunks = []
  for (let i = 0; i < proposalIds.length; i += 30) {
    chunks.push(proposalIds.slice(i, i + 30))
  }

  const byChunk = new Map()
  const emit = () => {
    const all = []
    byChunk.forEach((arr) => all.push(...arr))
    callback(all)
  }

  const unsubs = chunks.map((chunk, idx) => {
    const q = query(collection(db, 'responsibilities'), where('proposalId', 'in', chunk))
    return onSnapshot(
      q,
      (snap) => {
        byChunk.set(idx, snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        emit()
      },
      onError ?? (() => {})
    )
  })

  return () => unsubs.forEach((u) => u())
}

export function subscribeToResponsibilities(proposalId, callback) {
  const q = query(collection(db, 'responsibilities'), where('proposalId', '==', proposalId))
  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0
        const bt = b.createdAt?.toMillis?.() ?? 0
        return at - bt
      })
    callback(items)
  })
}
