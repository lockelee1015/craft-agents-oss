import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { PreviewOverlay } from '@craft-agent/ui'
import type { Sheet } from '@fortune-sheet/core'
import { Workbook, type WorkbookInstance } from '@fortune-sheet/react'
import { transformExcelToFortune } from '@corbe30/fortune-excel'
import '@fortune-sheet/react/dist/index.css'

type FortuneCellData = {
  m?: unknown
  v?: unknown
  ct?: { fa?: string; t?: string }
}

type FortuneCellRecord = { r?: number; c?: number; v?: FortuneCellData }

function toByte(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(255, Math.trunc(num)))
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s+/g, '')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 0xff
  }
  return bytes
}

function latin1StringToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length)
  for (let i = 0; i < value.length; i += 1) {
    bytes[i] = value.charCodeAt(i) & 0xff
  }
  return bytes
}

function describePayload(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (value instanceof Uint8Array) return `Uint8Array(${value.byteLength})`
  if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return `${value.constructor?.name ?? 'ArrayBufferView'}(${view.byteLength})`
  }
  if (Array.isArray(value)) return `Array(${value.length})`
  if (typeof value === 'string') return `string(${value.length})`
  if (typeof value === 'object') return value.constructor?.name ?? 'object'
  return typeof value
}

function normalizeBinaryPayload(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0))
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice()
  }
  if (Array.isArray(value)) return Uint8Array.from(value.map(toByte))

  if (typeof value === 'string') {
    const trimmed = value.trim()
    const dataUrlMatch = trimmed.match(/^data:.*?;base64,(.*)$/i)
    if (dataUrlMatch?.[1]) return decodeBase64ToBytes(dataUrlMatch[1])

    if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length % 4 === 0) {
      try {
        return decodeBase64ToBytes(trimmed)
      } catch {
        // Fall through to latin1 bytes.
      }
    }

    return latin1StringToBytes(value)
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    if (Array.isArray(record.data)) {
      return Uint8Array.from(record.data.map(toByte))
    }

    const length = typeof record.length === 'number' ? Math.trunc(record.length) : -1
    if (length > 0) {
      const bytes = new Uint8Array(length)
      let foundNumericEntry = false
      for (let i = 0; i < length; i += 1) {
        if (record[String(i)] !== undefined) {
          bytes[i] = toByte(record[String(i)])
          foundNumericEntry = true
        }
      }
      if (foundNumericEntry) return bytes
    }

    const numericKeys = Object.keys(record)
      .filter((key) => /^\d+$/.test(key))
      .sort((a, b) => Number(a) - Number(b))

    if (numericKeys.length > 0) {
      return Uint8Array.from(numericKeys.map((key) => toByte(record[key])))
    }
  }

  throw new Error(`Unsupported binary payload type: ${describePayload(value)}`)
}

function hasZipHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
  const sig3 = bytes[2]
  const sig4 = bytes[3]
  return (
    (sig3 === 0x03 && sig4 === 0x04) ||
    (sig3 === 0x05 && sig4 === 0x06) ||
    (sig3 === 0x07 && sig4 === 0x08)
  )
}

function startsWithUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
}

function looksLikeUtf16LeText(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16 || bytes.byteLength % 2 !== 0) return false
  let zeroHighBytes = 0
  let inspected = 0
  for (let i = 1; i < bytes.byteLength && inspected < 64; i += 2) {
    if (bytes[i] === 0) zeroHighBytes += 1
    inspected += 1
  }
  return inspected > 0 && zeroHighBytes / inspected > 0.6
}

function decodeUtf16Le(bytes: Uint8Array): string | null {
  if (!startsWithUtf16LeBom(bytes) && !looksLikeUtf16LeText(bytes)) return null
  try {
    return new TextDecoder('utf-16le').decode(bytes)
  } catch {
    return null
  }
}

