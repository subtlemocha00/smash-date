import {
  collection,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
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

export function subscribeToGroupProposals(groupId, callback) {
  const q = query(collection(db, 'proposals'), where('groupId', '==', groupId))
  return onSnapshot(q, (snap) => {
    const proposals = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const at = a.updatedAt?.toMillis?.() ?? 0
        const bt = b.updatedAt?.toMillis?.() ?? 0
        return bt - at
      })
    callback(proposals)
  })
}

export function subscribeToProposal(proposalId, callback) {
  return onSnapshot(doc(db, 'proposals', proposalId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() })
    else callback(null)
  })
}
