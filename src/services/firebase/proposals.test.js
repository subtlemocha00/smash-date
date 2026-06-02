import { describe, it, expect } from 'vitest'
import { isProposalPast, isAutoArchived, isArchivedForUser } from './proposals'

// Helpers to build date strings relative to now, in the same YYYY-MM-DD / HH:MM
// shape the proposal editor writes.
function dateStr(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

describe('isProposalPast', () => {
  it('is false when there is no date', () => {
    expect(isProposalPast({ date: '', time: '' })).toBe(false)
    expect(isProposalPast({})).toBe(false)
    expect(isProposalPast(null)).toBe(false)
  })

  it('is true for a date in the past', () => {
    expect(isProposalPast({ date: dateStr(-2), time: '18:00' })).toBe(true)
  })

  it('is false for a date in the future', () => {
    expect(isProposalPast({ date: dateStr(2), time: '18:00' })).toBe(false)
  })

  it('treats a missing time as end-of-day so today stays active', () => {
    expect(isProposalPast({ date: dateStr(0), time: '' })).toBe(false)
  })

  it('is false for an unparseable date', () => {
    expect(isProposalPast({ date: 'not-a-date', time: '' })).toBe(false)
  })
})

describe('isAutoArchived', () => {
  it('archives completed proposals regardless of date', () => {
    expect(isAutoArchived({ status: 'completed', date: dateStr(5) })).toBe(true)
  })

  it('archives proposals whose date has passed', () => {
    expect(isAutoArchived({ status: 'confirmed', date: dateStr(-1), time: '12:00' })).toBe(true)
  })

  it('does not archive active future proposals', () => {
    expect(isAutoArchived({ status: 'proposed', date: dateStr(3) })).toBe(false)
    expect(isAutoArchived({ status: 'draft', date: '' })).toBe(false)
  })
})

describe('isArchivedForUser', () => {
  it('is true when auto-archived, for any user', () => {
    const p = { status: 'completed', archivedByUserIds: [] }
    expect(isArchivedForUser(p, 'anyone')).toBe(true)
  })

  it('is user-scoped for manual archive', () => {
    const p = { status: 'proposed', date: dateStr(5), archivedByUserIds: ['alice'] }
    expect(isArchivedForUser(p, 'alice')).toBe(true)
    expect(isArchivedForUser(p, 'bob')).toBe(false)
  })

  it('handles a missing archivedByUserIds field', () => {
    expect(isArchivedForUser({ status: 'proposed', date: dateStr(5) }, 'alice')).toBe(false)
  })
})