function toUtf8Text(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

function isLikelyText(value: string): boolean {
  if (!value) return false
  let printable = 0
  const limit = Math.min(value.length, 4096)
  for (let i = 0; i < limit; i += 1) {
    const code = value.charCodeAt(i)
    if (
      code === 9 ||
      code === 10 ||
      code === 13 ||
      (code >= 32 && code <= 126) ||
      code >= 160
    ) {
      printable += 1
    }
  }
  return printable / limit > 0.9
}

function tryDecodeBinaryFromText(value: string): Uint8Array | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const dataUrlMatch = trimmed.match(/^data:.*?;base64,(.*)$/i)
  if (dataUrlMatch?.[1]) {
    try {
      return decodeBase64ToBytes(dataUrlMatch[1])
    } catch {
      // Ignore and continue.
    }
  }

  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length % 4 === 0) {
    try {
      return decodeBase64ToBytes(trimmed)
    } catch {
      // Ignore and continue.
    }
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return normalizeBinaryPayload(parsed)
    } catch {
      // Ignore and continue.
    }
  }

  return null
}

function looksLikeCsvText(value: string): boolean {
  const text = value.trim()
  if (!text) return false
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 2) return false
  const probe = lines.slice(0, Math.min(lines.length, 10))
  const delimiter = probe.some((line) => line.includes('\t'))
    ? '\t'
    : probe.some((line) => line.includes(','))
      ? ','
      : null
  if (!delimiter) return false
  let consistent = 0
  for (const line of probe) {
    const cells = line.split(delimiter)
    if (cells.length >= 2) consistent += 1
  }
  return consistent >= Math.max(2, Math.ceil(probe.length * 0.6))
}

function previewBytes(bytes: Uint8Array, count = 12): string {
  return Array.from(bytes.slice(0, count))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
}

type WorkbookInput =
  | { kind: 'file'; file: File; mode: 'xlsx' | 'csv'; source: string }
  | { kind: 'sheets'; sheets: Sheet[]; source: string }

type XlsxModule = typeof import('xlsx')

type SheetJsCell = {
  v?: unknown
  w?: unknown
  t?: string
  z?: unknown
  f?: unknown
}

type SheetJsWorksheet = Record<string, unknown> & {
  ['!ref']?: string
  ['!merges']?: Array<{
    s: { r: number; c: number }
    e: { r: number; c: number }
  }>
  ['!cols']?: Array<{ wpx?: number; wch?: number; hidden?: boolean }>
  ['!rows']?: Array<{ hpx?: number; hpt?: number; hidden?: boolean }>
}

type SheetJsWorkbook = {
  SheetNames: string[]
  Sheets: Record<string, SheetJsWorksheet>
}

type SpreadsheetMlStyle = {
  fc?: string
  bg?: string
  bl?: number
  it?: number
  un?: number
  ff?: string
  fs?: number
  ht?: number
  vt?: number
  tb?: string
  ctFa?: string
}

const SPREADSHEET_ML_NS = 'urn:schemas-microsoft-com:office:spreadsheet'

function toCsvFilename(path: string): string {
  const filename = getFilename(path)
  return filename.replace(/\.xlsx$/i, '.csv')
}

function looksLikeXmlWorkbookText(value: string): boolean {
  const text = value.trim().toLowerCase()
  if (!text.startsWith('<') && !text.startsWith('<?xml')) return false
  return (
    text.includes('<workbook') ||
    text.includes('<worksheet') ||
    text.includes('<table') ||
    text.includes('<html')
  )
}

