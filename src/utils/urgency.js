// Urgency is derived purely from a proposal's date (a YYYY-MM-DD string), never
// from when a responsibility was assigned. Day counts are date-only (time of day
// is ignored) so thresholds line up with whole calendar days.
//
// A future reminder feature can reuse this directly: given a responsibility, its
// assigned user, and the proposal date, proposalUrgency(date) yields the same
// level/label the dashboard shows — no scheduling logic is implied here.

export const URGENCY_ORDER = {
  overdue: 0,
  today: 1,
  high: 2,
  medium: 3,
  low: 4,
  none: 5
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const due = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  due.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((due - today) / 86400000)
}

// Returns { level, days, label }. level escalates as the proposal date nears:
//   > 14 days  → low      (more than two weeks out)
//   7–14 days  → medium
//   1–6 days   → high
//   same day   → today    (highest emphasis)
//   in the past→ overdue
//   no date    → none
export function proposalUrgency(dateStr) {
  const days = daysUntil(dateStr)
  if (days === null) return { level: 'none', days: null, label: 'No date set' }
  if (days < 0) {
    const n = Math.abs(days)
    return { level: 'overdue', days, label: n === 1 ? '1 day overdue' : `${n} days overdue` }
  }
  if (days === 0) return { level: 'today', days, label: 'Today' }
  if (days === 1) return { level: 'high', days, label: 'Tomorrow' }
  if (days <= 6) return { level: 'high', days, label: `In ${days} days` }
  if (days <= 14) return { level: 'medium', days, label: `In ${days} days` }
  return { level: 'low', days, label: `In ${days} days` }
}
