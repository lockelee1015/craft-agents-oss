import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import type { ComponentEntry } from './types'
import {
  DocumentFormattedMarkdownOverlay,
  PDFPreviewOverlay,
} from '@craft-agent/ui'
import type { Sheet } from '@fortune-sheet/core'
import { Workbook, type WorkbookInstance } from '@fortune-sheet/react'
import { transformExcelToFortune } from '@corbe30/fortune-excel'
import '@fortune-sheet/react/dist/index.css'
import samplePdfUrl from '@/assets/samples/sample-invoice.pdf?url'
import samplePptxPdfUrl from '@/assets/samples/sample-pptx-converted.pdf?url'
import sampleXlsxUrl from '@/assets/samples/enterprise-office-preview-rich.xlsx?url'

const docxSample = `# Product Requirements Document

## 1. Overview
This document defines the in-app Office preview capability for local files.

## 2. Goals
- Preview \`.docx\`, \`.pptx\`, \`.xlsx\` inside the app
- Keep fallback behavior predictable when parsing fails
- Reuse existing overlay UX patterns

## 3. Scope
### In Scope
- Open file path badges directly in preview mode
- Provide converted text view for Office files
- Provide PDF fallback rendering for high-fidelity layouts

### Out of Scope
- Rich editing of Office files
- Macro/VBA execution
- Password-protected documents

## 4. Acceptance Criteria
1. Preview opens in < 1s from warm cache.
2. Files larger than 20MB show clear fallback guidance.
3. "Open externally" and "Reveal in Finder" remain available.
`

