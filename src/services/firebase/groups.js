import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore'
import { db } from './firestore'

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function createGroup(userId, groupName) {
  const inviteCode = generateInviteCode()
  const groupRef = await addDoc(collection(db, 'groups'), {
    name: groupName,
    memberIds: [userId],
    inviteCode,
    createdAt: serverTimestamp()
  })
  await setDoc(doc(db, 'groupInvites', inviteCode), { groupId: groupRef.id })
  await updateDoc(doc(db, 'users', userId), { groupId: groupRef.id })
  return { id: groupRef.id, inviteCode }
}

export async function joinGroupByCode(userId, code) {
  const formatted = code.toUpperCase().trim()
  const inviteSnap = await getDoc(doc(db, 'groupInvites', formatted))
  if (!inviteSnap.exists()) throw new Error('Invalid invite code')
  const { groupId } = inviteSnap.data()
  const groupSnap = await getDoc(doc(db, 'groups', groupId))
  if (!groupSnap.exists()) throw new Error('Group not found')
  const groupData = groupSnap.data()
  if (!groupData.memberIds.includes(userId)) {
    await updateDoc(doc(db, 'groups', groupId), { memberIds: arrayUnion(userId) })
  }
  await updateDoc(doc(db, 'users', userId), { groupId })
  return { id: groupId, ...groupData }
}
