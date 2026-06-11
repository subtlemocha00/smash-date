import { useEffect, useRef, useState } from 'react'
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
  isProposalLocked,
  setDecisionDeadline,
  lockProposal,
  reopenProposal,
  acceptProposal,
  revokeAcceptance,
  transitionProposal,
  dismissProposalForUser,
  VOTABLE_FIELDS,
  computeVotingChanges,
  isFieldVotingEnabled,
  isFieldVotingActive,
  getLeaders,
  buildCopiedVoting,
  castVote,
  addFieldOption,
  updateFieldOption,
  removeFieldOption,
  lockFieldToLeader,
  lockProposalVoting
} from '../services/firebase/proposals'
import { addComment, deleteComment, subscribeToComments } from '../services/firebase/comments'
import {
  addResponsibility,
  toggleResponsibility,
  deleteResponsibility,
  updateResponsibility,
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

// Formats a Firestore Timestamp into the local "YYYY-MM-DDTHH:MM" string a
// <input type="datetime-local"> expects. Returns '' when there's no deadline.
function toDatetimeLocal(ts) {
  if (!ts?.toDate) return ''
  const d = ts.toDate()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Pencil glyph for the responsibility Edit control. Inline SVG keeps it crisp
// and themeable via currentColor; the app has no icon dependency.
function PencilIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  )
}

// Six-dot grip glyph marking the drag handle on a reorderable list item.
// Inline SVG, themed via currentColor — consistent with PencilIcon and the
// app's no-icon-dependency approach.
function GripIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

