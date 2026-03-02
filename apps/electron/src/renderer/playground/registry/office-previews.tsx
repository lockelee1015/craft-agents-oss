import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentEntry } from './types'
import {
  PDFPreviewOverlay,
} from '@craft-agent/ui'
import type { Sheet } from '@fortune-sheet/core'
import { Workbook, type WorkbookInstance } from '@fortune-sheet/react'
import { transformExcelToFortune } from '@corbe30/fortune-excel'
import '@fortune-sheet/react/dist/index.css'
import samplePdfUrl from '@/assets/samples/sample-invoice.pdf?url'
import sampleXlsxUrl from '@/assets/samples/enterprise-office-preview-rich.xlsx?url'
import { PptxVisualPreviewOverlay } from '@/components/files/PptxVisualPreviewOverlay'
import { DocxVisualPreviewOverlay } from '@/components/files/DocxVisualPreviewOverlay'

async function readBinaryFromElectron(path: string): Promise<Uint8Array> {
  const reader = window.electronAPI?.readFileBinary
  if (!reader) {
    throw new Error('readFileBinary is unavailable in browser playground mode. Run this story inside Electron.')
  }
  return reader(path)
}

type FortuneCellData = {
  m?: unknown
  v?: unknown
  ct?: { fa?: string; t?: string }
}

type FortuneCellRecord = { r?: number; c?: number; v?: FortuneCellData }

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

function OfficeDocxPreviewStory({
  filePath,
}: {
  filePath: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const loadDocxData = useCallback(async (path: string) => {
    return readBinaryFromElectron(path)
  }, [])

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
      >
        Open DOCX Preview
      </button>
      <DocxVisualPreviewOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        filePath={filePath}
        loadDocxData={loadDocxData}
      />
    </div>
  )
}

function OfficePptxPreviewStory({
  filePath,
}: {
  filePath: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const loadPptxData = useCallback(async (path: string) => {
    return readBinaryFromElectron(path)
  }, [])

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
      >
        Open PPTX Visual Preview
      </button>
      <PptxVisualPreviewOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        filePath={filePath}
        loadPptxData={loadPptxData}
      />
    </div>
  )
}

function OfficeConvertedPdfStory({ filePath }: { filePath: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const loadPdfData = useCallback(async () => {
    const res = await fetch(samplePdfUrl)
    if (!res.ok) throw new Error(`Failed to fetch sample PDF: ${res.status}`)
    const ab = await res.arrayBuffer()
    return new Uint8Array(ab)
  }, [])

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
      >
        Open Converted PDF Preview
      </button>
      <PDFPreviewOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        filePath={filePath}
        loadPdfData={loadPdfData}
      />
    </div>
  )
}

function OfficeXlsxPreviewStory({ filePath }: { filePath: string }) {
  const workbookRef = useRef<WorkbookInstance | null>(null)
  const [key, setKey] = useState(0)
  const [sheets, setSheets] = useState<Sheet[]>([{ name: 'Loading...' } as Sheet])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadWorkbook = async () => {
      try {
        setError(null)
        const res = await fetch(sampleXlsxUrl)
        if (!res.ok) throw new Error(`Failed to fetch XLSX fixture: ${res.status}`)
        const buffer = await res.arrayBuffer()
        const filename = filePath.split('/').pop() || 'preview.xlsx'
        const file = new File([buffer], filename, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        await transformExcelToFortune(file, (nextSheets: unknown) => {
          const normalizedSheets = normalizeFortuneSheets(nextSheets)
          if (!cancelled) setSheets(normalizedSheets as Sheet[])
        }, setKey, workbookRef)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workbook')
        }
      }
    }
    loadWorkbook()
    return () => {
      cancelled = true
    }
  }, [filePath])

  return (
    <div className="p-4 w-full h-[620px]">
      <div className="mb-2 text-xs text-muted-foreground truncate">{filePath}</div>
      <div className="w-full h-[560px] border border-border rounded-lg overflow-hidden bg-background">
        {error ? (
          <div className="h-full w-full grid place-items-center text-sm text-destructive p-6 text-center">
            {error}
          </div>
        ) : (
          <Workbook
            key={key}
            data={sheets}
            ref={workbookRef}
            allowEdit={false}
            showToolbar={false}
            showFormulaBar={false}
            showSheetTabs={true}
          />
        )}
      </div>
    </div>
  )
}