function toFortuneCellDataFromSheetJsCell(cell: SheetJsCell): FortuneCellData | null {
  const rawValue = cell.v
  const hasFormula = typeof cell.f === 'string' && cell.f.trim().length > 0
  const hasDisplay = typeof cell.w === 'string' || typeof cell.w === 'number'
  if (rawValue === undefined && !hasFormula && !hasDisplay) return null

  const next: FortuneCellData & { f?: string } = {}
  if (typeof rawValue === 'number' || typeof rawValue === 'string' || typeof rawValue === 'boolean') {
    next.v = rawValue
  } else if (rawValue instanceof Date) {
    next.v = rawValue.toISOString()
  } else if (rawValue !== undefined && rawValue !== null) {
    next.v = String(rawValue)
  }

  if (hasDisplay) {
    next.m = cell.w
  } else if (next.v !== undefined) {
    next.m = next.v
  }

  const ct: { fa?: string; t?: string } = {}
  if (typeof cell.z === 'string' && cell.z) ct.fa = cell.z
  if (typeof cell.t === 'string' && cell.t) ct.t = cell.t
  if (ct.fa || ct.t) next.ct = ct
  if (hasFormula) next.f = cell.f as string

  return next
}

function getSpreadsheetMlAttr(el: Element, name: string): string | null {
  return (
    el.getAttribute(`ss:${name}`) ??
    el.getAttributeNS(SPREADSHEET_ML_NS, name) ??
    el.getAttribute(name)
  )
}

function parseSpreadsheetColor(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase()
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return `#${trimmed.slice(3).toUpperCase()}`
  return undefined
}

function mapSpreadsheetHorizontal(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  switch (value.toLowerCase()) {
    case 'center':
      return 0
    case 'right':
      return 2
    case 'left':
      return 1
    default:
      return undefined
  }
}

function mapSpreadsheetVertical(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  switch (value.toLowerCase()) {
    case 'center':
      return 0
    case 'top':
      return 1
    case 'bottom':
      return 2
    default:
      return undefined
  }
}

function parseSpreadsheetMlStyles(doc: Document): Record<string, SpreadsheetMlStyle> {
  const styleMap: Record<string, SpreadsheetMlStyle> = {}
  const styleNodes = Array.from(doc.getElementsByTagName('Style'))

  for (const node of styleNodes) {
    const styleId = getSpreadsheetMlAttr(node, 'ID')
    if (!styleId) continue

    const next: SpreadsheetMlStyle = {}

    const font = node.getElementsByTagName('Font')[0]
    if (font) {
      const color = parseSpreadsheetColor(getSpreadsheetMlAttr(font, 'Color'))
      if (color) next.fc = color
      if (getSpreadsheetMlAttr(font, 'Bold') === '1') next.bl = 1
      if (getSpreadsheetMlAttr(font, 'Italic') === '1') next.it = 1
      if (getSpreadsheetMlAttr(font, 'Underline')) next.un = 1
      const fontName = getSpreadsheetMlAttr(font, 'FontName')
      if (fontName) next.ff = fontName
      const fontSize = Number(getSpreadsheetMlAttr(font, 'Size'))
      if (Number.isFinite(fontSize) && fontSize > 0) next.fs = Math.round(fontSize)
    }

    const interior = node.getElementsByTagName('Interior')[0]
    if (interior) {
      const bg = parseSpreadsheetColor(getSpreadsheetMlAttr(interior, 'Color'))
      if (bg) next.bg = bg
    }

    const alignment = node.getElementsByTagName('Alignment')[0]
    if (alignment) {
      const horizontal = mapSpreadsheetHorizontal(getSpreadsheetMlAttr(alignment, 'Horizontal'))
      if (horizontal !== undefined) next.ht = horizontal
      const vertical = mapSpreadsheetVertical(getSpreadsheetMlAttr(alignment, 'Vertical'))
      if (vertical !== undefined) next.vt = vertical
      const wrapText = getSpreadsheetMlAttr(alignment, 'WrapText')
      if (wrapText === '1') next.tb = '2'
    }

    const numberFormat = node.getElementsByTagName('NumberFormat')[0]
    if (numberFormat) {
      const format = getSpreadsheetMlAttr(numberFormat, 'Format')
      if (format) next.ctFa = format
    }

    styleMap[styleId] = next
  }

  return styleMap
}

function mergeSpreadsheetStyles(
  base: SpreadsheetMlStyle | undefined,
  override: SpreadsheetMlStyle | undefined,
): SpreadsheetMlStyle {
  return { ...(base ?? {}), ...(override ?? {}) }
}