// Compact editor for a responsibility's optional details list. Shared by the
// create form and the inline edit form. `items` is the working array of
// strings; `onChange` receives the next array. Empty items are kept here for
// editing and filtered out by the caller on save.
//
// Items are reorderable by dragging the grip handle. Order is purely the array
// position (no per-item order field) — reordering just emits a permuted array,
// which the caller persists through the normal save path. Drag uses Pointer
// Events so the same code path covers mouse and touch; only the handle disables
// touch scrolling (touch-action: none), so dragging never fires during a normal
// scroll over the rest of the row.
function DetailsListEditor({ items, onChange }) {
  const rowRefs = useRef([])
  const [dragIndex, setDragIndex] = useState(null)

  const handlePointerDown = (i) => (e) => {
    // Ignore non-primary mouse buttons; touch/pen have button -1/0.
    if (e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragIndex(i)
  }

  const handlePointerMove = (e) => {
    if (dragIndex === null) return
    const y = e.clientY
    // Find the row the pointer now sits over by midpoint crossing: the first
    // earlier row whose midpoint we've passed going up, or the last later row
    // whose midpoint we've passed going down.
    let target = dragIndex
    for (let j = 0; j < rowRefs.current.length; j++) {
      const el = rowRefs.current[j]
      if (!el || j === dragIndex) continue
      const rect = el.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (j < dragIndex && y < mid) {
        target = j
        break
      }
      if (j > dragIndex && y > mid) {
        target = j
      }
    }
    if (target !== dragIndex) {
      const next = items.slice()
      const [moved] = next.splice(dragIndex, 1)
      next.splice(target, 0, moved)
      onChange(next)
      setDragIndex(target)
    }
  }

  const endDrag = (e) => {
    if (dragIndex === null) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // capture may already be gone (e.g. pointercancel) — nothing to do.
    }
    setDragIndex(null)
  }

  // Keyboard fallback for accessibility / non-pointer users: move a focused
  // handle up or down with the arrow keys.
  const handleKeyDown = (i) => (e) => {
    const dir = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
    if (!dir) return
    const target = i + dir
    if (target < 0 || target >= items.length) return
    e.preventDefault()
    const next = items.slice()
    const [moved] = next.splice(i, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  const showHandles = items.length > 1

  return (
    <div className={styles.detailsListEditor}>
      {items.map((item, i) => (
        <div
          key={i}
          ref={(el) => {
            rowRefs.current[i] = el
          }}
          className={`${styles.detailsListEditRow} ${dragIndex === i ? styles.detailsListEditRowDragging : ''
            }`}
        >
          {showHandles && (
            <button
              type="button"
              className={styles.detailsDragHandle}
              onPointerDown={handlePointerDown(i)}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={handleKeyDown(i)}
              aria-label={`Reorder "${item || 'item'}" (use arrow keys to move)`}
              title="Drag to reorder"
            >
              <GripIcon />
            </button>
          )}
          <input
            className={styles.detailsListInput}
            value={item}
            placeholder="e.g. sandals"
            onChange={(e) => {
              const next = items.slice()
              next[i] = e.target.value
              onChange(next)
            }}
          />
          <button
            type="button"
            className={styles.detailsItemRemove}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label="Remove item"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.detailsAddItemBtn}
        onClick={() => onChange([...items, ''])}
      >
        + Add item
      </button>
    </div>
  )
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

  // Decision Deadline controls (creator-only). deadlineInput mirrors the stored
  // deadline in <input type="datetime-local"> format.
  const [deadlineInput, setDeadlineInput] = useState('')
  const [deadlineBusy, setDeadlineBusy] = useState(false)
  const [deadlineError, setDeadlineError] = useState('')

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

  // Optional details on the create form (hidden until the user opts in).
  const [respDetailsOpen, setRespDetailsOpen] = useState(false)
  const [respNote, setRespNote] = useState('')
  const [respList, setRespList] = useState([])

  // Which rows have their (read-only) details panel expanded.
  const [expandedResp, setExpandedResp] = useState(() => new Set())

  // Unified responsibility editor: the row being edited plus its working draft
  // (title, assignee, and the optional details note + list).
  const [editingRespId, setEditingRespId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editList, setEditList] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

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

  // Likewise, a manual collaboration lock closes the editor for everyone.
  useEffect(() => {
    if (proposal?.locked === true) setEditing(false)
  }, [proposal?.locked])

  // Keep the deadline input in sync with the stored deadline. Keyed on the
  // millisecond value so it only resets when the saved deadline actually changes
  // (not on every snapshot), preserving in-progress typing.
  const deadlineMillis = proposal?.decisionDeadline?.toMillis?.() ?? null
  useEffect(() => {
    setDeadlineInput(toDatetimeLocal(proposal?.decisionDeadline))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineMillis])

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
      const votingChanges = computeVotingChanges(proposal, editFields, votingToggles, user.uid)
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

  // --- Decision Deadline (creator-only) ------------------------------------
  async function runDeadlineAction(work, activityMsg, failMsg) {
    if (deadlineBusy) return
    setDeadlineBusy(true)
    setDeadlineError('')
    try {
      await work()
      if (activityMsg) await logActivity(id, 'status_changed', activityMsg)
    } catch {
      setDeadlineError(failMsg)
    } finally {
      setDeadlineBusy(false)
    }
  }

  function handleSaveDeadline() {
    const date = deadlineInput ? new Date(deadlineInput) : null
    if (deadlineInput && Number.isNaN(date?.getTime())) {
      setDeadlineError('Enter a valid date and time.')
      return
    }
    runDeadlineAction(
      () => setDecisionDeadline(id, date),
      date ? `${actorName} set a decision deadline` : `${actorName} cleared the decision deadline`,
      'Failed to update the deadline. Please try again.'
    )
  }

  function handleClearDeadline() {
    setDeadlineInput('')
    runDeadlineAction(
      () => setDecisionDeadline(id, null),
      `${actorName} cleared the decision deadline`,
      'Failed to update the deadline. Please try again.'
    )
  }

  function handleLockNow() {
    runDeadlineAction(
      () => lockProposal(id),
      `${actorName} locked collaboration on this proposal`,
      'Failed to lock. Please try again.'
    )
  }

  function handleReopenCollaboration() {
    runDeadlineAction(
      () => reopenProposal(id),
      `${actorName} reopened collaboration`,
      'Failed to reopen. Please try again.'
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

  // Copy this proposal into a new one. Rather than writing a doc now (which would
  // litter Firestore with abandoned copies), we carry the reusable content as a
  // transient draft in router state to the Dashboard's create form, which writes
  // it only when the user picks a new date and confirms. The copy stays in this
  // proposal's group, and the user who confirms becomes its creator. Available to
  // any group member, including on past/locked proposals (recurring plans).
  function handleCopy() {
    navigate('/dashboard', {
      state: {
        copyDraft: {
          sourceTitle: proposal.title || '',
          groupId: proposal.groupId,
          fields: {
            title: proposal.title || '',
            description: proposal.description || '',
            time: proposal.time || '',
            activity: proposal.activity || '',
            location: proposal.location || '',
            childcareNotes: proposal.childcareNotes || '',
            budget: proposal.budget || '',
            notes: proposal.notes || ''
          },
          // Voting options carried over with votes reset; date options dropped.
          voting: buildCopiedVoting(proposal, user.uid),
          // Responsibilities carried over as fresh, incomplete work items.
          responsibilities: responsibilities.map((r) => ({
            title: r.title || '',
            assignedTo: r.assignedTo ?? null,
            assigneeName: r.assigneeName || '',
            detailsNote: r.detailsNote || '',
            detailsList: Array.isArray(r.detailsList) ? r.detailsList : []
          }))
        }
      }
    })
  }

  // Voting handlers read the latest options straight from proposal state (kept
  // current by the realtime listener), so the VotingField only passes ids/values.
  async function handleVote(field, optionId) {
    const options = proposal.voting?.[field]?.options ?? []
    await castVote(id, field, optionId, user.uid, options)
  }

  async function handleAddOption(field, value) {
    const options = proposal.voting?.[field]?.options ?? []
    await addFieldOption(id, field, value, options, user.uid)
  }

  async function handleEditOption(field, optionId, value) {
    const options = proposal.voting?.[field]?.options ?? []
    await updateFieldOption(id, field, optionId, value, options)
  }

  async function handleDeleteOption(field, optionId) {
    const options = proposal.voting?.[field]?.options ?? []
    await removeFieldOption(id, field, optionId, options)
  }

  async function handleLockField(field) {
    const options = proposal.voting?.[field]?.options ?? []
    await lockFieldToLeader(id, field, options)
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
      const note = respNote.trim()
      const list = respList.map((s) => s.trim()).filter(Boolean)
      await addResponsibility(id, respTitle.trim(), respAssignee || null, assigneeName, note, list)
      await logActivity(
        id,
        'responsibility_assigned',
        respAssignee
          ? `${userProfile.displayName || 'Someone'} assigned "${respTitle.trim()}" to ${assigneeName}`
          : `${userProfile.displayName || 'Someone'} added "${respTitle.trim()}"`
      )
      setRespTitle('')
      setRespAssignee('')
      setRespNote('')
      setRespList([])
      setRespDetailsOpen(false)
    } catch {
      setRespError('Failed to add responsibility. Please try again.')
    } finally {
      setRespSubmitting(false)
    }
  }

  function toggleExpanded(respId) {
    setExpandedResp((prev) => {
      const next = new Set(prev)
      if (next.has(respId)) next.delete(respId)
      else next.add(respId)
      return next
    })
  }

  function startEdit(r) {
    setEditingRespId(r.id)
    setEditTitle(r.title || '')
    setEditAssignee(r.assignedTo || '')
    setEditNote(r.detailsNote || '')
    setEditList([...(r.detailsList || [])])
    setEditError('')
  }

  function cancelEdit() {
    setEditingRespId(null)
    setEditError('')
  }

  async function saveRespEdit(r) {
    if (savingEdit) return
    const title = editTitle.trim()
    if (!title) {
      setEditError('Title is required.')
      return
    }
    setSavingEdit(true)
    setEditError('')
    try {
      const newUid = editAssignee || null
      const newName = newUid ? members[newUid] || newUid : ''
      const note = editNote.trim()
      const list = editList.map((s) => s.trim()).filter(Boolean)
      await updateResponsibility(r.id, {
        title,
        assignedTo: newUid,
        assigneeName: newName,
        detailsNote: note,
        detailsList: list
      })
      // Preserve the assignment activity log when the assignee changes.
      if (newUid !== (r.assignedTo || null)) {
        const actMsg = newUid
          ? `${userProfile.displayName || 'Someone'} reassigned "${title}" to ${newName}`
          : `${userProfile.displayName || 'Someone'} unassigned "${title}"`
        await logActivity(id, 'responsibility_assigned', actMsg)
      }
      // Collapse a now-empty details panel so there's nothing dangling to read.
      if (!note && list.length === 0) {
        setExpandedResp((prev) => {
          if (!prev.has(r.id)) return prev
          const next = new Set(prev)
          next.delete(r.id)
          return next
        })
      }
      setEditingRespId(null)
    } catch {
      setEditError('Failed to save changes. Please try again.')
    } finally {
      setSavingEdit(false)
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
  // Decision Deadline lock: collaboration (editing, voting, comments) closes once
  // the creator locks the proposal or its deadline passes. Orthogonal to the
  // status machine — it freezes content without changing status.
  const collaborationLocked = isProposalLocked(proposal)
  // Anything that lets a member change the plan's content is gated on this.
  const editLocked = detailsLocked || collaborationLocked
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
              {editLocked ? (
                <span className={styles.lockedNote}>
                  {completed
                    ? 'Locked · completed'
                    : isConfirmed
                      ? 'Locked · confirmed'
                      : 'Locked · collaboration closed'}
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

          {/* Decision Deadline + collaboration status (visible to everyone). */}
          <div className={styles.collabBar}>
            <span className={styles.collabItem}>
              <span className={styles.collabLabel}>Decision Deadline:</span>{' '}
              <span className={styles.collabValue}>
                {proposal.decisionDeadline ? formatTime(proposal.decisionDeadline) : 'None set'}
              </span>
            </span>
            <span
              className={`${styles.collabStatus} ${collaborationLocked ? styles.collabStatusLocked : styles.collabStatusOpen}`}
            >
              {collaborationLocked ? 'Collaboration Locked' : 'Open for Collaboration'}
            </span>
          </div>
          {collaborationLocked && (
            <p className={styles.collabBanner}>
              Collaboration on this proposal has closed.{' '}
              {isCreator
                ? 'Reopen it from Manage below to make changes.'
                : 'Only the creator may reopen it.'}
            </p>
          )}

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
                    frozen={editLocked}
                    onVote={handleVote}
                    onAddOption={handleAddOption}
                    onEditOption={handleEditOption}
                    onDeleteOption={handleDeleteOption}
                    onLock={handleLockField}
                  />
                ) : (
                  <FieldView key={f.key} label={f.label} value={proposal[f.key]} />
                )
              )}
          </div>
        </section>

        {/* Workflow / status. Hidden once completed — a completed plan is fully
            locked and only offers per-user archive removal (in Manage below) —
            and while collaboration is locked (the creator reopens to resume). */}
        {!completed && !collaborationLocked && (
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
              {responsibilities.map((r) => {
                const note = (r.detailsNote || '').trim()
                const list = (r.detailsList || []).filter((s) => s && s.trim())
                const hasDetails = note || list.length > 0
                const editingThis = editingRespId === r.id
                const expanded = expandedResp.has(r.id)
                // Details is a read-only view control: offer it whenever there's
                // something to read (or to collapse). Adding/changing details is
                // done through the Edit editor, not here.
                const showDetailsToggle = (hasDetails || expanded) && !editingThis
                return (
                  <li key={r.id} className={styles.respItem}>
                    <div className={styles.respItemMain}>
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
                      {showDetailsToggle && (
                        <button
                          type="button"
                          className={styles.detailsToggle}
                          onClick={() => toggleExpanded(r.id)}
                          aria-expanded={expanded}
                        >
                          {expanded ? 'Hide' : 'Details'}
                        </button>
                      )}
                      {/* Assignment is display-only; editing happens via Edit. */}
                      <span className={styles.respAssignee}>
                        {r.assigneeName || 'Unassigned'}
                      </span>
                      {!editLocked && !editingThis && (
                        <button
                          type="button"
                          className={styles.respEditBtn}
                          onClick={() => startEdit(r)}
                          aria-label={`Edit "${r.title}"`}
                          title="Edit responsibility"
                        >
                          <PencilIcon />
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
                    </div>
                    {editingThis ? (
                      <div className={styles.respEditForm}>
                        <label className={styles.detailsFieldLabel}>Title</label>
                        <input
                          className={styles.respEditInput}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="e.g. Book restaurant"
                          autoFocus
                        />
                        <label className={styles.detailsFieldLabel}>Assigned to</label>
                        <select
                          className={styles.respEditSelect}
                          value={editAssignee}
                          onChange={(e) => setEditAssignee(e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {Object.entries(members).map(([uid, name]) => (
                            <option key={uid} value={uid}>
                              {name}
                            </option>
                          ))}
                        </select>
                        <label className={styles.detailsFieldLabel}>Note</label>
                        <textarea
                          className={styles.detailsNoteInput}
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          placeholder="e.g. WHAM-O brand, specifically."
                          rows={2}
                        />
                        <label className={styles.detailsFieldLabel}>Items</label>
                        <DetailsListEditor items={editList} onChange={setEditList} />
                        {editError && <p className={styles.errorMsg}>{editError}</p>}
                        <div className={styles.detailsEditActions}>
                          <button
                            type="button"
                            className={styles.reassignSaveBtn}
                            onClick={() => saveRespEdit(r)}
                            disabled={savingEdit || !editTitle.trim()}
                          >
                            {savingEdit ? '…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className={styles.reassignCancelBtn}
                            onClick={cancelEdit}
                            disabled={savingEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : expanded ? (
                      <div className={styles.respDetails}>
                        {note && (
                          <div className={styles.detailsSection}>
                            <span className={styles.detailsLabel}>Note</span>
                            <p className={styles.detailsNote}>{note}</p>
                          </div>
                        )}
                        {list.length > 0 && (
                          <div className={styles.detailsSection}>
                            <span className={styles.detailsLabel}>Items</span>
                            <ul className={styles.detailsItems}>
                              {list.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {!hasDetails && (
                          <p className={styles.detailsEmpty}>No details yet.</p>
                        )}
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          {!detailsLocked && (
            <>
              <form onSubmit={submitResponsibility} className={styles.respAddForm}>
                <div className={styles.addForm}>
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
                </div>
                <button
                  type="button"
                  className={`${styles.detailsToggle} ${styles.detailsToggleInline}`}
                  onClick={() => setRespDetailsOpen((o) => !o)}
                  aria-expanded={respDetailsOpen}
                >
                  {respDetailsOpen ? 'Hide details' : '+ Add details'}
                </button>
                {respDetailsOpen && (
                  <div className={styles.respDetailsCreate}>
                    <label className={styles.detailsFieldLabel}>Note</label>
                    <textarea
                      className={styles.detailsNoteInput}
                      value={respNote}
                      onChange={(e) => setRespNote(e.target.value)}
                      placeholder="e.g. Pick up some fun shooters for Ted"
                      rows={2}
                    />
                    <label className={styles.detailsFieldLabel}>Items</label>
                    <DetailsListEditor items={respList} onChange={setRespList} />
                  </div>
                )}
              </form>
              {respError && <p className={styles.errorMsg}>{respError}</p>}
            </>
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
                    {c.userId === user.uid && (
                      <button
                        type="button"
                        className={styles.commentDelete}
                        onClick={() => deleteComment(c.id)}
                        aria-label="Delete comment"
                        title="Delete comment"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <p className={styles.commentMsg}>{c.message}</p>
                </li>
              ))}
            </ul>
          )}
          {completed ? (
            <p className={styles.emptyState}>This plan is complete — commenting is closed.</p>
          ) : collaborationLocked ? (
            <p className={styles.emptyState}>
              Collaboration is closed — commenting is locked.
            </p>
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

        {/* Manage. A completed proposal is fully locked: the only action anyone
            has is removing it from their own archive. */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Manage</h2>

          {/* Copy is available to every member regardless of status/lock — it
              creates a fresh proposal and never touches this one. */}
          <div className={styles.manageRow}>
            <button
              className={styles.manageBtn}
              onClick={handleCopy}
              type="button"
            >
              Copy proposal
            </button>
            <span className={styles.manageHint}>
              Reuse this plan for a new date — details, responsibilities, and
              voting options carry over.
            </span>
          </div>

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
              {isCreator && (
                <div className={styles.deadlineControls}>
                  <h3 className={styles.manageSubtitle}>Decision Deadline</h3>
                  <p className={styles.manageHint}>
                    Set when collaboration closes. After it passes — or if you lock it now —
                    the proposal becomes read-only until you reopen it.
                  </p>
                  <div className={styles.manageRow}>
                    <input
                      type="datetime-local"
                      className={styles.input}
                      value={deadlineInput}
                      onChange={(e) => setDeadlineInput(e.target.value)}
                      disabled={deadlineBusy}
                    />
                    <button
                      className={styles.manageBtn}
                      onClick={handleSaveDeadline}
                      disabled={deadlineBusy}
                      type="button"
                    >
                      {deadlineBusy ? 'Saving…' : 'Save deadline'}
                    </button>
                    {proposal.decisionDeadline && (
                      <button
                        className={styles.manageBtn}
                        onClick={handleClearDeadline}
                        disabled={deadlineBusy}
                        type="button"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className={styles.manageRow}>
                    {collaborationLocked ? (
                      <button
                        className={styles.manageBtn}
                        onClick={handleReopenCollaboration}
                        disabled={deadlineBusy}
                        type="button"
                      >
                        {deadlineBusy ? 'Reopening…' : 'Reopen collaboration'}
                      </button>
                    ) : (
                      <button
                        className={styles.manageBtn}
                        onClick={handleLockNow}
                        disabled={deadlineBusy}
                        type="button"
                      >
                        {deadlineBusy ? 'Locking…' : 'Lock collaboration now'}
                      </button>
                    )}
                    <span className={styles.manageHint}>
                      {collaborationLocked
                        ? 'Reopening clears the deadline and resumes collaboration.'
                        : 'Locking closes editing, voting, and comments for everyone.'}
                    </span>
                  </div>
                  {deadlineError && <p className={styles.errorMsg}>{deadlineError}</p>}
                </div>
              )}

              {isCreator && hasActiveVoting && !collaborationLocked && (
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
  onEditOption,
  onDeleteOption,
  onLock
}) {
  const [newOption, setNewOption] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
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
            // The option's author may edit/delete their own suggestion while
            // voting is open (interactive). Legacy options have no createdBy.
            const mine = interactive && o.createdBy === userId
            const isEditing = editingId === o.id

            if (isEditing) {
              return (
                <li key={o.id} className={styles.optionRow}>
                  <input
                    className={styles.optionInput}
                    type={inputType}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className={styles.addBtn}
                    disabled={busy || !editValue.trim()}
                    onClick={() =>
                      run(async () => {
                        await onEditOption(field, o.id, editValue.trim())
                        setEditingId(null)
                      })
                    }
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className={styles.pickBtn}
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </li>
              )
            }

            return (
              <li
                key={o.id}
                className={`${styles.optionRow} ${voted ? styles.optionRowVoted : ''}`}
              >
                <div className={styles.optionRowTop}>
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
                </div>
                <div className={styles.optionRowBottom}>
                  <span className={styles.optionCount}>
                    {count} {count === 1 ? 'vote' : 'votes'}
                  </span>
                  {mine && (
                    <>
                      <button
                        type="button"
                        className={styles.pickBtn}
                        onClick={() => {
                          setEditingId(o.id)
                          setEditValue(o.value)
                          setError('')
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={styles.optionDeleteBtn}
                        onClick={() => run(() => onDeleteOption(field, o.id))}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
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
              <span className={styles.tieNote}>Tied — waiting for more votes.</span>
            ) : null}
          </div>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>
    </div>
  )
}
