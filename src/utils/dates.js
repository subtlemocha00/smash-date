// Shared date helpers for proposal date selection. Proposal dates are plain
// YYYY-MM-DD strings (never Firestore timestamps), interpreted in the user's
// local timezone — the same approach urgency.js uses, so "today" always means
// the user's local today and a same-day plan is never treated as past.

// Today as a local YYYY-MM-DD string. Use as the `min` for proposal date inputs.
// Built from local components (not toISOString, which is UTC and can roll over
// to the wrong day near midnight).
export function todayDateString() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// True when `dateStr` is a valid date strictly before the user's local today.
// Empty/invalid strings return false — emptiness is handled separately (the date
// is optional on edit, and required-but-checked elsewhere on copy), and this
// guard only concerns rejecting *past* dates.
export function isPastDate(dateStr) {
  if (!dateStr) return false
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}
