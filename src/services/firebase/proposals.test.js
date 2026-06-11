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
  isFieldVotingActive,
  createFieldOption,
  sortOptionsForField,
  buildCopiedVoting,
  isDeadlinePassed,
  isProposalLocked
} from './proposals'

// A Firestore Timestamp stub — only toMillis() is used by the lock helpers.
function ts(ms) {
  return { toMillis: () => ms }
}

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

describe('isDeadlinePassed', () => {
  const now = 1_000_000

  it('is false with no deadline', () => {
    expect(isDeadlinePassed({}, now)).toBe(false)
    expect(isDeadlinePassed({ decisionDeadline: null }, now)).toBe(false)
    expect(isDeadlinePassed(null, now)).toBe(false)
  })

  it('is true once now has reached the deadline', () => {
    expect(isDeadlinePassed({ decisionDeadline: ts(now - 1) }, now)).toBe(true)
    expect(isDeadlinePassed({ decisionDeadline: ts(now) }, now)).toBe(true)
  })

  it('is false while the deadline is still in the future', () => {
    expect(isDeadlinePassed({ decisionDeadline: ts(now + 1) }, now)).toBe(false)
  })
})

describe('isProposalLocked', () => {
  const now = 1_000_000

  it('is true when manually locked, regardless of deadline', () => {
    expect(isProposalLocked({ locked: true }, now)).toBe(true)
    expect(isProposalLocked({ locked: true, decisionDeadline: ts(now + 5000) }, now)).toBe(true)
  })

  it('is true when the deadline has passed even if not manually locked', () => {
    expect(isProposalLocked({ locked: false, decisionDeadline: ts(now - 1) }, now)).toBe(true)
  })

  it('is false when open and the deadline (if any) is in the future', () => {
    expect(isProposalLocked({ locked: false, decisionDeadline: ts(now + 1) }, now)).toBe(false)
    expect(isProposalLocked({}, now)).toBe(false)
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

  it('stamps the seeded option with the enabling user as author', () => {
    const changes = computeVotingChanges({}, { location: 'Pizza Place' }, { location: true }, 'alice')
    expect(changes['voting.location'].options[0].createdBy).toBe('alice')
  })
})

describe('createFieldOption', () => {
  it('records the author and starts with no votes', () => {
    const o = createFieldOption('1:30 PM', 'alice')
    expect(o).toMatchObject({ value: '1:30 PM', votes: [], createdBy: 'alice' })
    expect(typeof o.id).toBe('string')
  })

  it('defaults createdBy to null for unauthored (legacy-style) options', () => {
    expect(createFieldOption('x').createdBy).toBe(null)
  })
})

describe('sortOptionsForField', () => {
  it('orders time options earliest to latest by their 24h value', () => {
    const options = [opt('a', '19:30'), opt('b', '08:00'), opt('c', '13:30')]
    expect(sortOptionsForField('time', options).map((o) => o.value)).toEqual([
      '08:00',
      '13:30',
      '19:30'
    ])
  })

  it('leaves non-time fields in their existing order', () => {
    const options = [opt('a', 'Sushi'), opt('b', 'Pizza')]
    expect(sortOptionsForField('location', options).map((o) => o.value)).toEqual(['Sushi', 'Pizza'])
  })

  it('does not mutate the input array', () => {
    const options = [opt('a', '19:30'), opt('b', '08:00')]
    sortOptionsForField('time', options)
    expect(options.map((o) => o.value)).toEqual(['19:30', '08:00'])
  })
})

describe('buildCopiedVoting', () => {
  it('returns {} when the source proposal has no voting', () => {
    expect(buildCopiedVoting({})).toEqual({})
    expect(buildCopiedVoting(null)).toEqual({})
  })

  it('keeps option values but resets votes, ids, authorship, and the lock', () => {
    const proposal = {
      voting: {
        location: {
          allowVoting: true,
          votingLocked: true,
          options: [
            { id: 'old-1', value: 'Sushi', votes: ['u1', 'u2'], createdBy: 'sarah' },
            { id: 'old-2', value: 'Pizza', votes: ['u3'], createdBy: 'sarah' }
          ]
        }
      }
    }
    const out = buildCopiedVoting(proposal, 'kevin')
    expect(out.location.allowVoting).toBe(true)
    expect(out.location.votingLocked).toBe(false)
    expect(out.location.options.map((o) => o.value)).toEqual(['Sushi', 'Pizza'])
    out.location.options.forEach((o) => {
      expect(o.votes).toEqual([])
      expect(o.createdBy).toBe('kevin')
    })
    // Fresh ids — none of the originals carry over.
    expect(out.location.options.map((o) => o.id)).not.toContain('old-1')
    expect(out.location.options.map((o) => o.id)).not.toContain('old-2')
  })

  it('drops the date field options (stale past dates) but keeps its flag', () => {
    const proposal = {
      voting: {
        date: {
          allowVoting: true,
          votingLocked: true,
          options: [{ id: 'd1', value: '2020-01-01', votes: ['u1'], createdBy: 'sarah' }]
        }
      }
    }
    const out = buildCopiedVoting(proposal, 'kevin')
    expect(out.date.allowVoting).toBe(true)
    expect(out.date.votingLocked).toBe(false)
    expect(out.date.options).toEqual([])
  })
})
