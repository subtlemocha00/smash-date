import {
  createWorkbook,
  downloadWorkbook,
  writeHeading,
  writeRow,
  writeDivider
} from './xlsxBuilder'

// Formats a Firestore proposal date field (YYYY-MM-DD string) for display.
function formatProposalDate(dateStr) {
  if (!dateStr) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// Formats today's date for the "Exported:" header field.
function formatExportDate() {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const STATUS_LABELS = {
  draft: 'Draft',
  proposed: 'Proposed',
  changes_requested: 'Changes Requested',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  completed: 'Completed',
  declined: 'Declined'
}

// Resolves a responsibility assignee's display name. Uses the live group member
// map (which already applies group override → account name → fallback) when the
// uid is available; falls back to the snapshot name stored on the responsibility;
// ultimately falls back to 'Unassigned'.
function resolveAssigneeName(responsibility, members) {
  const { assignedTo, assigneeName } = responsibility
  if (assignedTo && members[assignedTo]) return members[assignedTo]
  if (assigneeName) return assigneeName
  return 'Unassigned'
}

// Generates and downloads a responsibilities export for the given proposal.
//
// `proposal`         — the proposal document object
// `responsibilities` — ordered array of responsibility documents
// `members`          — uid → display name map (group-resolved, from ProposalPage state)
// `statusLabels`     — optional override for status label map
export async function exportResponsibilities(proposal, responsibilities, members) {
  const { workbook, worksheet } = createWorkbook('Responsibilities')

  let row = 1

  // ── Header block ──────────────────────────────────────────────────────────
  writeHeading(worksheet, row++, 'Smash Date - Responsibilities Export', { fontSize: 14 })
  row++ // blank line

  writeRow(worksheet, row++, 'Proposal:', proposal.title || 'Untitled')

  const dateStr = proposal.date
  if (dateStr) {
    writeRow(worksheet, row++, 'Date:', formatProposalDate(dateStr))
  }

  writeRow(worksheet, row++, 'Status:', STATUS_LABELS[proposal.status] ?? proposal.status ?? '')
  writeRow(worksheet, row++, 'Exported:', formatExportDate())

  row++ // blank line
  writeDivider(worksheet, row++)
  row++ // blank line after divider

  // ── Responsibilities ───────────────────────────────────────────────────────
  if (responsibilities.length === 0) {
    writeRow(worksheet, row++, '', 'No responsibilities have been added yet.')
  } else {
    responsibilities.forEach((r) => {
      writeRow(worksheet, row++, 'Responsibility:', r.title || '(untitled)')
      writeRow(worksheet, row++, 'Assigned To:', resolveAssigneeName(r, members))
      writeRow(worksheet, row++, 'Completed:', r.completed ? 'Yes' : 'No')

      const note = r.detailsNote?.trim()
      if (note) {
        writeRow(worksheet, row++, 'Notes:', note)
      }

      const items = Array.isArray(r.detailsList) ? r.detailsList.filter(Boolean) : []
      if (items.length > 0) {
        writeRow(worksheet, row++, 'Items:', `• ${items[0]}`)
        for (let i = 1; i < items.length; i++) {
          writeRow(worksheet, row++, '', `• ${items[i]}`)
        }
      }

      row++ // blank separator between responsibilities
    })
  }

  const safeTitle = (proposal.title || 'responsibilities')
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  await downloadWorkbook(workbook, `${safeTitle}-responsibilities.xlsx`)
}
