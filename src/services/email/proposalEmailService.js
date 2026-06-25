// Centralized email notifications for proposal events.
//
// Delivery mechanism: the Firebase "Trigger Email from Firestore" extension
// (connected to SendGrid). We never talk to SendGrid directly — we simply write
// a document to the `mail` collection and the extension sends it. No backend,
// no Cloud Functions, no second provider.
//
// Recipients are addressed by UID via the extension's `toUids` field rather than
// raw email addresses: the Firestore rules forbid the browser from reading other
// members' emails (a user may read only their own users/{uid} doc), and the
// extension resolves each UID's email server-side from its configured Users
// collection. This also keeps members' addresses private from one another.
//
// REQUIRED EXTENSION CONFIG: the Trigger Email extension must have its "Users
// collection" parameter set to `users` (the app's existing user docs, keyed by
// uid, each with an `email` field). Without it, `toUids` cannot be resolved and
// no mail is sent. See the README.
//
// One document is written per recipient (single-element `toUids`) so each email
// is independent and addresses are never disclosed across recipients.

import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/firestore'
import { resolveMemberName } from '../../utils/memberNames'

const MAIL_COLLECTION = 'mail'

export const PROPOSAL_EVENTS = {
  CREATED: 'proposal_created',
  PROPOSED: 'proposal_proposed',
  REPROPOSED: 'proposal_reproposed',
  LOCKED: 'proposal_locked',
  CHANGES_REQUESTED: 'changes_requested'
}

// Proposal detail fields shown in the locked email — the planning info only.
// Responsibilities, comments, and activity are deliberately excluded. Labels
// match the proposal editor (see FIELDS in ProposalPage).
const DETAIL_FIELDS = [
  { key: 'description', label: 'Description' },
  { key: 'date', label: 'Date', format: (v) => formatProposalDate(v) },
  { key: 'time', label: 'Time' },
  { key: 'activity', label: 'Activity' },
  { key: 'location', label: 'Location' },
  { key: 'childcareNotes', label: 'Childcare Notes' },
  { key: 'budget', label: 'Budget' },
  { key: 'notes', label: 'Notes' }
]

// "Label: value" lines for every non-empty detail field (in editor order).
function buildDetailLines(proposal) {
  const lines = []
  for (const field of DETAIL_FIELDS) {
    const raw = proposal?.[field.key]
    const value = field.format ? field.format(raw) : typeof raw === 'string' ? raw.trim() : raw
    if (value) lines.push(`${field.label}: ${value}`)
  }
  return lines
}

// Active members of the group, minus the user who triggered the event. Removed
// members are simply absent from memberIds, so they're never included.
export function buildRecipientUids(group, actorUid) {
  const ids = group?.memberIds ?? []
  return ids.filter((uid) => uid && uid !== actorUid)
}

