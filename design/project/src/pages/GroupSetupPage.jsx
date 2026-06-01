import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createGroup, joinGroupByCode } from '../services/firebase/groups'
import styles from './GroupSetupPage.module.css'

export default function GroupSetupPage() {
  const { user, setUserProfile } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('create')
  const [groupName, setGroupName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    if (!groupName.trim()) return
    setError('')
    setSubmitting(true)
    try {
      const { id } = await createGroup(user.uid, groupName.trim())
      setUserProfile((prev) => ({ ...prev, groupId: id }))
      navigate('/dashboard')
    } catch {
      setError('Failed to create group. Please try again.')
      setSubmitting(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    if (!inviteCode.trim()) return
    setError('')
    setSubmitting(true)
    try {
      const group = await joinGroupByCode(user.uid, inviteCode.trim())
      setUserProfile((prev) => ({ ...prev, groupId: group.id }))
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Invalid code. Please check and try again.')
      setSubmitting(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Set up your group</h1>
        <p className={styles.subtitle}>Create a new group or join with an invite code.</p>
        <div className={styles.tabs}>
          <button
            className={mode === 'create' ? styles.activeTab : styles.tab}
            onClick={() => switchMode('create')}
            type="button"
          >
            Create Group
          </button>
          <button
            className={mode === 'join' ? styles.activeTab : styles.tab}
            onClick={() => switchMode('join')}
            type="button"
          >
            Join Group
          </button>
        </div>
        {mode === 'create' ? (
          <form onSubmit={handleCreate} className={styles.form}>
            <input
              className={styles.input}
              type="text"
              placeholder="Group name (e.g. Sarah & Jake)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryBtn} type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Group'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className={styles.form}>
            <input
              className={styles.input}
              type="text"
              placeholder="Enter invite code"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.primaryBtn} type="submit" disabled={submitting}>
              {submitting ? 'Joining…' : 'Join Group'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