function applySpreadsheetStyleToCell(
  target: FortuneCellData & { f?: string },
  style: SpreadsheetMlStyle,
): void {
  if (style.fc) target.fc = style.fc
  if (style.bg) target.bg = style.bg
  if (style.bl !== undefined) target.bl = style.bl
  if (style.it !== undefined) target.it = style.it
  if (style.un !== undefined) target.un = style.un
  if (style.ff) target.ff = style.ff
  if (style.fs !== undefined) target.fs = style.fs
  if (style.ht !== undefined) target.ht = style.ht
  if (style.vt !== undefined) target.vt = style.vt
  if (style.tb) target.tb = style.tb
  if (style.ctFa) {
    const prev = (target.ct ?? {}) as { fa?: string; t?: string }
    target.ct = { ...prev, fa: style.ctFa }
  }
}

function parseSpreadsheetMlCellValue(
  cellType: string | null,
  rawText: string,
): { v: string | number | boolean; t?: string } {
  const normalizedType = (cellType ?? 'String').toLowerCase()
  if (normalizedType === 'number') {
    const num = Number(rawText)
    if (Number.isFinite(num)) return { v: num, t: 'n' }
    return { v: rawText, t: 's' }
  }
  if (normalizedType === 'boolean') {
    return { v: rawText === '1' || rawText.toLowerCase() === 'true', t: 'b' }
  }
  return { v: rawText, t: 's' }
}

function isSpreadsheetMlWorkbookText(value: string): boolean {
  const text = value.toLowerCase()
  return (
    text.includes('urn:schemas-microsoft-com:office:spreadsheet') &&
    text.includes('<workbook')
  )
}

