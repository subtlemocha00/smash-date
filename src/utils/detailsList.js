// Responsibility item lists were originally stored as plain strings. Per-item
// completion (this feature) needs to track a `completed` flag alongside the
// text, so items are stored as { text, completed } objects. These helpers
// upgrade either shape to that object form so display, editing, persistence,
// and export can treat legacy and new data identically.
//
// Backward compatibility: a legacy string item normalizes to incomplete
// ({ completed: false }); mixed legacy/new arrays normalize element-by-element.

export function normalizeDetailsItem(item) {
  if (typeof item === 'string') {
    return { text: item, completed: false }
  }
  if (item && typeof item === 'object') {
    return { text: typeof item.text === 'string' ? item.text : '', completed: !!item.completed }
  }
  return { text: '', completed: false }
}

export function normalizeDetailsList(list) {
  if (!Array.isArray(list)) return []
  return list.map(normalizeDetailsItem)
}

// Builds a clean plain-text block for copying a single responsibility to the
// clipboard (for pasting into messages/notes). Shape:
//
//   Responsibility Title
//   - Item 1
//   - Item 2
//
//   Note:
//   Note text
//
// The item list and the Note section are each omitted entirely when empty. Item
// completion state is intentionally ignored — this is a shareable summary, not a
// status snapshot. Legacy string items and { text, completed } items both resolve
// through normalizeDetailsList, and every field falls back to a safe string, so
// the output never contains "undefined".
export function formatResponsibilityText(r = {}) {
  const lines = []
  lines.push((r.title || '').trim() || 'Untitled responsibility')

  normalizeDetailsList(r.detailsList)
    .map((it) => it.text.trim())
    .filter(Boolean)
    .forEach((text) => lines.push(`- ${text}`))

  const note = (r.detailsNote || '').trim()
  if (note) {
    lines.push('') // blank line separating the item list from the note
    lines.push('Note:')
    lines.push(note)
  }

  return lines.join('\n')
}
