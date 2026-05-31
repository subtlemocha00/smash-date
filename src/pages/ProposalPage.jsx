import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import { db } from '../services/firebase/firestore'
import { subscribeToProposal, updateProposal } from '../services/firebase/proposals'
import { addComment, subscribeToComments } from '../services/firebase/comments'
import {
  addResponsibility,
  toggleResponsibility,
  deleteResponsibility,
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
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editFields, setEditFields] = useState({})
  const [saving, setSaving] = useState(false)

  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const [respTitle, setRespTitle] = useState('')
  const [respAssignee, setRespAssignee] = useState('')
  const [respSubmitting, setRespSubmitting] = useState(false)

  useEffect(() => {
    const unsub = subscribeToProposal(id, (p) => {
      if (!p) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setProposal(p)
      setLoading(false)
    })
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
    if (!userProfile?.groupId) return
    async function loadMembers() {
      const groupSnap = await getDoc(doc(db, 'groups', userProfile.groupId))
      if (!groupSnap.exists()) return
      const { memberIds } = groupSnap.data()
      const snaps = await Promise.all(memberIds.map((uid) => getDoc(doc(db, 'users', uid))))
      const map = {}
      snaps.forEach((s) => {
        if (s.exists()) map[s.id] = s.data().displayName || s.data().email
      })
      setMembers(map)
    }
    loadMembers()
  }, [userProfile?.groupId])

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
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setEditFields({})
  }

  async function saveEditing() {
    if (!editFields.title.trim()) return
    setSaving(true)
    try {
      await updateProposal(id, editFields)
      await logActivity(
        id,
        'fields_updated',
        `${userProfile.displayName || 'Someone'} updated the proposal details`
      )
      setEditing(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(newStatus) {
    try {
      await updateProposal(id, { status: newStatus })
      await logActivity(
        id,
        'status_changed',
        `${userProfile.displayName || 'Someone'} changed status to ${STATUS_LABELS[newStatus]}`
      )
    } catch (err) {
      console.error(err)
    }
  }

  async function submitComment(e) {
    e.preventDefault()
    if (!commentText.trim()) return
    setCommentSubmitting(true)
    try {
      await addComment(
        id,
        user.uid,
        userProfile.displayName || user.email,
        commentText.trim()
      )
      setCommentText('')
    } catch (err) {
      console.error(err)
    } finally {
      setCommentSubmitting(false)
    }
  }

  async function submitResponsibility(e) {
    e.preventDefault()
    if (!respTitle.trim() || !respAssignee) return
    setRespSubmitting(true)
    try {
      await addResponsibility(
        id,
        respTitle.trim(),
        respAssignee,
        members[respAssignee] || respAssignee
      )
      setRespTitle('')
      setRespAssignee('')
    } catch (err) {
      console.error(err)
    } finally {
      setRespSubmitting(false)
    }
  }

  if (loading) {
    return <div className={styles.loading}>Loading…</div>
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
            </div>
            <div className={styles.editActions}>
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

          <div className={styles.fields}>
            {editing ? (
              <>
                <FieldInput
                  label="Description"
                  name="description"
                  value={editFields.description}
                  multiline
                  onChange={(v) => setEditFields((f) => ({ ...f, description: v }))}
                />
                <FieldInput
                  label="Date"
                  name="date"
                  type="date"
                  value={editFields.date}
                  onChange={(v) => setEditFields((f) => ({ ...f, date: v }))}
                />
                <FieldInput
                  label="Time"
                  name="time"
                  type="time"
                  value={editFields.time}
                  onChange={(v) => setEditFields((f) => ({ ...f, time: v }))}
                />
                <FieldInput
                  label="Activity"
                  name="activity"
                  value={editFields.activity}
                  onChange={(v) => setEditFields((f) => ({ ...f, activity: v }))}
                />
                <FieldInput
                  label="Restaurant / Location"
                  name="location"
                  value={editFields.location}
                  onChange={(v) => setEditFields((f) => ({ ...f, location: v }))}
                />
                <FieldInput
                  label="Childcare Notes"
                  name="childcareNotes"
                  value={editFields.childcareNotes}
                  onChange={(v) => setEditFields((f) => ({ ...f, childcareNotes: v }))}
                />
                <FieldInput
                  label="Budget"
                  name="budget"
                  value={editFields.budget}
                  onChange={(v) => setEditFields((f) => ({ ...f, budget: v }))}
                />
                <FieldInput
                  label="Notes"
                  name="notes"
                  value={editFields.notes}
                  multiline
                  onChange={(v) => setEditFields((f) => ({ ...f, notes: v }))}
                />
              </>
            ) : (
              <>
                <FieldView label="Description" value={proposal.description} />
                <FieldView label="Date" value={proposal.date} />
                <FieldView label="Time" value={proposal.time} />
                <FieldView label="Activity" value={proposal.activity} />
                <FieldView label="Restaurant / Location" value={proposal.location} />
                <FieldView label="Childcare Notes" value={proposal.childcareNotes} />
                <FieldView label="Budget" value={proposal.budget} />
                <FieldView label="Notes" value={proposal.notes} />
              </>
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
                  type="button"
                >
                  {STATUS_ACTION_LABELS[s] ?? STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Responsibilities */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Responsibilities</h2>
          {responsibilities.length === 0 ? (
            <p className={styles.muted}>No responsibilities yet.</p>
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
                  <span className={styles.respAssignee}>{r.assigneeName}</span>
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
              <option value="">Assign to…</option>
              {Object.entries(members).map(([uid, name]) => (
                <option key={uid} value={uid}>
                  {name}
                </option>
              ))}
            </select>
            <button
              className={styles.addBtn}
              type="submit"
              disabled={respSubmitting || !respTitle.trim() || !respAssignee}
            >
              Add
            </button>
          </form>
        </section>

        {/* Activity feed */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Activity</h2>
          {activity.length === 0 ? (
            <p className={styles.muted}>No activity yet.</p>
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
            <p className={styles.muted}>No comments yet.</p>
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
              Post
            </button>
          </form>
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
