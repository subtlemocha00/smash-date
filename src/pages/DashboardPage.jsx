import { useEffect, useState } from 'react'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { logOut } from '../services/firebase/auth'
import { db } from '../services/firebase/firestore'
import { createProposal, subscribeToGroupProposals } from '../services/firebase/proposals'
import { logActivity } from '../services/firebase/activityEvents'
import {
  subscribeToUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createNotificationsForGroup
} from '../services/firebase/notifications'
import styles from './DashboardPage.module.css'

const STATUS_LABELS = {
  draft: 'Draft',
  proposed: 'Proposed',
  changes_requested: 'Changes Requested',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  completed: 'Completed',
  declined: 'Declined'
}

const PENDING_HINTS = {
  proposed: 'Awaiting response',
  changes_requested: 'Changes requested',
  accepted: 'Awaiting confirmation'
}

function formatDate(ts) {
  if (!ts?.toDate) return ''
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardPage() {
  const { user, userProfile } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [groupLoading, setGroupLoading] = useState(true)
  const [groupError, setGroupError] = useState('')

  const [proposals, setProposals] = useState([])
  const [proposalsLoading, setProposalsLoading] = useState(true)

  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)

  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    if (!userProfile?.groupId) {
      setGroupLoading(false)
      return
    }
    getDoc(doc(db, 'groups', userProfile.groupId))
      .then((snap) => {
        if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
        else setGroupError('Group not found.')
        setGroupLoading(false)
      })
      .catch(() => {
        setGroupError('Failed to load group.')
        setGroupLoading(false)
      })
  }, [userProfile?.groupId])

  useEffect(() => {
    if (!userProfile?.groupId) {
      setProposalsLoading(false)
      return
    }
    const unsub = subscribeToGroupProposals(userProfile.groupId, (list) => {
      setProposals(list)
      setProposalsLoading(false)
    })
    return unsub
  }, [userProfile?.groupId])

  useEffect(() => {
    if (!user?.uid) return
    const unsub = subscribeToUserNotifications(
      user.uid,
      (items) => {
        setNotifications(items)
        setNotifLoading(false)
      },
      () => setNotifLoading(false)
    )
    return unsub
  }, [user?.uid])

  if (!userProfile) return null
  if (!userProfile.groupId) return <Navigate to="/group-setup" replace />

  const unreadCount = notifications.filter((n) => !n.read).length
  const pendingActions = proposals.filter((p) =>
    ['proposed', 'changes_requested', 'accepted'].includes(p.status)
  )

  async function handleCreateProposal(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      const proposalId = await createProposal(userProfile.groupId, user.uid, newTitle.trim())
      await logActivity(
        proposalId,
        'proposal_created',
        `${userProfile.displayName || 'Someone'} created this proposal`
      )
      if (group?.memberIds) {
        await createNotificationsForGroup(
          group.memberIds,
          user.uid,
          'proposal_created',
          `${userProfile.displayName || 'Someone'} created a new proposal: ${newTitle.trim()}`,
          proposalId
        )
      }
      navigate(`/proposal/${proposalId}`)
    } catch {
      setCreateError('Failed to create proposal. Please try again.')
      setCreating(false)
    }
  }

  async function handleMarkAllRead() {
    setMarkingAllRead(true)
    try {
      await markAllNotificationsRead(notifications)
    } finally {
      setMarkingAllRead(false)
    }
  }

  function openNewForm() {
    setNewTitle('')
    setCreateError('')
    setShowNewForm(true)
  }

  function cancelNewForm() {
    setShowNewForm(false)
    setNewTitle('')
    setCreateError('')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo}>Smash Date</span>
        <div className={styles.headerRight}>
          {unreadCount > 0 && (
            <span className={styles.notifCount}>{unreadCount}</span>
          )}
          <Link to="/settings" className={styles.navLink}>Settings</Link>
          <button className={styles.signOutBtn} onClick={logOut} type="button">
            Sign Out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {/* Group info */}
        <section className={styles.section}>
          {groupLoading ? (
            <p className={styles.muted}>Loading group…</p>
          ) : groupError ? (
            <p className={styles.errorMsg}>{groupError}</p>
          ) : group ? (
            <>
              <h2 className={styles.groupName}>{group.name}</h2>
              <p className={styles.muted}>
                Invite code: <strong>{group.inviteCode}</strong>
              </p>
            </>
          ) : null}
        </section>

        {/* Needs Attention */}
        {!proposalsLoading && pendingActions.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Needs Attention</h2>
            <ul className={styles.pendingList}>
              {pendingActions.map((p) => (
                <li key={p.id}>
                  <Link to={`/proposal/${p.id}`} className={styles.pendingRow}>
                    <span className={styles.pendingTitle}>{p.title}</span>
                    <span className={styles.pendingHint}>
                      {PENDING_HINTS[p.status] ?? STATUS_LABELS[p.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Notifications */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Notifications
              {unreadCount > 0 && (
                <span className={styles.sectionBadge}>{unreadCount} new</span>
              )}
            </h2>
            {unreadCount > 0 && (
              <button
                className={styles.textBtn}
                onClick={handleMarkAllRead}
                disabled={markingAllRead}
                type="button"
              >
                {markingAllRead ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>
          {notifLoading ? (
            <p className={styles.muted}>Loading…</p>
          ) : notifications.length === 0 ? (
            <p className={styles.muted}>You&apos;re all caught up.</p>
          ) : (
            <ul className={styles.notifList}>
              {notifications.slice(0, 5).map((n) => (
                <li
                  key={n.id}
                  className={`${styles.notifItem} ${!n.read ? styles.notifUnread : ''}`}
                >
                  <span className={styles.notifBody}>
                    {n.proposalId ? (
                      <Link
                        to={`/proposal/${n.proposalId}`}
                        className={styles.notifLink}
                        onClick={() => !n.read && markNotificationRead(n.id)}
                      >
                        {n.message}
                      </Link>
                    ) : (
                      n.message
                    )}
                  </span>
                  <span className={styles.notifTime}>{formatDate(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Proposals */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Proposals</h2>
            {!showNewForm && (
              <button className={styles.newBtn} onClick={openNewForm} type="button">
                + New
              </button>
            )}
          </div>

          {showNewForm && (
            <form onSubmit={handleCreateProposal} className={styles.newForm}>
              <input
                className={styles.newInput}
                placeholder="Proposal title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
              {createError && <p className={styles.errorMsg}>{createError}</p>}
              <div className={styles.newFormActions}>
                <button
                  className={styles.newBtn}
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button className={styles.cancelBtn} type="button" onClick={cancelNewForm}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {proposalsLoading ? (
            <p className={styles.muted}>Loading…</p>
          ) : proposals.length === 0 ? (
            <p className={styles.emptyState}>Create your first date idea.</p>
          ) : (
            <ul className={styles.proposalList}>
              {proposals.map((p) => (
                <li key={p.id}>
                  <Link to={`/proposal/${p.id}`} className={styles.proposalRow}>
                    <span className={styles.proposalTitle}>{p.title}</span>
                    <span className={styles.proposalMeta}>
                      <span className={`${styles.statusBadge} ${styles[`status_${p.status}`]}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                      </span>
                      <span className={styles.proposalDate}>{formatDate(p.updatedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
