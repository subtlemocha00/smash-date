import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { proposalUrgency, URGENCY_ORDER } from './urgency'

// Pin "today" to a fixed date so day-offset thresholds are deterministic.
const TODAY = new Date('2026-06-03T12:00:00')

function dateInDays(n) {
  const d = new Date('2026-06-03T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

describe('proposalUrgency', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "none" for a missing or invalid date', () => {
    expect(proposalUrgency('').level).toBe('none')
    expect(proposalUrgency(null).level).toBe('none')
    expect(proposalUrgency('not-a-date').level).toBe('none')
  })

  it('flags past proposal dates as overdue', () => {
    expect(proposalUrgency(dateInDays(-1)).level).toBe('overdue')
    expect(proposalUrgency(dateInDays(-10)).level).toBe('overdue')
  })

  it('treats the same day as the highest emphasis', () => {
    expect(proposalUrgency(dateInDays(0)).level).toBe('today')
  })

  it('uses high emphasis 1–6 days out', () => {
    expect(proposalUrgency(dateInDays(1)).level).toBe('high')
    expect(proposalUrgency(dateInDays(6)).level).toBe('high')
  })

  it('uses medium emphasis 7–14 days out', () => {
    expect(proposalUrgency(dateInDays(7)).level).toBe('medium')
    expect(proposalUrgency(dateInDays(14)).level).toBe('medium')
  })

  it('uses low emphasis beyond 14 days', () => {
    expect(proposalUrgency(dateInDays(15)).level).toBe('low')
    expect(proposalUrgency(dateInDays(60)).level).toBe('low')
  })

  it('orders levels from most to least urgent', () => {
    expect(URGENCY_ORDER.overdue).toBeLessThan(URGENCY_ORDER.today)
    expect(URGENCY_ORDER.today).toBeLessThan(URGENCY_ORDER.high)
    expect(URGENCY_ORDER.high).toBeLessThan(URGENCY_ORDER.medium)
    expect(URGENCY_ORDER.medium).toBeLessThan(URGENCY_ORDER.low)
    expect(URGENCY_ORDER.low).toBeLessThan(URGENCY_ORDER.none)
  })
})
