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
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db } from './firestore'
import { storage } from './storage'

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

export async function createGroup(userId, groupName) {
  const inviteCode = generateInviteCode()
  const groupRef = await addDoc(collection(db, 'groups'), {
    name: groupName,
    memberIds: [userId],
    createdBy: userId,
    inviteCode,
    groupImageUrl: null,
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

// One image per group, stored at a fixed path so each upload overwrites the
// previous file — no orphans accumulate and no extra "path" field is needed.
// Overwriting yields a fresh download token, so the new URL busts any cache.
//
// The group creator's uid is part of the path. Storage rules enforce
// creator-only writes by comparing request.auth.uid to that path segment, which
// avoids a cross-service Firestore lookup (unreliable in some projects).
function groupImageRef(groupId, ownerUid) {
  return ref(storage, `groupImages/${groupId}/${ownerUid}/profile`)
}

// Creator-only (enforced by Storage rules via the ownerUid path segment, and by
// Firestore rules on the groupImageUrl write). Pass the group's createdBy uid as
// ownerUid. Uploads the file, records the resulting URL, and returns it.
export async function uploadGroupImage(groupId, ownerUid, file) {
  const imageRef = groupImageRef(groupId, ownerUid)
  await uploadBytes(imageRef, file, { contentType: file.type })
  const url = await getDownloadURL(imageRef)
  await updateDoc(doc(db, 'groups', groupId), { groupImageUrl: url })
  return url
}

// Creator-only. Removes the storage file and clears the URL. Tolerates an
// already-missing file so a stale pointer can still be cleared.
export async function removeGroupImage(groupId, ownerUid) {
  try {
    await deleteObject(groupImageRef(groupId, ownerUid))
  } catch (err) {
    if (err?.code !== 'storage/object-not-found') throw err
  }
  await updateDoc(doc(db, 'groups', groupId), {
    groupImageUrl: null,
    groupImagePosition: null,
    groupImageScale: null
  })
}

// Creator-only. Stores the image framing so every member sees the same view:
// the focal point as a CSS object-position string (e.g. "50% 30%") and a zoom
// scale (1 = fit-to-banner, higher = zoomed in).
export async function setGroupImageFraming(groupId, position, scale) {
  await updateDoc(doc(db, 'groups', groupId), {
    groupImagePosition: position,
    groupImageScale: scale
  })
}
