import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firestore'

export async function addComment(proposalId, userId, displayName, message) {
  await addDoc(collection(db, 'comments'), {
    proposalId,
    userId,
    displayName,
    message,
    createdAt: serverTimestamp()
  })
}

// Removes a single comment. Only the comment's author may do this; the caller
// gates the UI and Firestore rules enforce it server-side.
export async function deleteComment(id) {
  await deleteDoc(doc(db, 'comments', id))
}

export function subscribeToComments(proposalId, callback) {
  const q = query(collection(db, 'comments'), where('proposalId', '==', proposalId))
  return onSnapshot(q, (snap) => {
    const comments = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0
        const bt = b.createdAt?.toMillis?.() ?? 0
        return at - bt
      })
    callback(comments)
  })
}
