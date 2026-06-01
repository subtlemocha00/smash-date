import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore'
import { db } from './firestore'

export async function createNotification(userId, type, message, proposalId, groupId) {
  await addDoc(collection(db, 'notifications'), {
    userId,
    type,
    message,
    proposalId: proposalId ?? null,
    groupId: groupId ?? null,
    read: false,
    createdAt: serverTimestamp()
  })
}

export async function createNotificationsForGroup(
  memberIds,
  actorUid,
  type,
  message,
  proposalId,
  groupId
) {
  const recipients = memberIds.filter((uid) => uid !== actorUid)
  if (recipients.length === 0) return
  await Promise.all(
    recipients.map((uid) => createNotification(uid, type, message, proposalId, groupId))
  )
}

export function subscribeToUserNotifications(userId, callback, onError) {
  const q = query(collection(db, 'notifications'), where('userId', '==', userId))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
      callback(items)
    },
    onError ?? (() => {})
  )
}

export async function markNotificationRead(notificationId) {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true })
}

export async function markAllNotificationsRead(notifications) {
  const unread = notifications.filter((n) => !n.read)
  if (unread.length === 0) return
  const batch = writeBatch(db)
  unread.forEach((n) => {
    batch.update(doc(db, 'notifications', n.id), { read: true })
  })
  await batch.commit()
}
