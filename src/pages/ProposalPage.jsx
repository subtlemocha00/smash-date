import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../services/firebase/firestore'
import {
  subscribeToProposal,
  updateProposal,
  setProposalArchivedForUser,
  deleteProposal,
  isAutoArchived,
  isArchivedForUser,
  isProposalComplete,
  acceptProposal,
  revokeAcceptance,
  transitionProposal,
  dismissProposalForUser,
  VOTABLE_FIELDS,
  computeVotingChanges,
  isFieldVotingEnabled,
  isFieldVotingActive,
  getLeaders,
  castVote,
  addFieldOption,
  lockFieldToLeader,
  resolveFieldTo,
  lockProposalVoting
} from '../services/firebase/proposals'
import { addComment, subscribeToComments } from '../services/firebase/comments'
import {
  addResponsibility,
  toggleResponsibility,
  deleteResponsibility,
  reassignResponsibility,
  subscribeToResponsibilities
} from '../services/firebase/responsibilities'
import { logActivity, subscribeToActivity } from '../services/firebase/activityEvents'
import styles from './ProposalPage.module.css'

const STATUS_LABELS = {
  draft: 'Draft',
  proposed: 'Proposed',
  changes_requested: 'Changes Requested',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  completed: 'Completed',
  declined: 'Declined'
}

// Detail fields in display order. `votable` fields can opt into field-level
// voting; the rest stay plain text. Order/labels match the original layout.
const FIELDS = [
  { key: 'description', label: 'Description', multiline: true, votable: false },
  { key: 'date', label: 'Date', type: 'date', votable: true },
  { key: 'time', label: 'Time', type: 'time', votable: true },
  { key: 'activity', label: 'Activity', votable: true },
  { key: 'location', label: 'Restaurant / Location', votable: true },
  { key: 'childcareNotes', label: 'Childcare Notes', votable: true },
  { key: 'budget', label: 'Budget', votable: true },
  { key: 'notes', label: 'Notes', multiline: true, votable: false }
]