export const officePreviewComponents: ComponentEntry[] = [
  {
    id: 'office-preview-docx',
    name: 'Office Preview - DOCX',
    category: 'Fullscreen',
    description: 'DOCX visual preview using docx-preview (same rendering path as production).',
    component: OfficeDocxPreviewStory,
    props: [
      {
        name: 'filePath',
        description: 'Absolute .docx path to open with visual renderer',
        control: { type: 'string', placeholder: '/path/to/spec.docx' },
        defaultValue: '/Users/lichao/Documents/sample.docx',
      },
    ],
    variants: [
      {
        name: 'Default Path',
        description: 'Open a local docx file via renderer IPC binary read',
        props: {
          filePath: '/Users/lichao/Documents/sample.docx',
        },
      },
    ],
  },
  {
    id: 'office-preview-pptx',
    name: 'Office Preview - PPTX',
    category: 'Fullscreen',
    description: 'PPTX visual preview using pptx-viewer (same rendering path as production).',
    component: OfficePptxPreviewStory,
    props: [
      {
        name: 'filePath',
        description: 'Absolute .pptx path to open with visual renderer',
        control: { type: 'string', placeholder: '/path/to/deck.pptx' },
        defaultValue: '/Users/lichao/Documents/sample.pptx',
      },
    ],
    variants: [
      {
        name: 'Visual Slides',
        description: 'Open a local pptx file via renderer IPC binary read',
        props: {
          filePath: '/Users/lichao/Documents/sample.pptx',
        },
      },
      {
        name: 'Alternate Deck Path',
        description: 'Different local path to validate file loading behavior',
        props: {
          filePath: '/Users/demo/decks/engineering-roadmap-q3.pptx',
        },
      },
    ],
  },
  {
    id: 'office-preview-converted-pdf',
    name: 'Office Preview - Converted PDF',
    category: 'Fullscreen',
    description: 'Fallback rendering story: office document converted to PDF then shown in PDF overlay.',
    component: OfficeConvertedPdfStory,
    props: [
      {
        name: 'filePath',
        description: 'The virtual converted PDF path shown in the overlay',
        control: { type: 'string', placeholder: '/path/to/converted.pdf' },
        defaultValue: '/Users/demo/.craft-agent/cache/office/q2-pricing-strategy.pdf',
      },
    ],
  },
  {
    id: 'office-preview-xlsx',
    name: 'Office Preview - XLSX',
    category: 'Fullscreen',
    description: 'XLSX visual preview powered by FortuneSheet (FortuneExcel import path).',
    component: OfficeXlsxPreviewStory,
    layout: 'top',
    props: [
      {
        name: 'filePath',
        description: 'Original xlsx file path (UI label); rendering uses FortuneSheet import of XLSX fixture.',
        control: { type: 'string', placeholder: '/path/to/file.xlsx' },
        defaultValue: '/Users/lichao/.codex/worktrees/8aca/craft-agents-oss/output/spreadsheet/enterprise-office-preview-rich.xlsx',
      },
    ],
    variants: [
      {
        name: 'Assumptions Sheet',
        description: 'Financial model assumptions with formatting and sheet tabs',
        props: {
          filePath: '/Users/lichao/.codex/worktrees/8aca/craft-agents-oss/output/spreadsheet/enterprise-office-preview-rich.xlsx',
        },
      },
      {
        name: 'Workbook Path Alias',
        description: 'Same visual workbook, different displayed source path',
        props: {
          filePath: '/Users/demo/models/enterprise-office-preview-rich.xlsx',
        },
      },
    ],
  },
]