function parseSpreadsheetMlWorkbookToFortuneSheets(value: string): Sheet[] | null {
  if (!isSpreadsheetMlWorkbookText(value)) return null

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(value, 'application/xml')
  } catch {
    return null
  }

  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const styleMap = parseSpreadsheetMlStyles(doc)
  const worksheets = Array.from(doc.getElementsByTagName('Worksheet'))
  const sheets: Sheet[] = []

  for (let sheetIndex = 0; sheetIndex < worksheets.length; sheetIndex += 1) {
    const worksheet = worksheets[sheetIndex]
    const name = getSpreadsheetMlAttr(worksheet, 'Name') ?? `Sheet${sheetIndex + 1}`
    const table = worksheet.getElementsByTagName('Table')[0]
    if (!table) {
      sheets.push({
        name,
        order: sheetIndex,
        status: sheetIndex === 0 ? 1 : 0,
        row: 60,
        column: 26,
        celldata: [],
      })
      continue
    }

    const config: NonNullable<Sheet['config']> = {}
    const columnlen: Record<string, number> = {}
    const customWidth: Record<string, number> = {}
    const rowlen: Record<string, number> = {}
    const customHeight: Record<string, number> = {}
    const merge: Record<string, { r: number; c: number; rs: number; cs: number }> = {}
    const celldata: FortuneCellRecord[] = []

    const tableChildren = Array.from(table.children)
    let nextColIndex = 0
    let rowIndex = 0
    let maxCol = 0
    let maxRow = 0

    for (const child of tableChildren) {
      if (child.tagName === 'Column') {
        const indexed = Number(getSpreadsheetMlAttr(child, 'Index'))
        if (Number.isFinite(indexed) && indexed > 0) nextColIndex = indexed - 1

        const width = Number(getSpreadsheetMlAttr(child, 'Width'))
        if (Number.isFinite(width) && width > 0) {
          const px = Math.round(width)
          columnlen[String(nextColIndex)] = px
          customWidth[String(nextColIndex)] = 1
        }
        maxCol = Math.max(maxCol, nextColIndex)
        nextColIndex += 1
        continue
      }

      if (child.tagName !== 'Row') continue

      const indexed = Number(getSpreadsheetMlAttr(child, 'Index'))
      if (Number.isFinite(indexed) && indexed > 0) rowIndex = indexed - 1

      const rowStyleId = getSpreadsheetMlAttr(child, 'StyleID') ?? undefined
      const rowStyle = rowStyleId ? styleMap[rowStyleId] : undefined

      const rowHeight = Number(getSpreadsheetMlAttr(child, 'Height'))
      if (Number.isFinite(rowHeight) && rowHeight > 0) {
        const px = Math.round(rowHeight)
        rowlen[String(rowIndex)] = px
        customHeight[String(rowIndex)] = 1
      }

      let colIndex = 0
      const cells = Array.from(child.children).filter((el) => el.tagName === 'Cell')
      for (const cellEl of cells) {
        const cellIndexed = Number(getSpreadsheetMlAttr(cellEl, 'Index'))
        if (Number.isFinite(cellIndexed) && cellIndexed > 0) colIndex = cellIndexed - 1

        const cellStyleId = getSpreadsheetMlAttr(cellEl, 'StyleID') ?? undefined
        const effectiveStyle = mergeSpreadsheetStyles(
          rowStyle,
          cellStyleId ? styleMap[cellStyleId] : undefined,
        )

        const dataNode = cellEl.getElementsByTagName('Data')[0]
        const dataText = dataNode?.textContent ?? ''
        const dataType = dataNode ? getSpreadsheetMlAttr(dataNode, 'Type') : null

        const parsed = parseSpreadsheetMlCellValue(dataType, dataText)
        const cellValue: FortuneCellData & { f?: string } = {
          v: parsed.v,
          m: typeof parsed.v === 'number' ? String(parsed.v) : parsed.v,
        }

        if (parsed.t || effectiveStyle.ctFa) {
          cellValue.ct = {
            t: parsed.t ?? 's',
            ...(effectiveStyle.ctFa ? { fa: effectiveStyle.ctFa } : {}),
          }
        }

        const formula = getSpreadsheetMlAttr(cellEl, 'Formula')
        if (formula) cellValue.f = formula

        applySpreadsheetStyleToCell(cellValue, effectiveStyle)

        if (effectiveStyle.ctFa) {
          const formatted = formatNumberDisplay(cellValue.v, effectiveStyle.ctFa)
          if (formatted) cellValue.m = formatted
        }

        celldata.push({ r: rowIndex, c: colIndex, v: cellValue })
        maxRow = Math.max(maxRow, rowIndex)
        maxCol = Math.max(maxCol, colIndex)

        const mergeAcross = Number(getSpreadsheetMlAttr(cellEl, 'MergeAcross'))
        const mergeDown = Number(getSpreadsheetMlAttr(cellEl, 'MergeDown'))
        const cs = Number.isFinite(mergeAcross) && mergeAcross >= 0 ? mergeAcross + 1 : 1
        const rs = Number.isFinite(mergeDown) && mergeDown >= 0 ? mergeDown + 1 : 1
        if (cs > 1 || rs > 1) {
          merge[`${rowIndex}_${colIndex}`] = { r: rowIndex, c: colIndex, rs, cs }
          maxRow = Math.max(maxRow, rowIndex + rs - 1)
          maxCol = Math.max(maxCol, colIndex + cs - 1)
        }

        colIndex += 1
      }

      rowIndex += 1
    }

    celldata.sort((a, b) => {
      const rowA = a.r ?? 0
      const rowB = b.r ?? 0
      if (rowA !== rowB) return rowA - rowB
      return (a.c ?? 0) - (b.c ?? 0)
    })

    if (Object.keys(merge).length > 0) config.merge = merge
    if (Object.keys(columnlen).length > 0) config.columnlen = columnlen
    if (Object.keys(customWidth).length > 0) config.customWidth = customWidth
    if (Object.keys(rowlen).length > 0) config.rowlen = rowlen
    if (Object.keys(customHeight).length > 0) config.customHeight = customHeight

    sheets.push({
      name,
      order: sheetIndex,
      status: sheetIndex === 0 ? 1 : 0,
      row: Math.max(maxRow + 20, 60),
      column: Math.max(maxCol + 10, 26),
      celldata,
      config: Object.keys(config).length > 0 ? config : undefined,
    })
  }

  if (sheets.length === 0) return null
  return sheets
}