function formatTime(ts) {
  if (!ts?.toDate) return ''
  return ts.toDate().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default function ProposalPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, userProfile } = useAuth()

  const [proposal, setProposal] = useState(null)
  const [comments, setComments] = useState([])
  const [responsibilities, setResponsibilities] = useState([])
  const [activity, setActivity] = useState([])
  const [members, setMembers] = useState({})
  const [memberIds, setMemberIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [listenerError, setListenerError] = useState('')

  const [editing, setEditing] = useState(false)
  const [editFields, setEditFields] = useState({})
  const [votingToggles, setVotingToggles] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [lockingProposal, setLockingProposal] = useState(false)
  const [lockMessage, setLockMessage] = useState('')

  const [statusError, setStatusError] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [confirmingLock, setConfirmingLock] = useState(false)

  const [archiving, setArchiving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [actionError, setActionError] = useState('')

  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [commentError, setCommentError] = useState('')

  const [respTitle, setRespTitle] = useState('')
  const [respAssignee, setRespAssignee] = useState('')
  const [respSubmitting, setRespSubmitting] = useState(false)
  const [respError, setRespError] = useState('')

  const [reassigningRespId, setReassigningRespId] = useState(null)
  const [reassignTo, setReassignTo] = useState('')
  const [reassigning, setReassigning] = useState(false)

  const [activityCollapsed, setActivityCollapsed] = useState(true)

  useEffect(() => {
    const unsub = subscribeToProposal(
      id,
      (p) => {
        if (!p) {
          setNotFound(true)
          setLoading(false)
          return
        }
        setProposal(p)
        setLoading(false)
      },
      () => {
        setListenerError('Failed to load proposal.')
        setLoading(false)
      }
    )
    return unsub
  }, [id])

  useEffect(() => {
    if (!proposal?.id) return
    const unsubComments = subscribeToComments(id, setComments)
    const unsubResp = subscribeToResponsibilities(id, setResponsibilities)
    const unsubActivity = subscribeToActivity(id, setActivity)
    return () => {
      unsubComments()
      unsubResp()
      unsubActivity()
    }
  }, [id, proposal?.id])

  useEffect(() => {
    if (!proposal?.groupId) return
    async function loadMembers() {
      try {
        const groupSnap = await getDoc(doc(db, 'groups', proposal.groupId))
        if (!groupSnap.exists()) return
        const data = groupSnap.data()
        const ids = data.memberIds ?? []
        const names = data.memberNames ?? {}
        setMemberIds(ids)
        // Names are denormalized on the group (we can't read other users' docs).
        const map = {}
        ids.forEach((uid) => {
          map[uid] = names[uid] || 'Group member'
        })
        setMembers(map)
      } catch {
        // Members won't be available for assignment, but page still works
      }
    }
    loadMembers()
  }, [proposal?.groupId])

  // A confirmed (or completed) proposal is locked, so never leave the editor
  // open for one — e.g. if it's confirmed in another tab while a member edits.
  // Also drop any pending "lock anyway?" prompt when the status changes.
  useEffect(() => {
    if (proposal?.status === 'confirmed') setEditing(false)
    setConfirmingLock(false)
  }, [proposal?.status])

  function startEditing() {
    setEditFields({
      title: proposal.title || '',
      description: proposal.description || '',
      date: proposal.date || '',
      time: proposal.time || '',
      activity: proposal.activity || '',
      location: proposal.location || '',
      childcareNotes: proposal.childcareNotes || '',
      budget: proposal.budget || '',
      notes: proposal.notes || ''
    })
    const toggles = {}
    VOTABLE_FIELDS.forEach((f) => {
      toggles[f] = isFieldVotingEnabled(proposal, f)
    })
    setVotingToggles(toggles)
    setSaveSuccess(false)
    setSaveError('')
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setEditFields({})
    setSaveError('')
  }

  async function saveEditing() {
    if (saving || !editFields.title.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const votingChanges = computeVotingChanges(proposal, editFields, votingToggles)
      // Editing invalidates prior approvals, so clear acceptances and pull an
      // already-accepted plan back to `proposed` for everyone to re-approve.
      const acceptanceReset =
        proposal.status === 'accepted'
          ? { acceptedBy: [], status: 'proposed' }
          : { acceptedBy: [] }
      await updateProposal(id, { ...editFields, ...votingChanges, ...acceptanceReset })
      await logActivity(
        id,
        'fields_updated',
        `${userProfile.displayName || 'Someone'} updated the proposal details`
      )
      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Runs a status/acceptance action under a single busy key, then logs it to the
  // proposal's activity feed.
  async function runAction(key, work, activity) {
    if (busyAction) return
    setStatusError('')
    setBusyAction(key)
    try {
      await work()
      if (activity) await logActivity(id, 'status_changed', activity)
    } catch {
      setStatusError('Action failed. Please try again.')
    } finally {
      setBusyAction('')
    }
  }

  const actorName = userProfile.displayName || 'Someone'

  function handlePropose() {
    runAction(
      'propose',
      () => transitionProposal(id, 'proposed', { resetAcceptances: true }),
      `${actorName} proposed this date`
    )
  }

  function handleAccept() {
    const acceptedBy = proposal.acceptedBy ?? []
    runAction(
      'accept',
      () => acceptProposal(id, user.uid, memberIds, acceptedBy),
      `${actorName} accepted the proposal`
    )
  }

  function handleRevokeAcceptance() {
    runAction(
      'revoke',
      () => revokeAcceptance(id, user.uid),
      `${actorName} withdrew their acceptance`
    )
  }

  function handleConfirm() {
    runAction(
      'confirm',
      () => transitionProposal(id, 'confirmed'),
      `${actorName} confirmed the proposal`
    )
  }

  function handleRequestChanges() {
    runAction(
      'changes',
      () => transitionProposal(id, 'changes_requested', { resetAcceptances: true }),
      `${actorName} requested changes`
    )
  }

  function handleDecline() {
    runAction(
      'decline',
      () => transitionProposal(id, 'declined', { resetAcceptances: true }),
      `${actorName} declined the proposal`
    )
  }

  function handleRepropose() {
    runAction(
      'repropose',
      () => transitionProposal(id, 'proposed', { resetAcceptances: true }),
      `${actorName} re-proposed this date`
    )
  }

  function handleReopen() {
    runAction(
      'reopen',
      () => transitionProposal(id, 'proposed', { resetAcceptances: true }),
      `${actorName} reopened the proposal for editing`
    )
  }

  async function handleDismiss() {
    if (busyAction) return
    setStatusError('')
    setBusyAction('dismiss')
    try {
      await dismissProposalForUser(id, user.uid, true)
      navigate('/dashboard')
    } catch {
      setStatusError('Failed to remove from your archive. Please try again.')
      setBusyAction('')
    }
  }

  async function toggleArchive(archived) {
    if (archiving) return
    setArchiving(true)
    setActionError('')
    try {
      await setProposalArchivedForUser(id, user.uid, archived)
    } catch {
      setActionError('Failed to update archive. Please try again.')
    } finally {
      setArchiving(false)
    }
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setActionError('')
    try {
      await deleteProposal(id)
      navigate('/dashboard')
    } catch {
      setActionError('Failed to delete. Please try again.')
      setDeleting(false)
    }
  }

  // Voting handlers read the latest options straight from proposal state (kept
  // current by the realtime listener), so the VotingField only passes ids/values.
  async function handleVote(field, optionId) {
    const options = proposal.voting?.[field]?.options ?? []
    await castVote(id, field, optionId, user.uid, options, memberIds)
  }

  async function handleAddOption(field, value) {
    const options = proposal.voting?.[field]?.options ?? []
    await addFieldOption(id, field, value, options)
  }

  async function handleLockField(field) {
    const options = proposal.voting?.[field]?.options ?? []
    await lockFieldToLeader(id, field, options)
  }

  async function handlePickWinner(field, optionId) {
    const options = proposal.voting?.[field]?.options ?? []
    await resolveFieldTo(id, field, optionId, options)
  }

  async function handleLockProposal() {
    if (lockingProposal) return
    setLockingProposal(true)
    setLockMessage('')
    try {
      const unresolved = await lockProposalVoting(id, proposal)
      if (unresolved.length > 0) {
        const labels = unresolved
          .map((f) => FIELDS.find((x) => x.key === f)?.label ?? f)
          .join(', ')
        setLockMessage(`Pick a winner to finish locking: ${labels}.`)
      } else {
        setLockMessage('All voting fields locked.')
      }
    } catch {
      setLockMessage('Failed to lock voting. Please try again.')
    } finally {
      setLockingProposal(false)
    }
  }

  async function submitComment(e) {
    e.preventDefault()
    if (commentSubmitting || !commentText.trim()) return
    setCommentSubmitting(true)
    setCommentError('')
    try {
      await addComment(id, user.uid, userProfile.displayName || user.email, commentText.trim())
      await logActivity(
        id,
        'comment_added',
        `${userProfile.displayName || 'Someone'} added a comment`
      )
      setCommentText('')
    } catch {
      setCommentError('Failed to post comment. Please try again.')
    } finally {
      setCommentSubmitting(false)
    }
  }

  async function submitResponsibility(e) {
    e.preventDefault()
    if (respSubmitting || !respTitle.trim()) return
    setRespSubmitting(true)
    setRespError('')
    try {
      const assigneeName = respAssignee ? members[respAssignee] || respAssignee : ''
      await addResponsibility(id, respTitle.trim(), respAssignee || null, assigneeName)
      await logActivity(
        id,
        'responsibility_assigned',
        respAssignee
          ? `${userProfile.displayName || 'Someone'} assigned "${respTitle.trim()}" to ${assigneeName}`
          : `${userProfile.displayName || 'Someone'} added "${respTitle.trim()}"`
      )
      setRespTitle('')
      setRespAssignee('')
    } catch {
      setRespError('Failed to add responsibility. Please try again.')
    } finally {
      setRespSubmitting(false)
    }
  }

  async function handleReassign(r) {
    const newUid = reassignTo || null
    const newName = newUid ? (members[newUid] || '') : ''

    if (newUid === (r.assignedTo || null)) {
      setReassigningRespId(null)
      return
    }

    setReassigning(true)
    try {
      await reassignResponsibility(r.id, newUid, newName)
      const actMsg = newUid
        ? `${userProfile.displayName || 'Someone'} reassigned "${r.title}" to ${newName}`
        : `${userProfile.displayName || 'Someone'} unassigned "${r.title}"`
      await logActivity(id, 'responsibility_assigned', actMsg)
      setReassigningRespId(null)
    } catch {
      setReassigningRespId(null)
    } finally {
      setReassigning(false)
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading…</div>
  }

  if (listenerError) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <p className={styles.errorMsg}>{listenerError}</p>
          <Link to="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>
          <p>Proposal not found.</p>
          <Link to="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  const autoArchived = isAutoArchived(proposal)
  const archivedForMe = isArchivedForUser(proposal, user.uid)
  const manuallyArchived = (proposal.archivedByUserIds ?? []).includes(user.uid)
  const isCreator = proposal.createdBy === user.uid
  const hasActiveVoting = VOTABLE_FIELDS.some((f) => isFieldVotingActive(proposal, f))

  // Lifecycle state. Completion is derived from the event date (day after);
  // confirmation is the stored, creator-set lock.
  const completed = isProposalComplete(proposal) && proposal.status !== 'declined'
  const isConfirmed = proposal.status === 'confirmed'
  // Two lock levels: confirming locks details + responsibility delegation;
  // completion additionally locks the responsibility checkboxes (totally locked,
  // archive-removal only).
  const detailsLocked = completed || isConfirmed
  const displayStatus = completed ? 'completed' : proposal.status

  // Per-member acceptance.
  const acceptedBy = proposal.acceptedBy ?? []
  const acceptedCount = memberIds.filter((m) => acceptedBy.includes(m)).length
  const hasAccepted = acceptedBy.includes(user.uid)
  const allAccepted = memberIds.length > 0 && memberIds.every((m) => acceptedBy.includes(m))
  // Accept / decline / request-changes are available while the plan is open for
  // approval (proposed or already unanimously accepted, but not yet confirmed).
  const inApproval = proposal.status === 'proposed' || proposal.status === 'accepted'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => navigate('/dashboard')}
          type="button"
        >
          ← Dashboard
        </button>
      </header>

      <main className={styles.main}>
        {/* Proposal details */}
        <section className={styles.section}>
          <div className={styles.titleRow}>
            <div className={styles.titleLeft}>
              {editing ? (
                <input
                  className={styles.titleInput}
                  value={editFields.title}
                  onChange={(e) => setEditFields((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Proposal title"
                />
              ) : (
                <h1 className={styles.title}>{proposal.title}</h1>
              )}
              <span className={`${styles.statusBadge} ${styles[`status_${displayStatus}`]}`}>
                {STATUS_LABELS[displayStatus] ?? displayStatus}
              </span>
              {archivedForMe && (
                <span className={styles.archivedBadge}>Archived</span>
              )}
            </div>
            <div className={styles.editActions}>
              {saveSuccess && <span className={styles.saveSuccess}>Saved</span>}
              {detailsLocked ? (
                <span className={styles.lockedNote}>
                  {completed ? 'Locked · completed' : 'Locked · confirmed'}
                </span>
              ) : editing ? (
                <>
                  <button
                    className={styles.saveBtn}
                    onClick={saveEditing}
                    disabled={saving || !editFields.title?.trim()}
                    type="button"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button className={styles.cancelBtn} onClick={cancelEditing} type="button">
                    Cancel
                  </button>
                </>
              ) : (
                <button className={styles.editBtn} onClick={startEditing} type="button">
                  Edit
                </button>
              )}
            </div>
          </div>

          {saveError && <p className={styles.errorMsg}>{saveError}</p>}

          <div className={styles.fields}>
            {editing
              ? FIELDS.map((f) => {
                  const votingOn = f.votable && votingToggles[f.key]
                  return (
                    <div key={f.key} className={styles.editField}>
                      {f.votable && isCreator && (
                        <label className={styles.votingToggle}>
                          <input
                            type="checkbox"
                            checked={!!votingToggles[f.key]}
                            onChange={(e) =>
                              setVotingToggles((t) => ({ ...t, [f.key]: e.target.checked }))
                            }
                          />
                          Let members vote on {f.label.toLowerCase()}
                        </label>
                      )}
                      {votingOn ? (
                        <div className={styles.fieldRow}>
                          <span className={styles.fieldLabel}>{f.label}</span>
                          <span className={styles.votingHint}>
                            Members vote to decide this field.
                          </span>
                        </div>
                      ) : (
                        <FieldInput
                          label={f.label}
                          name={f.key}
                          type={f.type}
                          multiline={f.multiline}
                          value={editFields[f.key]}
                          onChange={(v) => setEditFields((s) => ({ ...s, [f.key]: v }))}
                        />
                      )}
                    </div>
                  )
                })
              : FIELDS.map((f) =>
                  f.votable && isFieldVotingEnabled(proposal, f.key) ? (
                    <VotingField
                      key={f.key}
                      label={f.label}
                      field={f.key}
                      inputType={f.type}
                      voting={proposal.voting[f.key]}
                      resolvedValue={proposal[f.key]}
                      userId={user.uid}
                      isCreator={isCreator}
                      frozen={detailsLocked}
                      onVote={handleVote}
                      onAddOption={handleAddOption}
                      onLock={handleLockField}
                      onPick={handlePickWinner}
                    />
                  ) : (
                    <FieldView key={f.key} label={f.label} value={proposal[f.key]} />
                  )
                )}
          </div>
        </section>

        {/* Workflow / status. Hidden once completed — a completed plan is fully
            locked and only offers per-user archive removal (in Manage below). */}
        {!completed && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Update Status</h2>

            {proposal.status === 'draft' &&
              (isCreator ? (
                <div className={styles.statusActions}>
                  <button
                    className={`${styles.statusBtn} ${styles.statusBtn_proposed}`}
                    onClick={handlePropose}
                    disabled={!!busyAction}
                    type="button"
                  >
                    {busyAction === 'propose' ? 'Proposing…' : 'Propose to group'}
                  </button>
                </div>
              ) : (
                <p className={styles.statusHint}>This is still a draft.</p>
              ))}

            {inApproval && (
              <>
                <p className={styles.statusHint}>
                  {acceptedCount} of {memberIds.length} accepted
                  {allAccepted ? ' — everyone’s on board.' : '.'}
                </p>
                <div className={styles.statusActions}>
                  {hasAccepted ? (
                    <button
                      className={styles.statusBtnGhost}
                      onClick={handleRevokeAcceptance}
                      disabled={!!busyAction}
                      type="button"
                    >
                      {busyAction === 'revoke' ? 'Updating…' : '✓ You accepted — undo'}
                    </button>
                  ) : (
                    <button
                      className={`${styles.statusBtn} ${styles.statusBtn_accepted}`}
                      onClick={handleAccept}
                      disabled={!!busyAction}
                      type="button"
                    >
                      {busyAction === 'accept' ? 'Accepting…' : 'Accept'}
                    </button>
                  )}

                  {/* The creator can confirm at any point. If acceptances are
                      still missing, clicking opens an inline confirmation first
                      so the plan isn't held up by members who haven't responded. */}
                  {isCreator && !confirmingLock && (
                    <button
                      className={`${styles.statusBtn} ${styles.statusBtn_confirmed}`}
                      onClick={() => (allAccepted ? handleConfirm() : setConfirmingLock(true))}
                      disabled={!!busyAction}
                      type="button"
                    >
                      {busyAction === 'confirm' ? 'Confirming…' : 'Confirm & Lock'}
                    </button>
                  )}

                  <button
                    className={styles.statusBtnGhost}
                    onClick={handleRequestChanges}
                    disabled={!!busyAction}
                    type="button"
                  >
                    {busyAction === 'changes' ? 'Updating…' : 'Request Changes'}
                  </button>
                  <button
                    className={`${styles.statusBtn} ${styles.statusBtn_declined}`}
                    onClick={handleDecline}
                    disabled={!!busyAction}
                    type="button"
                  >
                    {busyAction === 'decline' ? 'Updating…' : 'Decline'}
                  </button>
                </div>

                {isCreator && confirmingLock && (
                  <div className={styles.confirmLockRow}>
                    <span className={styles.statusHint}>
                      Only {acceptedCount} of {memberIds.length}{' '}
                      {acceptedCount === 1 ? 'member has' : 'members have'} accepted. Confirm and
                      lock the plan in for everyone anyway?
                    </span>
                    <div className={styles.deleteActions}>
                      <button
                        className={`${styles.statusBtn} ${styles.statusBtn_confirmed}`}
                        onClick={handleConfirm}
                        disabled={!!busyAction}
                        type="button"
                      >
                        {busyAction === 'confirm' ? 'Confirming…' : 'Lock anyway'}
                      </button>
                      <button
                        className={styles.cancelBtn}
                        onClick={() => setConfirmingLock(false)}
                        disabled={!!busyAction}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {allAccepted && !isCreator && (
                  <p className={styles.statusHint}>Waiting for the creator to confirm.</p>
                )}
              </>
            )}

            {proposal.status === 'changes_requested' && (
              <>
                <p className={styles.statusHint}>
                  Changes were requested — the creator will revise and re-propose.
                </p>
                {isCreator && (
                  <div className={styles.statusActions}>
                    <button
                      className={`${styles.statusBtn} ${styles.statusBtn_proposed}`}
                      onClick={handleRepropose}
                      disabled={!!busyAction}
                      type="button"
                    >
                      {busyAction === 'repropose' ? 'Re-proposing…' : 'Re-propose'}
                    </button>
                  </div>
                )}
              </>
            )}

            {isConfirmed && (
              <>
                <p className={styles.statusHint}>
                  Confirmed and locked in{proposal.date ? ` for ${proposal.date}` : ''}. It will
                  complete automatically the day after.
                </p>
                {isCreator && (
                  <div className={styles.statusActions}>
                    <button
                      className={styles.statusBtnGhost}
                      onClick={handleReopen}
                      disabled={!!busyAction}
                      type="button"
                    >
                      {busyAction === 'reopen' ? 'Reopening…' : 'Reopen for Editing'}
                    </button>
                  </div>
                )}
              </>
            )}

            {proposal.status === 'declined' && (
              <>
                <p className={styles.statusHint}>This proposal was declined.</p>
                {isCreator && (
                  <div className={styles.statusActions}>
                    <button
                      className={`${styles.statusBtn} ${styles.statusBtn_proposed}`}
                      onClick={handleRepropose}
                      disabled={!!busyAction}
                      type="button"
                    >
                      {busyAction === 'repropose' ? 'Re-proposing…' : 'Re-propose'}
                    </button>
                  </div>
                )}
              </>
            )}

            {statusError && <p className={styles.errorMsg}>{statusError}</p>}
          </section>
        )}

        {/* Responsibilities */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Responsibilities</h2>
            {detailsLocked && (
              <span className={styles.lockedNote}>
                {completed ? 'Locked · completed' : 'Locked · confirmed'}
              </span>
            )}
          </div>
          {responsibilities.length === 0 ? (
            <p className={styles.emptyState}>No responsibilities assigned.</p>
          ) : (
            <ul className={styles.respList}>
              {responsibilities.map((r) => (
                <li key={r.id} className={styles.respItem}>
                  <label className={styles.respLabel}>
                    <input
                      type="checkbox"
                      checked={r.completed}
                      onChange={() => toggleResponsibility(r.id, !r.completed)}
                      className={styles.respCheck}
                      disabled={completed}
                    />
                    <span className={r.completed ? styles.respTitleDone : styles.respTitle}>
                      {r.title}
                    </span>
                  </label>
                  {detailsLocked ? (
                    <span className={styles.respAssignee}>
                      {r.assigneeName || 'Unassigned'}
                    </span>
                  ) : reassigningRespId === r.id ? (
                    <div className={styles.reassignRow}>
                      <select
                        className={styles.reassignSelect}
                        value={reassignTo}
                        onChange={(e) => setReassignTo(e.target.value)}
                        autoFocus
                      >
                        <option value="">Unassigned</option>
                        {Object.entries(members).map(([uid, name]) => (
                          <option key={uid} value={uid}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <button
                        className={styles.reassignSaveBtn}
                        type="button"
                        onClick={() => handleReassign(r)}
                        disabled={reassigning}
                      >
                        {reassigning ? '…' : 'Save'}
                      </button>
                      <button
                        className={styles.reassignCancelBtn}
                        type="button"
                        onClick={() => setReassigningRespId(null)}
                        disabled={reassigning}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className={styles.respAssigneeBtn}
                      type="button"
                      title="Click to reassign"
                      onClick={() => {
                        setReassigningRespId(r.id)
                        setReassignTo(r.assignedTo || '')
                      }}
                    >
                      {r.assigneeName || 'Unassigned'}
                    </button>
                  )}
                  {!detailsLocked && (
                    <button
                      className={styles.removeBtn}
                      onClick={() => deleteResponsibility(r.id)}
                      type="button"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!detailsLocked && (
            <>
              <form onSubmit={submitResponsibility} className={styles.addForm}>
                <input
                  className={styles.input}
                  placeholder="e.g. Book restaurant"
                  value={respTitle}
                  onChange={(e) => setRespTitle(e.target.value)}
                />
                <select
                  className={styles.select}
                  value={respAssignee}
                  onChange={(e) => setRespAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {Object.entries(members).map(([uid, name]) => (
                    <option key={uid} value={uid}>
                      {name}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.addBtn}
                  type="submit"
                  disabled={respSubmitting || !respTitle.trim()}
                >
                  {respSubmitting ? 'Adding…' : 'Add'}
                </button>
              </form>
              {respError && <p className={styles.errorMsg}>{respError}</p>}
            </>
          )}
        </section>

        {/* Activity feed */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <button
              className={styles.collapseToggle}
              onClick={() => setActivityCollapsed((c) => !c)}
              aria-expanded={!activityCollapsed}
              type="button"
            >
              <span
                className={`${styles.collapseChevron} ${activityCollapsed ? styles.collapseChevronClosed : ''}`}
                aria-hidden="true"
              />
              <span className={styles.sectionTitle}>Activity</span>
            </button>
          </div>
          {!activityCollapsed && (
            activity.length === 0 ? (
              <p className={styles.emptyState}>No activity yet.</p>
            ) : (
              <ul className={styles.activityList}>
                {activity.map((e) => (
                  <li key={e.id} className={styles.activityItem}>
                    <span className={styles.activityDesc}>{e.description}</span>
                    <span className={styles.activityTime}>{formatTime(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>

        {/* Comments */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Comments</h2>
          {comments.length === 0 ? (
            <p className={styles.emptyState}>No comments yet.</p>
          ) : (
            <ul className={styles.commentList}>
              {comments.map((c) => (
                <li key={c.id} className={styles.comment}>
                  <div className={styles.commentMeta}>
                    <span className={styles.commentAuthor}>{c.displayName}</span>
                    <span className={styles.commentTime}>{formatTime(c.createdAt)}</span>
                  </div>
                  <p className={styles.commentMsg}>{c.message}</p>
                </li>
              ))}
            </ul>
          )}
          {completed ? (
            <p className={styles.emptyState}>This plan is complete — commenting is closed.</p>
          ) : (
            <>
              <form onSubmit={submitComment} className={styles.commentForm}>
                <input
                  className={styles.input}
                  placeholder="Add a comment…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button
                  className={styles.addBtn}
                  type="submit"
                  disabled={commentSubmitting || !commentText.trim()}
                >
                  {commentSubmitting ? 'Posting…' : 'Post'}
                </button>
              </form>
              {commentError && <p className={styles.errorMsg}>{commentError}</p>}
            </>
          )}
        </section>

        {/* Manage. A completed proposal is fully locked: the only action anyone
            has is removing it from their own archive. */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Manage</h2>

          {completed ? (
            <>
              <p className={styles.manageNote}>This plan is complete and locked.</p>
              <div className={styles.manageRow}>
                <button
                  className={styles.manageBtn}
                  onClick={handleDismiss}
                  disabled={busyAction === 'dismiss'}
                  type="button"
                >
                  {busyAction === 'dismiss' ? 'Removing…' : 'Remove from my archive'}
                </button>
                <span className={styles.manageHint}>
                  Removes it from your archive only — everyone else keeps theirs.
                </span>
              </div>
              {statusError && <p className={styles.errorMsg}>{statusError}</p>}
            </>
          ) : (
            <>
              {isCreator && hasActiveVoting && (
                <div className={styles.manageRow}>
                  <button
                    className={styles.manageBtn}
                    onClick={handleLockProposal}
                    disabled={lockingProposal}
                    type="button"
                  >
                    {lockingProposal ? 'Locking…' : 'Finalize voting (lock all fields)'}
                  </button>
                  <span className={styles.manageHint}>
                    Locks each field to its winning option.
                  </span>
                </div>
              )}
              {lockMessage && <p className={styles.manageNote}>{lockMessage}</p>}

              <div className={styles.manageRow}>
                {autoArchived ? (
                  <p className={styles.manageNote}>
                    Auto-archived because the event date has passed. It stays in the Archived
                    view for everyone.
                  </p>
                ) : (
                  <button
                    className={styles.manageBtn}
                    onClick={() => toggleArchive(!manuallyArchived)}
                    disabled={archiving}
                    type="button"
                  >
                    {archiving ? 'Saving…' : manuallyArchived ? 'Unarchive' : 'Archive'}
                  </button>
                )}

                {!autoArchived && (
                  <span className={styles.manageHint}>Archiving only hides it for you.</span>
                )}
              </div>

              {isCreator && (
                <div className={styles.deleteRow}>
                  {confirmingDelete ? (
                    <>
                      <span className={styles.manageHint}>
                        Delete permanently? This removes all comments, responsibilities, and
                        activity.
                      </span>
                      <div className={styles.deleteActions}>
                        <button
                          className={styles.deleteConfirmBtn}
                          onClick={handleDelete}
                          disabled={deleting}
                          type="button"
                        >
                          {deleting ? 'Deleting…' : 'Delete permanently'}
                        </button>
                        <button
                          className={styles.cancelBtn}
                          onClick={() => setConfirmingDelete(false)}
                          disabled={deleting}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      className={styles.deleteBtn}
                      onClick={() => setConfirmingDelete(true)}
                      type="button"
                    >
                      Delete proposal
                    </button>
                  )}
                </div>
              )}

              {actionError && <p className={styles.errorMsg}>{actionError}</p>}
            </>
          )}
        </section>
      </main>
    </div>
  )
}

function FieldView({ label, value }) {
  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={value ? styles.fieldValue : styles.fieldEmpty}>{value || '—'}</span>
    </div>
  )
}

function FieldInput({ label, name, value, onChange, type = 'text', multiline = false }) {
  return (
    <div className={styles.fieldRow}>
      <label className={styles.fieldLabel} htmlFor={name}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={name}
          className={styles.textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          id={name}
          className={styles.fieldInput}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

function VotingField({
  label,
  field,
  inputType = 'text',
  voting,
  resolvedValue,
  userId,
  isCreator,
  frozen = false,
  onVote,
  onAddOption,
  onLock,
  onPick
}) {
  const [newOption, setNewOption] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const options = voting.options ?? []
  const locked = !!voting.votingLocked
  // `frozen` (proposal completed) freezes voting without marking the field
  // resolved: options/votes stay visible read-only, but no changes are allowed.
  const interactive = !locked && !frozen
  const leaders = getLeaders(options)
  const uniqueLeader = leaders.length === 1 ? leaders[0] : null

  async function run(action) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch {
      setError('Action failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.fieldRow}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.votingBox}>
        {locked ? (
          <div className={styles.votingResolved}>
            <span className={resolvedValue ? styles.fieldValue : styles.fieldEmpty}>
              {resolvedValue || '—'}
            </span>
            <span className={styles.lockedBadge}>Locked</span>
          </div>
        ) : frozen ? (
          <span className={styles.votingHint}>Voting closed — proposal completed.</span>
        ) : (
          <span className={styles.votingHint}>Vote to decide this field.</span>
        )}

        <ul className={styles.optionList}>
          {options.length === 0 && (
            <li className={styles.fieldEmpty}>No options yet — add one below.</li>
          )}
          {options.map((o) => {
            const voted = (o.votes ?? []).includes(userId)
            const count = (o.votes ?? []).length
            return (
              <li key={o.id} className={styles.optionRow}>
                {interactive && (
                  <button
                    type="button"
                    className={`${styles.voteBtn} ${voted ? styles.voteBtnActive : ''}`}
                    onClick={() => run(() => onVote(field, o.id))}
                    disabled={busy}
                  >
                    {voted ? '✓ Voted' : 'Vote'}
                  </button>
                )}
                <span className={styles.optionValue}>{o.value}</span>
                <span className={styles.optionCount}>
                  {count} {count === 1 ? 'vote' : 'votes'}
                </span>
                {isCreator && interactive && (
                  <button
                    type="button"
                    className={styles.pickBtn}
                    onClick={() => run(() => onPick(field, o.id))}
                    disabled={busy}
                  >
                    Pick winner
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {interactive && (
          <form
            className={styles.optionAddForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (!newOption.trim()) return
              run(async () => {
                await onAddOption(field, newOption.trim())
                setNewOption('')
              })
            }}
          >
            <input
              className={styles.optionInput}
              type={inputType}
              placeholder={inputType === 'text' ? `Add a ${label.toLowerCase()} option` : undefined}
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              disabled={busy}
            />
            <button className={styles.addBtn} type="submit" disabled={busy || !newOption.trim()}>
              Add
            </button>
          </form>
        )}

        {isCreator && interactive && (
          <div className={styles.creatorControls}>
            {uniqueLeader ? (
              <button
                type="button"
                className={styles.lockBtn}
                onClick={() => run(() => onLock(field))}
                disabled={busy}
              >
                Lock field (winner: {uniqueLeader.value})
              </button>
            ) : leaders.length > 1 ? (
              <span className={styles.tieNote}>Tie — use “Pick winner” to break it.</span>
            ) : options.length > 0 ? (
              <span className={styles.tieNote}>No votes yet — “Pick winner” to set manually.</span>
            ) : null}
          </div>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>
    </div>
  )
}
