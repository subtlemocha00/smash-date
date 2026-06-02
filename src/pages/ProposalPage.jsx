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
  subscribeToResponsibilities
} from '../services/firebase/responsibilities'
import { logActivity, subscribeToActivity } from '../services/firebase/activityEvents'
import {
  createNotification,
  createNotificationsForGroup
} from '../services/firebase/notifications'
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

const STATUS_TRANSITIONS = {
  draft: ['proposed'],
  proposed: ['changes_requested', 'accepted', 'declined'],
  changes_requested: ['proposed'],
  accepted: ['confirmed', 'declined'],
  confirmed: ['completed'],
  completed: [],
  declined: ['proposed']
}

const STATUS_ACTION_LABELS = {
  proposed: 'Mark as Proposed',
  changes_requested: 'Request Changes',
  accepted: 'Accept',
  confirmed: 'Confirm',
  completed: 'Mark Complete',
  declined: 'Decline'
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
  const [statusChanging, setStatusChanging] = useState('')

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
      await updateProposal(id, { ...editFields, ...votingChanges })
      await logActivity(
        id,
        'fields_updated',
        `${userProfile.displayName || 'Someone'} updated the proposal details`
      )
      if (memberIds.length > 0) {
        await createNotificationsForGroup(
          memberIds,
          user.uid,
          'proposal_updated',
          `${userProfile.displayName || 'Someone'} updated the proposal: ${editFields.title.trim()}`,
          id,
          proposal.groupId
        )
      }
      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(newStatus) {
    if (statusChanging) return
    setStatusError('')
    setStatusChanging(newStatus)
    try {
      await updateProposal(id, { status: newStatus })
      await logActivity(
        id,
        'status_changed',
        `${userProfile.displayName || 'Someone'} changed status to ${STATUS_LABELS[newStatus]}`
      )
      if (memberIds.length > 0) {
        await createNotificationsForGroup(
          memberIds,
          user.uid,
          'status_changed',
          `${userProfile.displayName || 'Someone'} changed ${proposal?.title || 'a proposal'} to ${STATUS_LABELS[newStatus]}`,
          id,
          proposal.groupId
        )
      }
    } catch {
      setStatusError('Failed to update status. Please try again.')
    } finally {
      setStatusChanging('')
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
      if (memberIds.length > 0) {
        await createNotificationsForGroup(
          memberIds,
          user.uid,
          'comment_added',
          `${userProfile.displayName || 'Someone'} commented on: ${proposal?.title || 'a proposal'}`,
          id,
          proposal.groupId
        )
      }
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
      if (respAssignee && respAssignee !== user.uid) {
        await createNotification(
          respAssignee,
          'responsibility_assigned',
          `${userProfile.displayName || 'Someone'} assigned you "${respTitle.trim()}" on ${proposal?.title || 'a proposal'}`,
          id,
          proposal.groupId
        )
      }
      setRespTitle('')
      setRespAssignee('')
    } catch {
      setRespError('Failed to add responsibility. Please try again.')
    } finally {
      setRespSubmitting(false)
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

  const nextStatuses = STATUS_TRANSITIONS[proposal.status] ?? []
  const autoArchived = isAutoArchived(proposal)
  const archivedForMe = isArchivedForUser(proposal, user.uid)
  const manuallyArchived = (proposal.archivedByUserIds ?? []).includes(user.uid)
  const isCreator = proposal.createdBy === user.uid
  const hasActiveVoting = VOTABLE_FIELDS.some((f) => isFieldVotingActive(proposal, f))

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
              <span className={`${styles.statusBadge} ${styles[`status_${proposal.status}`]}`}>
                {STATUS_LABELS[proposal.status] ?? proposal.status}
              </span>
              {archivedForMe && (
                <span className={styles.archivedBadge}>Archived</span>
              )}
            </div>
            <div className={styles.editActions}>
              {saveSuccess && <span className={styles.saveSuccess}>Saved</span>}
              {editing ? (
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

        {/* Status actions */}
        {nextStatuses.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Update Status</h2>
            <div className={styles.statusActions}>
              {nextStatuses.map((s) => (
                <button
                  key={s}
                  className={`${styles.statusBtn} ${styles[`statusBtn_${s}`]}`}
                  onClick={() => changeStatus(s)}
                  disabled={!!statusChanging}
                  type="button"
                >
                  {statusChanging === s
                    ? 'Updating…'
                    : STATUS_ACTION_LABELS[s] ?? STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {statusError && <p className={styles.errorMsg}>{statusError}</p>}
          </section>
        )}

        {/* Responsibilities */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Responsibilities</h2>
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
                    />
                    <span className={r.completed ? styles.respTitleDone : styles.respTitle}>
                      {r.title}
                    </span>
                  </label>
                  <span className={styles.respAssignee}>{r.assigneeName || 'Unassigned'}</span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => deleteResponsibility(r.id)}
                    type="button"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
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
        </section>

        {/* Activity feed */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Activity</h2>
          {activity.length === 0 ? (
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
        </section>

        {/* Manage (voting / archive / delete) */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Manage</h2>

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
                {proposal.status === 'completed'
                  ? 'Auto-archived because it’s completed.'
                  : 'Auto-archived because its date has passed.'}{' '}
                It stays in the Archived view for everyone.
              </p>
            ) : (
              <button
                className={styles.manageBtn}
                onClick={() => toggleArchive(!manuallyArchived)}
                disabled={archiving}
                type="button"
              >
                {archiving
                  ? 'Saving…'
                  : manuallyArchived
                    ? 'Unarchive'
                    : 'Archive'}
              </button>
            )}

            {!autoArchived && (
              <span className={styles.manageHint}>
                Archiving only hides it for you.
              </span>
            )}
          </div>

          {isCreator && (
            <div className={styles.deleteRow}>
              {confirmingDelete ? (
                <>
                  <span className={styles.manageHint}>
                    Delete permanently? This removes all comments, responsibilities, and activity.
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
                {!locked && (
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
                {isCreator && !locked && (
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

        {!locked && (
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

        {isCreator && !locked && (
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
