import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { db } from '../services/firebase/firestore'
import {
  renameGroup,
  removeMember,
  deleteGroup,
  setMemberDisplayName
} from '../services/firebase/groups'
import { resolveMemberName } from '../utils/memberNames'
import styles from './GroupManager.module.css'

// Best-effort display name for a member uid. Firestore rules only guarantee a
// user can read their own profile, so other members fall back to a short uid.
function shortUid(uid) {
  return `User ${uid.slice(0, 6)}`
}

export default function GroupManager() {
  const { user, userProfile } = useAuth()
  const { activeGroup } = useGroups()

  const [memberNames, setMemberNames] = useState({})
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [removingId, setRemovingId] = useState('')
  const [removeError, setRemoveError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // The current user's group-specific display name override (this group only).
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameSaved, setNameSaved] = useState(false)

  const memberIds = activeGroup?.memberIds ?? []
  // The current override as stored, and the account-name fallback shown when no
  // override is set.
  const currentOverride = activeGroup?.memberDisplayNames?.[user.uid] ?? ''
  const accountName = userProfile?.displayName || user.email || ''
  // Legacy groups created before createdBy existed let any member manage them.
  const isOwner = activeGroup
    ? activeGroup.createdBy === user.uid || !activeGroup.createdBy
    : false

  useEffect(() => {
    setName(activeGroup?.name ?? '')
  }, [activeGroup?.id, activeGroup?.name])

  // On group switch, seed the field from that group's stored override and clear
  // any prior status. Keyed on the group id only, so the realtime update that
  // lands right after a save (same group) doesn't wipe the "Saved." confirmation.
  useEffect(() => {
    setDisplayNameInput(activeGroup?.memberDisplayNames?.[user.uid] ?? '')
    setNameSaved(false)
    setNameError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.id])

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
      setRenameError('Failed to rename group. Please try again.')
    } finally {
      setRenaming(false)
    }
  }

  async function saveDisplayName(value) {
    const trimmed = value.trim()
    if (trimmed === currentOverride) return
    setSavingName(true)
    setNameError('')
    setNameSaved(false)
    try {
      // Group-scoped only — this never touches Firebase Auth or the user profile.
      await setMemberDisplayName(activeGroup.id, user.uid, trimmed)
      setNameSaved(true)
    } catch {
      setNameError('Failed to save your name. Please try again.')
    } finally {
      setSavingName(false)
    }
  }

  function handleSaveDisplayName(e) {
    e.preventDefault()
    saveDisplayName(displayNameInput)
  }

  function handleResetDisplayName() {
    setDisplayNameInput('')
    saveDisplayName('')
  }

  async function handleRemove(uid) {
    setRemovingId(uid)
    setRemoveError('')
    try {
      await removeMember(activeGroup.id, uid)
    } catch {
      setRemoveError('Failed to remove member. Please try again.')
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
      setDeleteError('Failed to delete group. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Per-group display name. Lets the current user customize how they appear
          in this group only, without changing their account name. */}
      <form onSubmit={handleSaveDisplayName} className={styles.nameField}>
        <label className={styles.fieldLabel} htmlFor="groupDisplayName">
          Your name in this group
        </label>
        <div className={styles.nameRow}>
          <input
            id="groupDisplayName"
            className={styles.input}
            value={displayNameInput}
            onChange={(e) => {
              setDisplayNameInput(e.target.value)
              setNameSaved(false)
            }}
            placeholder={accountName}
            maxLength={60}
            aria-label="Your display name in this group"
          />
          <button
            className={styles.primaryBtn}
            type="submit"
            disabled={savingName || displayNameInput.trim() === currentOverride}
          >
            {savingName ? 'Saving…' : 'Save'}
          </button>
        </div>
        {currentOverride ? (
          <button
            type="button"
            className={styles.linkBtn}
            onClick={handleResetDisplayName}
            disabled={savingName}
          >
            Use account name ({accountName})
          </button>
        ) : (
          <p className={styles.muted}>
            Leave blank to use your account name ({accountName}).
          </p>
        )}
        {nameSaved && <p className={styles.success}>Saved.</p>}
        {nameError && <p className={styles.error}>{nameError}</p>}
      </form>

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
          // Prefer the group's resolved name (override → denormalized account
          // name); fall back to the directly-read profile name, then a short uid.
          const resolved = resolveMemberName(
            activeGroup,
            uid,
            isSelf ? { email: user.email } : {}
          )
          const shownName = resolved || memberNames[uid] || shortUid(uid)
          return (
            <li key={uid} className={styles.memberItem}>
              <span className={styles.memberName}>
                {shownName}
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
