import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firestore'

export async function logActivity(proposalId, type, description) {
  await addDoc(collection(db, 'activityEvents'), {
    proposalId,
    type,
    description,
    createdAt: serverTimestamp()
  })
}

export function subscribeToActivity(proposalId, callback) {
  const q = query(collection(db, 'activityEvents'), where('proposalId', '==', proposalId))
  return onSnapshot(q, (snap) => {
    const events = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0
        const bt = b.createdAt?.toMillis?.() ?? 0
        return at - bt
      })
    callback(events)
  })
}
