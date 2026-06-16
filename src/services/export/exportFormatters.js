// Shared formatting helpers for all export modules.

export const STATUS_LABELS = {
  draft: 'Draft',
  proposed: 'Proposed',
  changes_requested: 'Changes Requested',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  completed: 'Completed',
  declined: 'Declined'
}

// Formats a proposal date field (YYYY-MM-DD string) for human display.
export function formatProposalDate(dateStr) {
  if (!dateStr) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Formats a proposal time field (HH:MM 24-hour string) for human display.
export function formatProposalTime(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// Formats a Firestore Timestamp for human display (date + time).
export function formatTimestamp(ts) {
  if (!ts?.toDate) return null
  return ts.toDate().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

// Formats today's date for an "Exported:" field.
export function formatExportDate() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}