// 'YYYY-MM-DD' → 'August 14, 2027'. Returns null for missing/invalid dates so
// the date line can be omitted.
function formatProposalDate(date) {
  if (!date) return null
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

// A line is either a plain string, or a linked line:
//   { text, linkLabel, href } — the first occurrence of `linkLabel` within
//   `text` becomes an anchor in the HTML body; the text body keeps the sentence
//   and adds the raw URL on its own line (so plain-text clients get the link).
function lineToText(line) {
  if (typeof line === 'string') return [line]
  return line.href ? [line.text, line.href] : [line.text]
}

function lineToHtml(line) {
  if (typeof line === 'string') {
    return `<p style="margin:0 0 8px">${escapeHtml(line)}</p>`
  }
  const escapedText = escapeHtml(line.text)
  const escapedLabel = escapeHtml(line.linkLabel)
  const anchor = `<a href="${escapeHtml(line.href)}" style="color:#bced09;font-weight:600">${escapedLabel}</a>`
  return `<p style="margin:0 0 8px">${escapedText.replace(escapedLabel, anchor)}</p>`
}

// Renders a list of lines into both a text body and a lightweight HTML body.
// Empty strings act as blank lines / paragraph breaks.
function render(subject, lines) {
  const text = lines.flatMap(lineToText).join('\n')
  const paragraphs = lines
    .filter((line) => line !== '')
    .map(lineToHtml)
    .join('')
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5">${paragraphs}</div>`
  return { subject, text, html }
}

// Builds the subject + bodies for an event. Pure and content-only (no recipient
// or Firestore concerns) so it's easy to unit-test and reuse.
export function buildProposalEmailContent(event, { group, proposal, actorName, proposalUrl } = {}) {
  const title = (proposal?.title || '').trim() || 'Untitled proposal'
  const groupName = (group?.name || '').trim() || 'your group'
  const actor = (actorName || '').trim() || 'A group member'
  const dateLabel = formatProposalDate(proposal?.date)

  switch (event) {
    case PROPOSAL_EVENTS.CREATED: {
      const lines = [
        `A new proposal has been created in ${groupName}.`,
        '',
        'Proposal:',
        title,
        '',
        'Created By:',
        actor
      ]
      if (dateLabel) lines.push('', 'Date:', dateLabel)
      lines.push('', {
        text: 'Open Smash Date to review the proposal.',
        linkLabel: 'Smash Date',
        href: proposalUrl
      })
      return render(`New Proposal Created: ${title}`, lines)
    }
    case PROPOSAL_EVENTS.PROPOSED: {
      const lines = [
        `A date has been proposed in ${groupName}.`,
        '',
        'Proposal:',
        title,
        '',
        'Proposed By:',
        actor
      ]
      if (dateLabel) lines.push('', 'Date:', dateLabel)
      lines.push('', {
        text: 'Open Smash Date to review and respond.',
        linkLabel: 'Smash Date',
        href: proposalUrl
      })
      return render(`Date Proposed: ${title}`, lines)
    }
    case PROPOSAL_EVENTS.REPROPOSED: {
      const lines = [
        `A proposal has been re-proposed in ${groupName}.`,
        '',
        'Proposal:',
        title,
        '',
        'Re-proposed By:',
        actor
      ]
      if (dateLabel) lines.push('', 'Date:', dateLabel)
      lines.push('', {
        text: 'Open Smash Date to review and respond.',
        linkLabel: 'Smash Date',
        href: proposalUrl
      })
      return render(`Date Re-proposed: ${title}`, lines)
    }
    case PROPOSAL_EVENTS.LOCKED: {
      const lines = [
        `Collaboration has been locked for a proposal in ${groupName}:`,
        '',
        title,
        '',
        'Locked By:',
        actor,
        '',
        'The proposal is now finalized and can no longer be edited unless reopened.'
      ]
      // Include the proposal's planning details (only) — no responsibilities,
      // comments, or activity.
      const detailLines = buildDetailLines(proposal)
      if (detailLines.length > 0) lines.push('', 'Proposal Details:', ...detailLines)
      lines.push('', {
        text: 'Open Smash Date to view the final plan.',
        linkLabel: 'Smash Date',
        href: proposalUrl
      })
      return render(`Proposal Locked: ${title}`, lines)
    }
    case PROPOSAL_EVENTS.CHANGES_REQUESTED: {
      const lines = [
        `Changes have been requested for a proposal in ${groupName}:`,
        '',
        title,
        '',
        'Requested By:',
        actor,
        '',
        {
          text: 'Open Smash Date to review feedback and continue collaboration.',
          linkLabel: 'Smash Date',
          href: proposalUrl
        }
      ]
      return render(`Changes Requested: ${title}`, lines)
    }
    default:
      return null
  }
}

// Resolves the acting user's name using the same group-aware logic as the rest
// of the app (group override → account name → email prefix), with a final
// fallback. `actorName` may be passed in pre-resolved by the caller.
function resolveActorName(group, actorUid, actorName, actorEmail) {
  if (actorName && actorName.trim()) return actorName.trim()
  return resolveMemberName(group, actorUid, { email: actorEmail }) || 'A group member'
}

// The app's public origin (e.g. https://smash-date.vercel.app), read from the
// browser at send time. Empty in non-browser contexts (callers may override).
function defaultBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

// Deep link to a proposal. The /proposal/:id route is auth-guarded, so a
// logged-out recipient who clicks it is redirected to the login page.
function buildProposalUrl(baseUrl, proposalId) {
  const origin = (baseUrl ?? defaultBaseUrl()).replace(/\/$/, '')
  return proposalId ? `${origin}/proposal/${proposalId}` : origin
}

// Pure: the array of `mail` documents to write (one per recipient). Empty when
// there are no recipients or the event is unknown. The `toUids`/`message` fields
// are read by the extension; `groupId`/`createdBy`/`event` are extra metadata
// (ignored by the extension) used by the Firestore security rules and for
// debugging.
export function buildProposalMailDocuments(
  event,
  { group, proposal, actorUid, actorName, actorEmail, baseUrl } = {}
) {
  const recipients = buildRecipientUids(group, actorUid)
  if (recipients.length === 0) return []
  const content = buildProposalEmailContent(event, {
    group,
    proposal,
    actorName: resolveActorName(group, actorUid, actorName, actorEmail),
    proposalUrl: buildProposalUrl(baseUrl, proposal?.id)
  })
  if (!content) return []

  return recipients.map((uid) => ({
    toUids: [uid],
    message: { subject: content.subject, text: content.text, html: content.html },
    groupId: group?.id,
    proposalId: proposal?.id,
    createdBy: actorUid,
    event
  }))
}

// Writes the mail documents for an event. Best-effort by contract: never throws
// and never blocks the proposal action — a failure is logged and the proposal
// workflow continues unaffected. Returns the number of emails queued.
export async function sendProposalEventEmail(event, args) {
  try {
    const docs = buildProposalMailDocuments(event, args)
    await Promise.all(
      docs.map((d) => addDoc(collection(db, MAIL_COLLECTION), { ...d, createdAt: serverTimestamp() }))
    )
    return docs.length
  } catch (err) {
    console.error(`Failed to queue "${event}" notification email:`, err)
    return 0
  }
}

export const sendProposalCreatedEmail = (args) => sendProposalEventEmail(PROPOSAL_EVENTS.CREATED, args)
export const sendProposalProposedEmail = (args) =>
  sendProposalEventEmail(PROPOSAL_EVENTS.PROPOSED, args)
export const sendProposalReproposedEmail = (args) =>
  sendProposalEventEmail(PROPOSAL_EVENTS.REPROPOSED, args)
export const sendProposalLockedEmail = (args) => sendProposalEventEmail(PROPOSAL_EVENTS.LOCKED, args)
export const sendChangesRequestedEmail = (args) =>
  sendProposalEventEmail(PROPOSAL_EVENTS.CHANGES_REQUESTED, args)
