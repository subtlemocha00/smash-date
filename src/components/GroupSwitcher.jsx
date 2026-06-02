import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { createGroup, joinGroupByCode } from '../services/firebase/groups'
import styles from './GroupSwitcher.module.css'

export default function GroupSwitcher() {
  const { user } = useAuth()
  const { groups, activeGroupId, setActiveGroup, seedGroup } = useGroups()

  // 'none' | 'create' | 'join'
  const [form, setForm] = useState('none')
  const [newName, setNewName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const hasGroups = groups.length > 0

  function openForm(which) {
    setNewName('')
    setInviteCode('')
    setError('')
    setForm(which)
  }

  function closeForm() {
    setForm('none')
    setError('')
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (busy || !newName.trim()) return
    setBusy(true)
    setError('')
    try {
      const { id, inviteCode: code } = await createGroup(user.uid, newName.trim())
      seedGroup({
        id,
        name: newName.trim(),
        memberIds: [user.uid],
        createdBy: user.uid,
        inviteCode: code
      })
      setActiveGroup(id)
      closeForm()
    } catch {
      setError('Failed to create group. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (busy || !inviteCode.trim()) return
    setBusy(true)
    setError('')
    try {
      const group = await joinGroupByCode(user.uid, inviteCode.trim())
      seedGroup(group)
      setActiveGroup(group.id)
      closeForm()
    } catch (err) {
      // Only surface our own validation messages; never leak a raw Firebase error.
      const known = ['Invalid invite code', 'Group not found']
      setError(
        known.includes(err?.message)
          ? err.message
          : 'Couldn’t join group. Please check the code and try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      {hasGroups ? (
        <div className={styles.row}>
          <label className={styles.label} htmlFor="group-select">
            Group
          </label>
          <select
            id="group-select"
            className={styles.select}
            value={activeGroupId ?? ''}
            onChange={(e) => setActiveGroup(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className={styles.emptyTitle}>
          You&apos;re not in a group yet. Create one or join with an invite code.
        </p>
      )}

      {form === 'none' && (
        <div className={styles.actions}>
          <button className={styles.newBtn} type="button" onClick={() => openForm('create')}>
            + New group
          </button>
          <button className={styles.cancelBtn} type="button" onClick={() => openForm('join')}>
            Join with code
          </button>
        </div>
      )}

      {form === 'create' && (
        <form onSubmit={handleCreate} className={styles.newForm}>
          <input
            className={styles.input}
            placeholder="New group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <div className={styles.newFormActions}>
            <button className={styles.newBtn} type="submit" disabled={busy || !newName.trim()}>
              {busy ? 'Creating…' : 'Create'}
            </button>
            <button className={styles.cancelBtn} type="button" onClick={closeForm}>
              Cancel
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </form>
      )}

      {form === 'join' && (
        <form onSubmit={handleJoin} className={styles.newForm}>
          <input
            className={styles.input}
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            autoFocus
          />
          <div className={styles.newFormActions}>
            <button className={styles.newBtn} type="submit" disabled={busy || !inviteCode.trim()}>
              {busy ? 'Joining…' : 'Join'}
            </button>
            <button className={styles.cancelBtn} type="button" onClick={closeForm}>
              Cancel
            </button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </form>
      )}
    </div>
  )
}
