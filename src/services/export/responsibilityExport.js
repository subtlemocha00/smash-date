import {
  createWorkbook,
  addSheet,
  downloadWorkbook,
  writeHeading,
  writeRow,
  writeDivider
} from './xlsxBuilder'
import { formatProposalDate, formatExportDate, STATUS_LABELS } from './exportFormatters'
import { normalizeDetailsList } from '../../utils/detailsList'

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

// Writes responsibility content into an existing worksheet. Called directly by
// exportResponsibilities and reused by proposalExport when building sheet 2.
export function buildResponsibilitySheet(worksheet, proposal, responsibilities, members) {
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

      // Normalize so legacy string items and new { text, completed } items both
      // export; completed items are marked so the checklist state carries over.
      const items = normalizeDetailsList(r.detailsList).filter((it) => it.text.trim())
      if (items.length > 0) {
        const label = (it) => `• ${it.text}${it.completed ? ' (done)' : ''}`
        writeRow(worksheet, row++, 'Items:', label(items[0]))
        for (let i = 1; i < items.length; i++) {
          writeRow(worksheet, row++, '', label(items[i]))
        }
      }

      row++ // blank separator between responsibilities
    })
  }
}

// Generates and downloads a standalone responsibilities-only export.
export async function exportResponsibilities(proposal, responsibilities, members) {
  const workbook = createWorkbook()
  const worksheet = addSheet(workbook, 'Responsibilities')

  buildResponsibilitySheet(worksheet, proposal, responsibilities, members)

  const safeTitle = (proposal.title || 'responsibilities')
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  await downloadWorkbook(workbook, `${safeTitle}-responsibilities.xlsx`)
}
