import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGroups } from '../context/GroupContext'
import { logOut } from '../services/firebase/auth'
import GroupSwitcher from '../components/GroupSwitcher'
import GroupImage from '../components/GroupImage'
import {
  createProposal,
  createProposalFromCopy,
  subscribeToGroupProposals,
  isArchivedForUser,
  isProposalComplete,
  isDismissedForUser
} from '../services/firebase/proposals'
import { logActivity } from '../services/firebase/activityEvents'
import {
  subscribeToResponsibilitiesForProposals,
  addResponsibilitiesForCopy
} from '../services/firebase/responsibilities'
import { proposalUrgency, URGENCY_ORDER } from '../utils/urgency'
import { todayDateString, isPastDate } from '../utils/dates'
import { resolveMemberName } from '../utils/memberNames'
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
  const location = useLocation()

  const [proposals, setProposals] = useState([])
  const [proposalsLoading, setProposalsLoading] = useState(true)
  const [proposalsError, setProposalsError] = useState('')

  const [myResponsibilities, setMyResponsibilities] = useState([])

  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // When set, the create form is in "copy mode": pre-filled from an existing
  // proposal and requiring a new date before it can be saved. The draft is a
  // transient handoff from the proposal page (router state), never persisted.
  const [copyDraft, setCopyDraft] = useState(null)
  const [copyDate, setCopyDate] = useState('')

  const [showArchived, setShowArchived] = useState(false)

  // Today's local date (YYYY-MM-DD) — the min for a copy's required new date, so
  // a copy can't start already-past (which would lock it immediately).
  const todayStr = todayDateString()

  // Pick up a copy draft handed over from the proposal page, then clear it from
  // history so a refresh or back-navigation doesn't resurrect it.
  useEffect(() => {
    const draft = location.state?.copyDraft
    if (!draft) return
    setCopyDraft(draft)
    setNewTitle(draft.fields?.title || '')
    setCopyDate('')
    setCreateError('')
    setShowNewForm(true)
    navigate(location.pathname, { replace: true, state: {} })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  // so we filter to the current user here. Completed tasks, those whose proposal
  // isn't loaded, and those whose proposal date has already passed (overdue) are
  // dropped; the rest sort most-urgent first.
  const proposalsById = new Map(myProposals.map((p) => [p.id, p]))
  const myResponsibilityItems = myResponsibilities
    .filter((r) => r.assignedTo === user.uid && !r.completed)
    .map((r) => {
      const proposal = proposalsById.get(r.proposalId)
      if (!proposal) return null
      return { responsibility: r, proposal, urgency: proposalUrgency(proposal.date) }
    })
    .filter(Boolean)
    // Once the proposal date has passed there's nothing left to prepare, so the
    // responsibility no longer surfaces here (no overdue items).
    .filter(({ urgency }) => urgency.level !== 'overdue')
    .sort((a, b) => {
      const order = URGENCY_ORDER[a.urgency.level] - URGENCY_ORDER[b.urgency.level]
      if (order !== 0) return order
      const ad = a.urgency.days ?? Infinity
      const bd = b.urgency.days ?? Infinity
      return ad - bd
    })

  async function handleCreateProposal(e) {
    e.preventDefault()
    if (creating || !newTitle.trim()) return
    // A copy must land in its source group and have a freshly chosen date; a
    // plain new proposal just needs the active group.
    if (copyDraft ? !copyDate : !activeGroupId) return
    // Guard against a past date reaching save (manual entry / picker bypass).
    if (copyDraft && isPastDate(copyDate)) {
      setCreateError('The date can’t be in the past. Choose today or a future date.')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      let proposalId
      if (copyDraft) {
        proposalId = await createProposalFromCopy(copyDraft.groupId, user.uid, {
          ...copyDraft.fields,
          title: newTitle.trim(),
          date: copyDate,
          voting: copyDraft.voting
        })
        // The proposal must exist before its responsibilities (their create rule
        // resolves the parent by id), so this is a separate write, not one batch.
        await addResponsibilitiesForCopy(proposalId, copyDraft.responsibilities)
      } else {
        proposalId = await createProposal(activeGroupId, user.uid, newTitle.trim())
      }
      // Use the creator's name as it appears in this group (override → account).
      const selfName =
        resolveMemberName(activeGroup, user.uid, { email: user.email }) ||
        userProfile.displayName ||
        'Someone'
      await logActivity(
        proposalId,
        'proposal_created',
        `${selfName} created this proposal`
      )
      navigate(`/proposal/${proposalId}`)
    } catch {
      setCreateError('Failed to create proposal. Please try again.')
      setCreating(false)
    }
  }

  function openNewForm() {
    setCopyDraft(null)
    setCopyDate('')
    setNewTitle('')
    setCreateError('')
    setShowNewForm(true)
  }

  function cancelNewForm() {
    setShowNewForm(false)
    setCopyDraft(null)
    setCopyDate('')
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

        {/* My Responsibilities — tasks assigned to the current user, emphasis
            scaled by how soon the proposal date is. Distinct from the per-proposal
            activity feed. */}
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
                  {copyDraft && (
                    <p className={styles.copyNote}>
                      Copying “{copyDraft.sourceTitle || 'proposal'}”. Details,
                      responsibilities, and voting options carry over — pick a new
                      date to continue.
                    </p>
                  )}
                  <input
                    className={styles.newInput}
                    placeholder="Proposal title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    autoFocus
                  />
                  {copyDraft && (
                    <label className={styles.copyDateLabel}>
                      New date (required)
                      <input
                        type="date"
                        className={styles.newInput}
                        value={copyDate}
                        min={todayStr}
                        onChange={(e) => setCopyDate(e.target.value)}
                        required
                      />
                    </label>
                  )}
                  {createError && <p className={styles.errorMsg}>{createError}</p>}
                  <div className={styles.newFormActions}>
                    <button
                      className={styles.newBtn}
                      type="submit"
                      disabled={creating || !newTitle.trim() || (copyDraft && !copyDate)}
                    >
                      {creating
                        ? copyDraft
                          ? 'Copying…'
                          : 'Creating…'
                        : copyDraft
                          ? 'Create copy'
                          : 'Create'}
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
