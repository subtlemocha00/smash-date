import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { db } from '../services/firebase/firestore'
import { renameGroup, removeMember, deleteGroup } from '../services/firebase/groups'
import styles from './GroupManager.module.css'

// Best-effort display name for a member uid. Firestore rules only guarantee a
// user can read their own profile, so other members fall back to a short uid.
function shortUid(uid) {
  return `User ${uid.slice(0, 6)}`
}

export default function GroupManager() {
  const { user } = useAuth()
  const { activeGroup } = useGroups()

  const [memberNames, setMemberNames] = useState({})
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [removingId, setRemovingId] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const memberIds = activeGroup?.memberIds ?? []
  // Legacy groups created before createdBy existed let any member manage them.
  const isOwner = activeGroup
    ? activeGroup.createdBy === user.uid || !activeGroup.createdBy
    : false

  useEffect(() => {
    setName(activeGroup?.name ?? '')
  }, [activeGroup?.id, activeGroup?.name])

  useEffect(() => {
    let cancelled = false
    async function loadNames() {
      const entries = await Promise.all(
        memberIds.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid))
            if (snap.exists()) {
              const data = snap.data()
              return [uid, data.displayName || data.email || shortUid(uid)]
            }
          } catch {
            // Not readable under rules — fall back below.
          }
          return [uid, shortUid(uid)]
        })
      )
      if (!cancelled) setMemberNames(Object.fromEntries(entries))
    }
    if (memberIds.length > 0) loadNames()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.id, memberIds.join(',')])

  if (!activeGroup) {
    return <p className={styles.muted}>No active group selected.</p>
  }

  async function handleRename(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed === activeGroup.name) return
    setRenaming(true)
    setRenameError('')
    try {
      await renameGroup(activeGroup.id, trimmed)
    } catch {
      setRenameError('Failed to rename group.')
    } finally {
      setRenaming(false)
    }
  }

  async function handleRemove(uid) {
    setRemovingId(uid)
    setRemoveError('')
    try {
      await removeMember(activeGroup.id, uid)
    } catch {
      setRemoveError('Failed to remove member.')
    } finally {
      setRemovingId('')
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${activeGroup.name}"? This removes the group and all of its proposals for everyone. This cannot be undone.`
    )
    if (!confirmed) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteGroup(activeGroup.id, activeGroup.inviteCode)
      // The realtime listener drops the group and the context selects another
      // (or none); no manual navigation needed.
    } catch {
      setDeleteError('Failed to delete group.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <form onSubmit={handleRename} className={styles.renameRow}>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isOwner}
          aria-label="Group name"
        />
        {isOwner && (
          <button
            className={styles.primaryBtn}
            type="submit"
            disabled={
              renaming || !name.trim() || name.trim() === activeGroup.name
            }
          >
            {renaming ? 'Saving…' : 'Rename'}
          </button>
        )}
      </form>
      {renameError && <p className={styles.error}>{renameError}</p>}

      <ul className={styles.memberList}>
        {memberIds.map((uid) => {
          const isSelf = uid === user.uid
          const isGroupOwner = activeGroup.createdBy === uid
          return (
            <li key={uid} className={styles.memberItem}>
              <span className={styles.memberName}>
                {memberNames[uid] ?? shortUid(uid)}
                {isSelf && <span className={styles.tag}>You</span>}
                {isGroupOwner && <span className={styles.tag}>Owner</span>}
              </span>
              {isOwner && !isSelf && !isGroupOwner && (
                <button
                  className={styles.removeBtn}
                  type="button"
                  onClick={() => handleRemove(uid)}
                  disabled={removingId === uid}
                >
                  {removingId === uid ? 'Removing…' : 'Remove'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {removeError && <p className={styles.error}>{removeError}</p>}

      {isOwner ? (
        <div className={styles.dangerZone}>
          <button
            className={styles.deleteBtn}
            type="button"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete group'}
          </button>
          {deleteError && <p className={styles.error}>{deleteError}</p>}
        </div>
      ) : (
        <p className={styles.muted}>
          Only the group owner can rename, remove members, or delete the group.
        </p>
      )}
    </div>
  )
}
