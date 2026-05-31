import {
  collection,
  addDoc,
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
