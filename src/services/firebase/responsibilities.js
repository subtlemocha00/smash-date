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

export async function addResponsibility(proposalId, title, assignedTo, assigneeName, dueDate = null) {
  await addDoc(collection(db, 'responsibilities'), {
    proposalId,
    title,
    assignedTo,
    assigneeName,
    dueDate: dueDate || null,
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
