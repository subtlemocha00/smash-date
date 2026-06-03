import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { logOut } from '../services/firebase/auth'
import GroupSwitcher from '../components/GroupSwitcher'
import GroupImage from '../components/GroupImage'
import {
  createProposal,
  subscribeToGroupProposals,
  isArchivedForUser,
  isProposalComplete,
  isDismissedForUser
} from '../services/firebase/proposals'
import { logActivity } from '../services/firebase/activityEvents'
import {
  subscribeToUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  createNotificationsForGroup
} from '../services/firebase/notifications'
import { subscribeToResponsibilitiesForProposals } from '../services/firebase/responsibilities'
import { proposalUrgency, URGENCY_ORDER } from '../utils/urgency'
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

// Proposal dates are plain YYYY-MM-DD strings (not Firestore timestamps).
function formatProposalDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardPage() {
  const { user, userProfile } = useAuth()
  const { groupsLoading, activeGroupId, activeGroup } = useGroups()
  const navigate = useNavigate()

  const [proposals, setProposals] = useState([])
  const [proposalsLoading, setProposalsLoading] = useState(true)
  const [proposalsError, setProposalsError] = useState('')

  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)
  const [notifCollapsed, setNotifCollapsed] = useState(false)

  const [myResponsibilities, setMyResponsibilities] = useState([])

  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!activeGroupId) {
      setProposals([])
      setProposalsLoading(false)
      return
    }
    setProposalsLoading(true)
    setProposalsError('')
    const unsub = subscribeToGroupProposals(
      activeGroupId,
      (list) => {
        setProposals(list)
        setProposalsLoading(false)
      },
      () => {
        setProposalsError('Couldn’t load proposals. Check your connection and try again.')
        setProposalsLoading(false)
      }
    )
    return unsub
  }, [activeGroupId])

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

  // Stable dependency for the responsibilities listener: the set of loaded
  // proposal IDs (sorted so order changes don't re-subscribe).
  const proposalIdsKey = proposals.map((p) => p.id).sort().join(',')

  useEffect(() => {
    const ids = proposalIdsKey ? proposalIdsKey.split(',') : []
    const unsub = subscribeToResponsibilitiesForProposals(
      ids,
      (items) => setMyResponsibilities(items),
      () => setMyResponsibilities([])
    )
    return unsub
  }, [proposalIdsKey])

  if (!userProfile) return null

  const hasGroup = !!activeGroup

  // Notifications are stored per-user across all groups; show only those tied to
  // the active group.
  const groupNotifications = notifications.filter((n) => n.groupId === activeGroupId)
  const unreadCount = groupNotifications.filter((n) => !n.read).length

  // Proposals a user removed from their own archive disappear from their view
  // entirely (but stay for everyone else).
  const myProposals = proposals.filter((p) => !isDismissedForUser(p, user.uid))

  // Archive is evaluated per current user (manual archive is user-scoped;
  // auto-archive is derived from the date and identical for everyone).
  const activeProposals = myProposals.filter((p) => !isArchivedForUser(p, user.uid))
  const archivedProposals = myProposals.filter((p) => isArchivedForUser(p, user.uid))
  const visibleProposals = showArchived ? archivedProposals : activeProposals

  const pendingActions = activeProposals.filter((p) =>
    ['proposed', 'changes_requested', 'accepted'].includes(p.status)
  )

  // "My Responsibilities": tasks assigned to the current user, joined to the
  // active group's proposals so we can show the proposal title/date. Urgency
  // comes from the proposal date (see proposalUrgency), not the assignment.
  // The listener loads responsibilities for all loaded proposals (any assignee),
  // so we filter to the current user here. Completed tasks and those whose
  // proposal isn't loaded are dropped; the rest sort most-urgent first.
  const proposalsById = new Map(myProposals.map((p) => [p.id, p]))
  const myResponsibilityItems = myResponsibilities
    .filter((r) => r.assignedTo === user.uid && !r.completed)
    .map((r) => {
      const proposal = proposalsById.get(r.proposalId)
      if (!proposal) return null
      return { responsibility: r, proposal, urgency: proposalUrgency(proposal.date) }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const order = URGENCY_ORDER[a.urgency.level] - URGENCY_ORDER[b.urgency.level]
      if (order !== 0) return order
      const ad = a.urgency.days ?? Infinity
      const bd = b.urgency.days ?? Infinity
      return ad - bd
    })

  async function handleCreateProposal(e) {
    e.preventDefault()
    if (creating) return
    if (!newTitle.trim() || !activeGroupId) return
    setCreating(true)
    setCreateError('')
    try {
      const proposalId = await createProposal(activeGroupId, user.uid, newTitle.trim())
      await logActivity(
        proposalId,
        'proposal_created',
        `${userProfile.displayName || 'Someone'} created this proposal`
      )
      if (activeGroup?.memberIds) {
        await createNotificationsForGroup(
          activeGroup.memberIds,
          user.uid,
          'proposal_created',
          `${userProfile.displayName || 'Someone'} created a new proposal: ${newTitle.trim()}`,
          proposalId,
          activeGroupId
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
      await markAllNotificationsRead(groupNotifications)
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
        <span className={styles.logo}>
          <span className={styles.logoAccent}>Smash</span>
          <span className={styles.logoBase}>Date</span>
          <span className={styles.logoDot}>.</span>
        </span>
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
        {/* Group photo (creator-managed; hidden for non-creators when absent) */}
        <GroupImage />

        {/* Group info + switcher */}
        <section className={styles.section}>
          {groupsLoading ? (
            <p className={styles.muted}>Loading groups…</p>
          ) : (
            <>
              <GroupSwitcher />
              {activeGroup && (
                <p className={`${styles.muted} ${styles.inviteLine}`}>
                  Invite code: <strong>{activeGroup.inviteCode}</strong>
                </p>
              )}
            </>
          )}
        </section>

        {/* Needs Attention */}
        {!proposalsLoading && pendingActions.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Needs Attention</h2>
            </div>
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

        {/* My Responsibilities — tasks assigned to the current user, emphasis
            scaled by how soon the proposal date is. Distinct from the activity
            feed and notifications. */}
        {hasGroup && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>My Responsibilities</h2>
            </div>
            {myResponsibilityItems.length === 0 ? (
              <p className={styles.muted}>Nothing assigned to you right now.</p>
            ) : (
              <ul className={styles.respList}>
                {myResponsibilityItems.map(({ responsibility, proposal, urgency }) => (
                  <li key={responsibility.id}>
                    <Link
                      to={`/proposal/${proposal.id}`}
                      className={`${styles.respRow} ${styles[`resp_${urgency.level}`]}`}
                    >
                      <span className={styles.respMain}>
                        <span className={styles.respTitle}>{responsibility.title}</span>
                        <span className={styles.respProposal}>{proposal.title}</span>
                      </span>
                      <span className={styles.respMeta}>
                        <span className={styles.respUrgency}>{urgency.label}</span>
                        {proposal.date && (
                          <span className={styles.respDate}>{formatProposalDate(proposal.date)}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Notifications */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <button
              className={styles.collapseToggle}
              onClick={() => setNotifCollapsed((c) => !c)}
              aria-expanded={!notifCollapsed}
              type="button"
            >
              <span
                className={`${styles.collapseChevron} ${notifCollapsed ? styles.collapseChevronClosed : ''}`}
                aria-hidden="true"
              />
              <span className={styles.sectionTitle}>
                Notifications
                {unreadCount > 0 && (
                  <span className={styles.sectionBadge}>{unreadCount} new</span>
                )}
              </span>
            </button>
            {!notifCollapsed && unreadCount > 0 && (
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
          {!notifCollapsed && (
            notifLoading ? (
              <p className={styles.muted}>Loading…</p>
            ) : groupNotifications.length === 0 ? (
              <p className={styles.muted}>You&apos;re all caught up.</p>
            ) : (
              <ul className={styles.notifList}>
                {groupNotifications.slice(0, 5).map((n) => (
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
            )
          )}
        </section>

        {/* Proposals */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Proposals</h2>
            {hasGroup && !showNewForm && (
              <button className={styles.newBtn} onClick={openNewForm} type="button">
                + New
              </button>
            )}
          </div>

          {hasGroup && (
            <div className={styles.viewTabs} role="tablist">
              <button
                className={`${styles.viewTab} ${!showArchived ? styles.viewTabActive : ''}`}
                onClick={() => setShowArchived(false)}
                role="tab"
                aria-selected={!showArchived}
                type="button"
              >
                Active{activeProposals.length > 0 ? ` (${activeProposals.length})` : ''}
              </button>
              <button
                className={`${styles.viewTab} ${showArchived ? styles.viewTabActive : ''}`}
                onClick={() => setShowArchived(true)}
                role="tab"
                aria-selected={showArchived}
                type="button"
              >
                Archived{archivedProposals.length > 0 ? ` (${archivedProposals.length})` : ''}
              </button>
            </div>
          )}

          {!hasGroup ? (
            <p className={styles.emptyState}>
              Join or create a group above to start planning dates.
            </p>
          ) : (
            <>
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
          ) : proposalsError ? (
            <p className={styles.errorMsg}>{proposalsError}</p>
          ) : visibleProposals.length === 0 ? (
            <p className={styles.emptyState}>
              {showArchived
                ? 'No archived proposals.'
                : proposals.length === 0
                  ? 'Create your first date idea.'
                  : 'No active proposals.'}
            </p>
          ) : (
            <ul className={styles.proposalList}>
              {visibleProposals.map((p) => {
                // Completion is derived from the date (day after the event), so
                // show it even though the stored status is still e.g. confirmed.
                const status =
                  isProposalComplete(p) && p.status !== 'declined' ? 'completed' : p.status
                return (
                  <li key={p.id}>
                    <Link to={`/proposal/${p.id}`} className={styles.proposalRow}>
                      <span className={styles.proposalTitle}>{p.title}</span>
                      <span className={styles.proposalMeta}>
                        <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                          {STATUS_LABELS[status] ?? status}
                        </span>
                        <span className={styles.proposalDate}>{formatDate(p.updatedAt)}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