const pptxSample = `# Enterprise Preview Suite 2026

## Slide 1 - Cover
- Title: **Enterprise Preview Suite 2026**
- Subtitle: Complex fixture for Office file preview validation
- Tags: DOCX + PPTX + XLSX, Preview QA Ready

## Slide 2 - Operational KPIs
- Avg Latency: **128 ms**
- Success Rate: **99.82%**
- Cost / Task: **$0.018**
- Throughput: **14,280 jobs/day**

## Slide 3 - Segment Revenue Mix
| Segment | ARR ($M) | YoY | Gross Margin | NDR |
| --- | ---: | ---: | ---: | ---: |
| Enterprise | 8.4 | 24% | 81% | 122% |
| Mid-Market | 5.1 | 19% | 77% | 117% |
| SMB | 2.9 | 13% | 71% | 108% |
| Public Sector | 1.8 | 28% | 74% | 129% |
| Total | 18.2 | 21% | 78% | 118% |

## Slide 4 - ARR Trend Chart
- Native clustered column chart with 3 series
- Categories: Q1, Q2, Q3, Q4
- Axis range: 0 - 10 ($M)

## Slide 5 - Execution Roadmap
1. Apr: Preview alpha
2. May: Policy rollout
3. Jun: Latency reduction
4. Jul: Regional launch
5. Aug: Enterprise GA

## Slide 6 - Preview Pipeline Architecture
- Ingestion: file type sniffing, metadata extraction
- Normalization: office-to-markdown, formula-preserving parse
- Rendering: overlay UI render, PDF fallback, thumbnail cache

## Slide 7 - Image-heavy Scenario
- Full-width dashboard image
- Customer quote card with NPS impact: **+9**
- Large media block + side narrative panel

## Slide 8 - Risk Register
- Formula parser drift -> golden-sheet regression suite
- Fallback timeout risk -> async conversion queue
- Theme inconsistency -> tokenized style map
`

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
  content,
  filePath,
}: {
  content: string
  filePath: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
      >
        Open DOCX Preview
      </button>
      <DocumentFormattedMarkdownOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        content={content}
        filePath={filePath}
        typeBadge={{ icon: FileText, label: 'Word', variant: 'blue' }}
        onOpenFile={(path) => console.log('[Playground] Open file:', path)}
        onOpenUrl={(url) => console.log('[Playground] Open URL:', url)}
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
  const loadPdfData = useCallback(async (_path: string) => {
    const res = await fetch(samplePptxPdfUrl)
    if (!res.ok) throw new Error(`Failed to fetch converted PPTX PDF: ${res.status}`)
    const ab = await res.arrayBuffer()
    return new Uint8Array(ab)
  }, [])

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
      >
        Open PPTX Visual Preview
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

function OfficePptxOutlineFallbackStory({
  content,
  filePath,
}: {
  content: string
  filePath: string
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="p-8">
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90"
      >
        Open PPTX Outline Fallback
      </button>
      <DocumentFormattedMarkdownOverlay
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        content={content}
        filePath={filePath}
        typeBadge={{ icon: FileText, label: 'PowerPoint (Outline)', variant: 'orange' }}
        onOpenFile={(path) => console.log('[Playground] Open file:', path)}
        onOpenUrl={(url) => console.log('[Playground] Open URL:', url)}
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
    description: 'DOCX preview story using markdown-converted content in a fullscreen document overlay.',
    component: OfficeDocxPreviewStory,
    props: [
      {
        name: 'filePath',
        description: 'Original office file path shown in overlay header',
        control: { type: 'string', placeholder: '/path/to/spec.docx' },
        defaultValue: '/Users/demo/docs/product-requirements.docx',
      },
      {
        name: 'content',
        description: 'Converted markdown content for display',
        control: { type: 'textarea', rows: 14 },
        defaultValue: docxSample,
      },
    ],
    variants: [
      {
        name: 'PRD',
        description: 'Product requirement document style content',
        props: {
          filePath: '/Users/demo/docs/product-requirements.docx',
          content: docxSample,
        },
      },
      {
        name: 'Contract',
        description: 'Legal/contract-like structure',
        props: {
          filePath: '/Users/demo/docs/msa-contract.docx',
          content: '# Master Service Agreement\n\n## Parties\nThis agreement is made between **Customer** and **Provider**.\n\n## Terms\n- Effective date: 2026-03-01\n- Initial term: 12 months\n- Auto-renewal: 12 months unless terminated with 30 days notice\n\n## Billing\n1. Monthly billing in USD.\n2. Net 30 payment terms.\n3. Late fees may apply after due date.\n\n## Security\nProvider maintains SOC 2 controls and annual penetration testing.\n',
        },
      },
    ],
  },
  {
    id: 'office-preview-pptx',
    name: 'Office Preview - PPTX',
    category: 'Fullscreen',
    description: 'PPTX visual preview using converted PDF pages (looks like actual slides).',
    component: OfficePptxPreviewStory,
    props: [
      {
        name: 'filePath',
        description: 'Original presentation path shown in overlay header (PDF rendered behind the scenes)',
        control: { type: 'string', placeholder: '/path/to/deck.pptx' },
        defaultValue: '/Users/lichao/.codex/worktrees/8aca/craft-agents-oss/output/pptx/enterprise-office-preview-rich.pptx',
      },
    ],
    variants: [
      {
        name: 'Visual Slides',
        description: 'Slide-like page rendering for PPTX preview',
        props: {
          filePath: '/Users/lichao/.codex/worktrees/8aca/craft-agents-oss/output/pptx/enterprise-office-preview-rich.pptx',
        },
      },
      {
        name: 'Alternate Deck Path',
        description: 'Header path swap while keeping visual rendering behavior',
        props: {
          filePath: '/Users/demo/decks/engineering-roadmap-q3.pptx',
        },
      },
    ],
  },
  {
    id: 'office-preview-pptx-outline',
    name: 'Office Preview - PPTX Outline Fallback',
    category: 'Fullscreen',
    description: 'Fallback when visual conversion fails: markdown outline extracted from PPTX.',
    component: OfficePptxOutlineFallbackStory,
    props: [
      {
        name: 'filePath',
        description: 'Original presentation path shown in overlay header',
        control: { type: 'string', placeholder: '/path/to/deck.pptx' },
        defaultValue: '/Users/lichao/.codex/worktrees/8aca/craft-agents-oss/output/pptx/enterprise-office-preview-rich.pptx',
      },
      {
        name: 'content',
        description: 'Extracted slide text rendered as markdown',
        control: { type: 'textarea', rows: 14 },
        defaultValue: pptxSample,
      },
    ],
    variants: [
      {
        name: 'Outline',
        description: 'Text-only fallback for conversion failures',
        props: {
          filePath: '/Users/lichao/.codex/worktrees/8aca/craft-agents-oss/output/pptx/enterprise-office-preview-rich.pptx',
          content: pptxSample,
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
