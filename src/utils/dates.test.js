import { describe, it, expect } from 'vitest'
import { todayDateString, isPastDate } from './dates'

// Local YYYY-MM-DD for `now` plus an offset in days — mirrors how proposal dates
// are written, in the local timezone.
function localDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

describe('todayDateString', () => {
  it('returns today as a local YYYY-MM-DD string', () => {
    expect(todayDateString()).toBe(localDate(0))
  })
})

describe('isPastDate', () => {
  it('treats today as not past (same-day plans are allowed)', () => {
    expect(isPastDate(localDate(0))).toBe(false)
  })

  it('treats future dates as not past', () => {
    expect(isPastDate(localDate(1))).toBe(false)
    expect(isPastDate(localDate(30))).toBe(false)
  })

  it('treats yesterday and earlier as past', () => {
    expect(isPastDate(localDate(-1))).toBe(true)
    expect(isPastDate(localDate(-365))).toBe(true)
  })

  it('does not flag empty or invalid dates (emptiness handled elsewhere)', () => {
    expect(isPastDate('')).toBe(false)
    expect(isPastDate(null)).toBe(false)
    expect(isPastDate(undefined)).toBe(false)
    expect(isPastDate('not-a-date')).toBe(false)
  })
})
