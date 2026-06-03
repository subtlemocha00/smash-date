import { describe, it, expect } from 'vitest'
import {
  isProposalPast,
  isProposalComplete,
  isAutoArchived,
  isArchivedForUser,
  isDismissedForUser,
  getLeaders,
  allMembersVoted,
  computeVotingChanges,
  isFieldVotingActive
} from './proposals'

// Minimal option/voting fixtures for the field-voting helpers.
function opt(id, value, votes = []) {
  return { id, value, votes }
}

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

describe('isProposalComplete', () => {
  it('is false without a valid date', () => {
    expect(isProposalComplete({ date: '' })).toBe(false)
    expect(isProposalComplete({})).toBe(false)
    expect(isProposalComplete({ date: 'not-a-date' })).toBe(false)
  })

  it('is true only once the day after the event date has begun', () => {
    expect(isProposalComplete({ date: dateStr(-2) })).toBe(true)
    expect(isProposalComplete({ date: dateStr(-1) })).toBe(true)
  })

  it('is false on the event day itself and in the future', () => {
    expect(isProposalComplete({ date: dateStr(0) })).toBe(false)
    expect(isProposalComplete({ date: dateStr(1) })).toBe(false)
  })
})

describe('isAutoArchived', () => {
  it('archives proposals whose date has passed (completed)', () => {
    expect(isAutoArchived({ status: 'confirmed', date: dateStr(-1) })).toBe(true)
  })

  it('does not archive the event day or future/undated proposals', () => {
    expect(isAutoArchived({ status: 'confirmed', date: dateStr(0) })).toBe(false)
    expect(isAutoArchived({ status: 'proposed', date: dateStr(3) })).toBe(false)
    expect(isAutoArchived({ status: 'draft', date: '' })).toBe(false)
  })
})

describe('isArchivedForUser', () => {
  it('is true when auto-archived (date passed), for any user', () => {
    const p = { status: 'confirmed', date: dateStr(-1), archivedByUserIds: [] }
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

describe('isDismissedForUser', () => {
  it('is user-scoped', () => {
    const p = { dismissedByUserIds: ['alice'] }
    expect(isDismissedForUser(p, 'alice')).toBe(true)
    expect(isDismissedForUser(p, 'bob')).toBe(false)
  })

  it('handles a missing dismissedByUserIds field', () => {
    expect(isDismissedForUser({}, 'alice')).toBe(false)
  })
})

describe('getLeaders', () => {
  it('returns [] when no votes have been cast', () => {
    expect(getLeaders([opt('a', 'X'), opt('b', 'Y')])).toEqual([])
    expect(getLeaders([])).toEqual([])
  })

  it('returns the single option with the most votes', () => {
    const leaders = getLeaders([opt('a', 'X', ['u1', 'u2']), opt('b', 'Y', ['u3'])])
    expect(leaders.map((o) => o.id)).toEqual(['a'])
  })

  it('returns every tied option when the top is shared', () => {
    const leaders = getLeaders([
      opt('a', 'X', ['u1']),
      opt('b', 'Y', ['u2']),
      opt('c', 'Z', [])
    ])
    expect(leaders.map((o) => o.id).sort()).toEqual(['a', 'b'])
  })
})

describe('allMembersVoted', () => {
  const options = [opt('a', 'X', ['u1']), opt('b', 'Y', ['u2'])]

  it('is true only once every member appears in some option', () => {
    expect(allMembersVoted(options, ['u1', 'u2'])).toBe(true)
    expect(allMembersVoted(options, ['u1', 'u2', 'u3'])).toBe(false)
  })

  it('is false with no members or no options', () => {
    expect(allMembersVoted(options, [])).toBe(false)
    expect(allMembersVoted([], ['u1'])).toBe(false)
  })
})

describe('isFieldVotingActive', () => {
  it('is true only when enabled and not locked', () => {
    const proposal = {
      voting: {
        location: { allowVoting: true, votingLocked: false },
        date: { allowVoting: true, votingLocked: true },
        time: { allowVoting: false }
      }
    }
    expect(isFieldVotingActive(proposal, 'location')).toBe(true)
    expect(isFieldVotingActive(proposal, 'date')).toBe(false)
    expect(isFieldVotingActive(proposal, 'time')).toBe(false)
    expect(isFieldVotingActive(proposal, 'budget')).toBe(false)
  })
})

describe('computeVotingChanges', () => {
  it('enables a field and seeds an option from the current value', () => {
    const changes = computeVotingChanges({}, { location: 'Pizza Place' }, { location: true })
    expect(changes['voting.location'].allowVoting).toBe(true)
    expect(changes['voting.location'].votingLocked).toBe(false)
    expect(changes['voting.location'].options).toHaveLength(1)
    expect(changes['voting.location'].options[0]).toMatchObject({ value: 'Pizza Place', votes: [] })
  })

  it('enables with no seed option when the value is empty', () => {
    const changes = computeVotingChanges({}, { date: '' }, { date: true })
    expect(changes['voting.date'].options).toEqual([])
  })

  it('removes the voting entry when disabled', () => {
    const proposal = { voting: { location: { allowVoting: true, options: [] } } }
    const changes = computeVotingChanges(proposal, { location: 'X' }, { location: false })
    // deleteField() sentinel — just assert the key is present for removal.
    expect(changes).toHaveProperty('voting.location')
  })

  it('produces no changes when toggle state is unchanged', () => {
    const proposal = { voting: { location: { allowVoting: true, options: [] } } }
    const changes = computeVotingChanges(proposal, { location: 'X' }, { location: true })
    expect(changes).toEqual({})
  })
})
