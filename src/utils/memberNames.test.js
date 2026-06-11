import { describe, it, expect } from 'vitest'
import { resolveMemberName } from './memberNames'

describe('resolveMemberName', () => {
  const group = {
    memberDisplayNames: { u1: 'Kev', u2: '  ', u3: '' },
    memberNames: { u1: 'Kevin Turley', u2: 'Sarah Lee', u4: 'Dana' }
  }

  it('prefers the group-specific override when set', () => {
    expect(resolveMemberName(group, 'u1')).toBe('Kev')
  })

  it('falls back to the denormalized account name when the override is blank', () => {
    // u2's override is whitespace-only, u3's is empty → account name (or below).
    expect(resolveMemberName(group, 'u2')).toBe('Sarah Lee')
  })

  it('falls back to the account name when there is no override at all', () => {
    expect(resolveMemberName(group, 'u4')).toBe('Dana')
  })

  it('uses the email prefix only as a last resort (current user)', () => {
    expect(resolveMemberName(group, 'u9', { email: 'kturley@gmail.com' })).toBe('kturley')
  })

  it('returns null when nothing resolves and no email is given', () => {
    expect(resolveMemberName(group, 'u9')).toBe(null)
    expect(resolveMemberName(null, 'u1')).toBe(null)
  })

  it('trims resolved names', () => {
    expect(resolveMemberName({ memberDisplayNames: { u1: '  Kev  ' } }, 'u1')).toBe('Kev')
  })

  it('handles groups with neither map (legacy, pre-migration)', () => {
    expect(resolveMemberName({}, 'u1')).toBe(null)
    expect(resolveMemberName({}, 'u1', { email: 'a@b.com' })).toBe('a')
  })
})