function convertSheetJsWorkbookToFortuneSheets(XLSX: XlsxModule, workbook: SheetJsWorkbook): Sheet[] {
  const sheets: Sheet[] = []
  const names = Array.isArray(workbook.SheetNames) ? workbook.SheetNames : []

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index]
    const worksheet = workbook.Sheets[name]
    if (!worksheet) continue

    const celldata: FortuneCellRecord[] = []
    for (const [address, rawCell] of Object.entries(worksheet)) {
      if (address.startsWith('!')) continue
      if (!/^[A-Za-z]+[0-9]+$/.test(address)) continue

      const decoded = XLSX.utils.decode_cell(address)
      const cellData = toFortuneCellDataFromSheetJsCell(rawCell as SheetJsCell)
      if (!cellData) continue
      celldata.push({ r: decoded.r, c: decoded.c, v: cellData })
    }

    celldata.sort((a, b) => {
      const rowA = a.r ?? 0
      const rowB = b.r ?? 0
      if (rowA !== rowB) return rowA - rowB
      return (a.c ?? 0) - (b.c ?? 0)
    })

    let maxRow = 0
    let maxCol = 0
    if (typeof worksheet['!ref'] === 'string' && worksheet['!ref']) {
      const range = XLSX.utils.decode_range(worksheet['!ref'])
      maxRow = range.e.r
      maxCol = range.e.c
    } else {
      for (const cell of celldata) {
        maxRow = Math.max(maxRow, cell.r ?? 0)
        maxCol = Math.max(maxCol, cell.c ?? 0)
      }
    }

    const config: NonNullable<Sheet['config']> = {}

    if (Array.isArray(worksheet['!merges']) && worksheet['!merges'].length > 0) {
      const merge: NonNullable<Sheet['config']>['merge'] = {}
      for (const merged of worksheet['!merges']) {
        const rowSpan = merged.e.r - merged.s.r + 1
        const colSpan = merged.e.c - merged.s.c + 1
        merge[`${merged.s.r}_${merged.s.c}`] = {
          r: merged.s.r,
          c: merged.s.c,
          rs: rowSpan,
          cs: colSpan,
        }
      }
      config.merge = merge
    }

    if (Array.isArray(worksheet['!cols'])) {
      const columnlen: Record<string, number> = {}
      const customWidth: Record<string, number> = {}
      const colhidden: Record<string, number> = {}

      worksheet['!cols'].forEach((col, colIndex) => {
        if (!col) return
        if (col.hidden) colhidden[String(colIndex)] = 0

        let width: number | null = null
        if (typeof col.wpx === 'number' && Number.isFinite(col.wpx)) width = Math.round(col.wpx)
        else if (typeof col.wch === 'number' && Number.isFinite(col.wch)) width = Math.round(col.wch * 8 + 5)

        if (width && width > 0) {
          columnlen[String(colIndex)] = width
          customWidth[String(colIndex)] = 1
        }
      })

      if (Object.keys(columnlen).length > 0) config.columnlen = columnlen
      if (Object.keys(customWidth).length > 0) config.customWidth = customWidth
      if (Object.keys(colhidden).length > 0) config.colhidden = colhidden
    }

    if (Array.isArray(worksheet['!rows'])) {
      const rowlen: Record<string, number> = {}
      const customHeight: Record<string, number> = {}
      const rowhidden: Record<string, number> = {}

      worksheet['!rows'].forEach((row, rowIndex) => {
        if (!row) return
        if (row.hidden) rowhidden[String(rowIndex)] = 0

        let height: number | null = null
        if (typeof row.hpx === 'number' && Number.isFinite(row.hpx)) height = Math.round(row.hpx)
        else if (typeof row.hpt === 'number' && Number.isFinite(row.hpt)) height = Math.round(row.hpt * 1.333333)

        if (height && height > 0) {
          rowlen[String(rowIndex)] = height
          customHeight[String(rowIndex)] = 1
        }
      })

      if (Object.keys(rowlen).length > 0) config.rowlen = rowlen
      if (Object.keys(customHeight).length > 0) config.customHeight = customHeight
      if (Object.keys(rowhidden).length > 0) config.rowhidden = rowhidden
    }

    sheets.push({
      name,
      order: index,
      status: index === 0 ? 1 : 0,
      row: Math.max(maxRow + 20, 60),
      column: Math.max(maxCol + 10, 26),
      celldata,
      config: Object.keys(config).length > 0 ? config : undefined,
    })
  }

  if (sheets.length === 0) {
    return [{ name: 'Sheet1', row: 60, column: 26, celldata: [], status: 1, order: 0 }]
  }
  return sheets
}

