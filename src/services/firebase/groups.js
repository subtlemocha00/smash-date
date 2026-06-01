import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove
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
    createdBy: userId,
    inviteCode,
    createdAt: serverTimestamp()
  })
  await setDoc(doc(db, 'groupInvites', inviteCode), { groupId: groupRef.id })
  // Make the new group the user's active group. groupId is retained for
  // backwards compatibility with any older readers.
  await updateDoc(doc(db, 'users', userId), {
    groupId: groupRef.id,
    activeGroupId: groupRef.id
  })
  return { id: groupRef.id, inviteCode }
}

export async function joinGroupByCode(userId, code) {
  const formatted = code.toUpperCase().trim()
  const inviteSnap = await getDoc(doc(db, 'groupInvites', formatted))
  if (!inviteSnap.exists()) throw new Error('Invalid invite code')
  const { groupId } = inviteSnap.data()

  // A non-member cannot read the group (read requires membership), so we don't
  // read it first. Try the read only to detect "already a member" — a denied
  // read simply means we still need to join.
  let alreadyMember = false
  try {
    const snap = await getDoc(doc(db, 'groups', groupId))
    if (snap.exists()) alreadyMember = (snap.data().memberIds ?? []).includes(userId)
  } catch {
    alreadyMember = false
  }

  if (!alreadyMember) {
    // The isSelfJoin rule validates this server-side (add only yourself).
    await updateDoc(doc(db, 'groups', groupId), { memberIds: arrayUnion(userId) })
  }
  await updateDoc(doc(db, 'users', userId), {
    groupId,
    activeGroupId: groupId
  })

  // Now a member — safe to read the group for its details.
  const groupSnap = await getDoc(doc(db, 'groups', groupId))
  if (!groupSnap.exists()) throw new Error('Group not found')
  return { id: groupId, ...groupSnap.data() }
}

// Realtime list of every group the user belongs to (many-to-many membership
// lives in each group's memberIds array).
export function subscribeToUserGroups(userId, callback, onError) {
  const q = query(collection(db, 'groups'), where('memberIds', 'array-contains', userId))
  return onSnapshot(
    q,
    (snap) => {
      const groups = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0
          const bt = b.createdAt?.toMillis?.() ?? 0
          return at - bt
        })
      callback(groups)
    },
    onError ?? (() => {})
  )
}

export async function setActiveGroupId(userId, groupId) {
  await updateDoc(doc(db, 'users', userId), { activeGroupId: groupId })
}

// Records a member's display name on the group so other members can show it
// (a user can only read their own users/{uid} doc, so names are denormalized
// here). Each member writes only their own entry — see the isOwnNameUpdate rule.
export async function setMemberName(groupId, uid, name) {
  await updateDoc(doc(db, 'groups', groupId), { [`memberNames.${uid}`]: name })
}

export async function renameGroup(groupId, name) {
  await updateDoc(doc(db, 'groups', groupId), { name })
}

export async function removeMember(groupId, userId) {
  await updateDoc(doc(db, 'groups', groupId), { memberIds: arrayRemove(userId) })
}

// Owner-only. Deletes the group and everything scoped to it: every proposal,
// and each proposal's comments, responsibilities, and activity events, plus the
// invite. Done in one atomic batch — Firestore evaluates each delete against the
// pre-batch state, so the membership checks (which read the still-present group
// and proposals) all pass. No soft-delete.
//
// Note: a single batch is capped at 500 writes; this assumes a group's total
// document count stays within that, which holds for this app's scale.
export async function deleteGroup(groupId, inviteCode) {
  const proposalsSnap = await getDocs(
    query(collection(db, 'proposals'), where('groupId', '==', groupId))
  )

  const childSnaps = await Promise.all(
    proposalsSnap.docs.flatMap((p) => [
      getDocs(query(collection(db, 'comments'), where('proposalId', '==', p.id))),
      getDocs(query(collection(db, 'responsibilities'), where('proposalId', '==', p.id))),
      getDocs(query(collection(db, 'activityEvents'), where('proposalId', '==', p.id)))
    ])
  )

  const batch = writeBatch(db)
  childSnaps.forEach((snap) => snap.docs.forEach((d) => batch.delete(d.ref)))
  proposalsSnap.docs.forEach((d) => batch.delete(d.ref))
  if (inviteCode) batch.delete(doc(db, 'groupInvites', inviteCode))
  batch.delete(doc(db, 'groups', groupId))
  await batch.commit()
}
