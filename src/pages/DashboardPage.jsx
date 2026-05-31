import { useEffect, useState } from 'react'
import { Navigate, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { logOut } from '../services/firebase/auth'
import { db } from '../services/firebase/firestore'
import { createProposal, subscribeToGroupProposals } from '../services/firebase/proposals'
import { logActivity } from '../services/firebase/activityEvents'
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

function formatDate(ts) {
  if (!ts?.toDate) return 'just now'
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardPage() {
  const { user, userProfile } = useAuth()
  const navigate = useNavigate()
  const [group, setGroup] = useState(null)
  const [groupLoading, setGroupLoading] = useState(true)
  const [proposals, setProposals] = useState([])
  const [proposalsLoading, setProposalsLoading] = useState(true)

  const [showNewForm, setShowNewForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!userProfile?.groupId) {
      setGroupLoading(false)
      return
    }
    getDoc(doc(db, 'groups', userProfile.groupId)).then((snap) => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
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

  if (!userProfile) return null
  if (!userProfile.groupId) return <Navigate to="/group-setup" replace />

  async function handleCreateProposal(e) {
    e.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const proposalId = await createProposal(userProfile.groupId, user.uid, newTitle.trim())
      await logActivity(
        proposalId,
        'proposal_created',
        `${userProfile.displayName || 'Someone'} created this proposal`
      )
      navigate(`/proposal/${proposalId}`)
    } catch (err) {
      console.error(err)
      setCreating(false)
    }
  }

  function openNewForm() {
    setNewTitle('')
    setShowNewForm(true)
  }

  function cancelNewForm() {
    setShowNewForm(false)
    setNewTitle('')
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.logo}>Smash Date</span>
        <div className={styles.headerRight}>
          <Link to="/settings" className={styles.navLink}>Settings</Link>
          <button className={styles.signOutBtn} onClick={logOut} type="button">
            Sign Out
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.section}>
          {groupLoading ? (
            <p className={styles.muted}>Loading group…</p>
          ) : group ? (
            <>
              <h2 className={styles.groupName}>{group.name}</h2>
              <p className={styles.muted}>
                Invite code: <strong>{group.inviteCode}</strong>
              </p>
            </>
          ) : (
            <p className={styles.muted}>Group not found.</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Proposals</h2>
            {!showNewForm && (
              <button className={styles.newBtn} onClick={openNewForm} type="button">
                + New Proposal
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
              <div className={styles.newFormActions}>
                <button className={styles.newBtn} type="submit" disabled={creating || !newTitle.trim()}>
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
            <p className={styles.muted}>No proposals yet.</p>
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