async function tryConvertWorkbookTextToFortuneSheets(value: string): Promise<Sheet[] | null> {
  const spreadsheetMlParsed = parseSpreadsheetMlWorkbookToFortuneSheets(value)
  if (spreadsheetMlParsed && spreadsheetMlParsed.length > 0) return spreadsheetMlParsed

  if (!looksLikeXmlWorkbookText(value)) return null

  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(value, { type: 'string', cellStyles: true, cellNF: true, cellFormula: true }) as unknown as SheetJsWorkbook
    if (!Array.isArray(workbook?.SheetNames) || workbook.SheetNames.length === 0) return null
    return convertSheetJsWorkbookToFortuneSheets(XLSX, workbook)
  } catch {
    return null
  }
}

async function prepareWorkbookInput(filePath: string, rawPayload: unknown): Promise<WorkbookInput> {
  const bytes = normalizeBinaryPayload(rawPayload)
  const filename = getFilename(filePath)

  if (hasZipHeader(bytes)) {
    return {
      kind: 'file',
      file: new File([bytes], filename, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      mode: 'xlsx',
      source: 'raw-bytes',
    }
  }

  const utf16 = decodeUtf16Le(bytes)
  if (utf16) {
    const decoded = tryDecodeBinaryFromText(utf16)
    if (decoded && hasZipHeader(decoded)) {
      return {
        kind: 'file',
        file: new File([decoded], filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        mode: 'xlsx',
        source: 'utf16-text-encoded-binary',
      }
    }
    if (looksLikeCsvText(utf16)) {
      return {
        kind: 'file',
        file: new File([utf16], toCsvFilename(filePath), { type: 'text/csv' }),
        mode: 'csv',
        source: 'utf16-csv-fallback',
      }
    }

    const converted = await tryConvertWorkbookTextToFortuneSheets(utf16)
    if (converted && converted.length > 0) {
      return {
        kind: 'sheets',
        sheets: converted,
        source: 'utf16-xml-workbook-fallback',
      }
    }
  }

  const utf8 = toUtf8Text(bytes)
  if (isLikelyText(utf8)) {
    const decoded = tryDecodeBinaryFromText(utf8)
    if (decoded && hasZipHeader(decoded)) {
      return {
        kind: 'file',
        file: new File([decoded], filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        mode: 'xlsx',
        source: 'utf8-text-encoded-binary',
      }
    }
    if (looksLikeCsvText(utf8)) {
      return {
        kind: 'file',
        file: new File([utf8], toCsvFilename(filePath), { type: 'text/csv' }),
        mode: 'csv',
        source: 'utf8-csv-fallback',
      }
    }

    const converted = await tryConvertWorkbookTextToFortuneSheets(utf8)
    if (converted && converted.length > 0) {
      return {
        kind: 'sheets',
        sheets: converted,
        source: 'utf8-xml-workbook-fallback',
      }
    }
  }

  throw new Error(
    `Invalid XLSX binary payload (${describePayload(rawPayload)}): missing ZIP header (first bytes: ${previewBytes(bytes)})`,
  )
}

function formatNumberDisplay(value: unknown, format: string): string | null {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return null
  if (format.includes('%')) return `${(num * 100).toFixed(2)}%`
  if (format.includes('$')) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(num)
  }
  if (format.includes('#,##0')) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num)
  }
  return null
}

