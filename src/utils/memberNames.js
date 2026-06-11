// Resolves how a member's name should appear *within a group*. Names are
// denormalized onto the group document (a user can't read other users' profiles
// under the security rules), with an optional per-group override layered on top.
//
// Resolution order:
//   1. group-specific override   (group.memberDisplayNames[uid])
//   2. denormalized account name (group.memberNames[uid])
//   3. email prefix              (only available for the current user)
//
// Returns null when nothing resolves, so callers can apply their own ultimate
// fallback ('Unassigned', 'Group member', a short uid, etc.). `group` may be a
// partial object or null — missing maps simply fall through (no migration
// needed for groups created before memberDisplayNames existed).
export function resolveMemberName(group, uid, { email } = {}) {
  const override = group?.memberDisplayNames?.[uid]
  if (typeof override === 'string' && override.trim()) return override.trim()

  const account = group?.memberNames?.[uid]
  if (typeof account === 'string' && account.trim()) return account.trim()

  if (email) {
    const prefix = String(email).split('@')[0]
    if (prefix) return prefix
  }

  return null
}
