import {
  createWorkbook,
  addSheet,
  downloadWorkbook,
  writeHeading,
  writeRow,
  writeDivider
} from './xlsxBuilder'
import { buildResponsibilitySheet } from './responsibilityExport'
import {
  STATUS_LABELS,
  formatProposalDate,
  formatProposalTime,
  formatTimestamp,
  formatExportDate
} from './exportFormatters'

// Mirrors the FIELDS display order from ProposalPage so the export matches
// what users see in the app. `votable` flags which fields support option voting.
const FIELDS = [
  { key: 'description', label: 'Description', votable: false },
  { key: 'date', label: 'Date', votable: true },
  { key: 'time', label: 'Time', votable: true },
  { key: 'activity', label: 'Activity', votable: true },
  { key: 'location', label: 'Restaurant / Location', votable: true },
  { key: 'childcareNotes', label: 'Childcare Notes', votable: true },
  { key: 'budget', label: 'Budget', votable: true },
  { key: 'notes', label: 'Notes', votable: false }
]

// A proposal is "finalized" for export when collaboration is closed (manual
// lock, deadline passed) or the plan has been confirmed/completed. Finalized
// proposals export plain field values only — voting options are irrelevant.
function isExportFinalized(proposal) {
  const status = proposal?.status
  if (status === 'confirmed' || status === 'completed') return true
  if (proposal?.locked === true) return true
  const dl = proposal?.decisionDeadline
  if (dl?.toMillis && Date.now() >= dl.toMillis()) return true
  return false
}

// Applies type-specific formatting to a plain field value.
function formatFieldValue(key, value) {
  if (!value) return null
  if (key === 'date') return formatProposalDate(value) ?? value
  if (key === 'time') return formatProposalTime(value) ?? value
  return value
}

// Writes the Proposal worksheet content.
function buildProposalSheet(worksheet, proposal, finalized) {
  let row = 1

  // ── Header block ──────────────────────────────────────────────────────────
  writeHeading(worksheet, row++, 'Smash Date - Proposal Export', { fontSize: 14 })
  row++ // blank line

  writeRow(worksheet, row++, 'Proposal:', proposal.title || 'Untitled')
  writeRow(worksheet, row++, 'Status:', STATUS_LABELS[proposal.status] ?? proposal.status ?? '')

  const deadline = proposal.decisionDeadline
  if (deadline) {
    writeRow(worksheet, row++, 'Decision Deadline:', formatTimestamp(deadline) ?? '')
  }

  row++ // blank line
  writeDivider(worksheet, row++)
  row++ // blank line after divider

  // ── Fields ────────────────────────────────────────────────────────────────
  // Voteable fields with active voting (enabled + not yet resolved) export their
  // option list when the proposal is not finalized. Vote counts and winner
  // identification are intentionally excluded — the export shows options only.
  FIELDS.forEach(({ key, label, votable }) => {
    const fieldVoting = proposal?.voting?.[key]
    const votingActive =
      votable && !finalized && !!fieldVoting?.allowVoting && !fieldVoting?.votingLocked
    const options = votingActive
      ? (fieldVoting.options ?? []).filter((o) => o.value)
      : []

    if (votingActive && options.length > 0) {
      const formatted = options
        .map((o) => formatFieldValue(key, o.value))
        .filter(Boolean)
      if (formatted.length > 0) {
        writeRow(worksheet, row++, `${label} Options:`, `• ${formatted[0]}`)
        for (let i = 1; i < formatted.length; i++) {
          writeRow(worksheet, row++, '', `• ${formatted[i]}`)
        }
      }
    } else {
      const displayValue = formatFieldValue(key, proposal[key])
      if (displayValue) {
        writeRow(worksheet, row++, `${label}:`, displayValue)
      }
    }
  })

  row++ // blank line before footer
  writeDivider(worksheet, row++)
  writeRow(worksheet, row++, 'Exported:', formatExportDate())
}

// Generates and downloads a full proposal export as a two-sheet workbook.
//
// Sheet 1 ("Proposal")         — proposal details, finalized vs. active aware
// Sheet 2 ("Responsibilities") — responsibility blocks (same as standalone export)
export async function exportProposal(proposal, responsibilities, members) {
  const workbook = createWorkbook()

  const proposalSheet = addSheet(workbook, 'Proposal', [{ width: 24 }, { width: 52 }])
  const respSheet = addSheet(workbook, 'Responsibilities')

  const finalized = isExportFinalized(proposal)
  buildProposalSheet(proposalSheet, proposal, finalized)
  buildResponsibilitySheet(respSheet, proposal, responsibilities, members)

  const safeTitle = (proposal.title || 'proposal')
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

  await downloadWorkbook(workbook, `${safeTitle}-proposal.xlsx`)
}
