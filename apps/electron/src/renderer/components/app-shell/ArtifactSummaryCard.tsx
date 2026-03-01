import * as React from 'react'
import { AlertTriangle, File, FileCode, FileText, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ArtifactSummary } from '../../../shared/types'

export interface ArtifactSummaryCardProps {
  artifacts: ArtifactSummary[]
  onOpenFile: (path: string) => void
  className?: string
}

export function shouldRenderArtifactSummaryCard(artifacts?: ArtifactSummary[]): boolean {
  return Array.isArray(artifacts) && artifacts.length > 0
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > -1 ? name.slice(idx + 1).toLowerCase() : ''
}

function getArtifactTypeLabel(ext: string): string {
  if (!ext) return 'File'
  if (ext === 'pdf') return 'PDF'
  if (ext === 'md' || ext === 'markdown') return 'Markdown'
  if (ext === 'doc' || ext === 'docx') return 'Document'
  if (ext === 'ppt' || ext === 'pptx' || ext === 'key') return 'Presentation'
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv' || ext === 'tsv') return 'Spreadsheet'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'Image'
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'sh', 'rb'].includes(ext)) return 'Code'
  return ext.toUpperCase()
}

type ArtifactVisual = {
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  chipClassName: string
}

function getArtifactVisual(ext: string): ArtifactVisual {
  if (ext === 'pdf') {
    return {
      icon: FileText,
      iconClassName: 'text-rose-600',
      chipClassName: 'bg-rose-100 dark:bg-rose-950/40',
    }
  }

  if (ext === 'md' || ext === 'markdown') {
    return {
      icon: FileText,
      iconClassName: 'text-blue-600',
      chipClassName: 'bg-blue-100 dark:bg-blue-950/40',
    }
  }

  if (ext === 'ppt' || ext === 'pptx' || ext === 'key') {
    return {
      icon: FileText,
      iconClassName: 'text-orange-600',
      chipClassName: 'bg-orange-100 dark:bg-orange-950/40',
    }
  }

  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv' || ext === 'tsv') {
    return {
      icon: FileText,
      iconClassName: 'text-emerald-600',
      chipClassName: 'bg-emerald-100 dark:bg-emerald-950/40',
    }
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return {
      icon: ImageIcon,
      iconClassName: 'text-cyan-600',
      chipClassName: 'bg-cyan-100 dark:bg-cyan-950/40',
    }
  }

  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'sh', 'rb'].includes(ext)) {
    return {
      icon: FileCode,
      iconClassName: 'text-violet-600',
      chipClassName: 'bg-violet-100 dark:bg-violet-950/40',
    }
  }

  return {
    icon: File,
    iconClassName: 'text-muted-foreground',
    chipClassName: 'bg-muted/60',
  }
}

export function ArtifactSummaryCard({ artifacts, onOpenFile, className }: ArtifactSummaryCardProps) {
  if (!shouldRenderArtifactSummaryCard(artifacts)) return null

  return (
    <div className={cn('mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2', className)}>
      {artifacts.map((artifact) => {
        const ext = getFileExtension(artifact.name)
        const typeLabel = getArtifactTypeLabel(ext)
        const visual = getArtifactVisual(ext)
        const Icon = visual.icon
        const cardLabel = artifact.title || artifact.name
        const metaText = `${typeLabel} · ${formatFileSize(artifact.size)}`

        return (
          <button
            key={artifact.path}
            type="button"
            data-artifact-card="true"
            className={cn(
              'w-full rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-left shadow-sm transition-colors',
              artifact.exists ? 'hover:bg-muted/35 hover:border-border/80' : 'cursor-default opacity-70'
            )}
            onClick={() => {
              if (artifact.exists) onOpenFile(artifact.path)
            }}
            title={artifact.path}
            disabled={!artifact.exists}
          >
            <div className="flex items-center gap-3">
              <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', visual.chipClassName)}>
                <Icon className={cn('h-5 w-5', visual.iconClassName)} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground" title={cardLabel}>
                  {cardLabel}
                </p>
                <p className="text-xs text-muted-foreground">{metaText}</p>
                {!artifact.exists && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    File missing
                  </p>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