function normalizeFortuneSheets(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw
  return raw.map((sheet) => {
    if (!sheet || typeof sheet !== 'object') return sheet
    const nextSheet = { ...(sheet as Record<string, unknown>) }
    const celldata = (nextSheet as { celldata?: FortuneCellRecord[] }).celldata
    if (Array.isArray(celldata)) {
      nextSheet.celldata = celldata.map((cell) => {
        if (!cell || typeof cell !== 'object' || !cell.v || typeof cell.v !== 'object') return cell
        const nextValue = { ...(cell.v as FortuneCellData) }
        if (typeof nextValue.v === 'string' && nextValue.v.startsWith("'")) {
          nextValue.v = nextValue.v.slice(1)
        }
        if (typeof nextValue.m === 'string' && nextValue.m.startsWith("'")) {
          nextValue.m = nextValue.m.slice(1)
        }
        const fa = typeof nextValue.ct?.fa === 'string' ? nextValue.ct.fa : ''
        if (fa) {
          const formatted = formatNumberDisplay(nextValue.v, fa)
          if (formatted) nextValue.m = formatted
        }
        return { ...cell, v: nextValue }
      })
    }
    return nextSheet
  })
}

function getFilename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || 'preview.xlsx'
}

export interface XlsxFortunePreviewOverlayProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  loadXlsxData: (path: string) => Promise<Uint8Array>
  theme?: 'light' | 'dark'
}

export function XlsxFortunePreviewOverlay({
  isOpen,
  onClose,
  filePath,
  loadXlsxData,
  theme = 'light',
}: XlsxFortunePreviewOverlayProps) {
  const workbookRef = useRef<WorkbookInstance | null>(null)
  const [key, setKey] = useState(0)
  const [sheets, setSheets] = useState<Sheet[]>([{ name: 'Loading...' } as Sheet])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    const loadWorkbook = async () => {
      setIsLoading(true)
      setError(null)
      setSheets([{ name: 'Loading...' } as Sheet])
      try {
        const rawPayload: unknown = await loadXlsxData(filePath)
        const workbookInput = await prepareWorkbookInput(filePath, rawPayload)
        if (workbookInput.kind === 'sheets') {
          const normalizedSheets = normalizeFortuneSheets(workbookInput.sheets) as Sheet[]
          if (!cancelled) {
            setSheets(normalizedSheets)
            setKey((k) => k + 1)
          }
        } else {
          await transformExcelToFortune(workbookInput.file, (nextSheets: unknown) => {
            const normalizedSheets = normalizeFortuneSheets(nextSheets)
            if (!cancelled) setSheets(normalizedSheets as Sheet[])
          }, setKey, workbookRef)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workbook')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadWorkbook()
    return () => {
      cancelled = true
    }
  }, [isOpen, filePath, loadXlsxData])

  return (
    <PreviewOverlay
      isOpen={isOpen}
      onClose={onClose}
      theme={theme}
      typeBadge={{
        icon: FileSpreadsheet,
        label: 'Excel',
        variant: 'green',
      }}
      filePath={filePath}
      error={error ? { label: 'Load Failed', message: error } : undefined}
    >
      <div className="min-h-full w-full flex items-center justify-center px-6 py-4">
        {isLoading && !error ? (
          <div className="text-sm text-muted-foreground">Loading spreadsheet...</div>
        ) : (
          <div className="w-full h-[min(82vh,820px)] overflow-hidden rounded-lg border border-border bg-background">
            <Workbook
              key={key}
              data={sheets}
              ref={workbookRef}
              allowEdit={false}
              showToolbar={false}
              showFormulaBar={false}
              showSheetTabs={true}
            />
          </div>
        )}
      </div>
    </PreviewOverlay>
  )
}
