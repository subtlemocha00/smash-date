import ExcelJS from 'exceljs'

// Shared XLSX building utilities. Future export modules (proposal, group, etc.)
// can import from here to get consistent styling and layout helpers.

const LABEL_COL = 1
const VALUE_COL = 2

const FONT_BASE = { name: 'Calibri', size: 11 }

function applyLabel(cell, text) {
  cell.value = text
  cell.font = { ...FONT_BASE, bold: true }
  cell.alignment = { vertical: 'top', wrapText: true }
}

function applyValue(cell, text) {
  cell.value = text
  cell.font = { ...FONT_BASE }
  cell.alignment = { vertical: 'top', wrapText: true }
}

// Writes a bold label in column A and a value in column B on `row`.
export function writeRow(worksheet, row, label, value) {
  applyLabel(worksheet.getRow(row).getCell(LABEL_COL), label)
  applyValue(worksheet.getRow(row).getCell(VALUE_COL), value)
  worksheet.getRow(row).commit()
}

// Writes a section heading spanning both columns (merged).
export function writeHeading(worksheet, row, text, { fontSize = 14, bold = true } = {}) {
  const r = worksheet.getRow(row)
  const cell = r.getCell(LABEL_COL)
  cell.value = text
  cell.font = { ...FONT_BASE, size: fontSize, bold }
  cell.alignment = { vertical: 'top' }
  worksheet.mergeCells(row, LABEL_COL, row, VALUE_COL)
  r.commit()
}

// Writes a thin horizontal rule by filling the row with a top border.
export function writeDivider(worksheet, row) {
  const r = worksheet.getRow(row)
  for (let c = LABEL_COL; c <= VALUE_COL; c++) {
    r.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFD0D0D0' } } }
  }
  r.commit()
}

// Creates a bare workbook (no worksheets). Call addSheet to add sheets.
export function createWorkbook() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Smash Date'
  wb.created = new Date()
  return wb
}

// Adds a worksheet with the given name and column widths.
// `columns` is an array of { width } objects; defaults to standard label/value widths.
export function addSheet(workbook, name, columns = [{ width: 18 }, { width: 52 }]) {
  const ws = workbook.addWorksheet(name)
  ws.columns = columns
  return ws
}

// Triggers a browser download of the workbook as a .xlsx file.
export async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
