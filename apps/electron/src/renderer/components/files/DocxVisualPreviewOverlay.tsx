import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { PreviewOverlay } from '@craft-agent/ui'

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export interface DocxVisualPreviewOverlayProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  loadDocxData: (path: string) => Promise<Uint8Array>
  theme?: 'light' | 'dark'
}

export function DocxVisualPreviewOverlay({
  isOpen,
  onClose,
  filePath,
  loadDocxData,
  theme = 'light',
}: DocxVisualPreviewOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const load = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const container = containerRef.current
        if (!container) {
          throw new Error('DOCX preview container not ready')
        }

        container.innerHTML = ''

        const [{ renderAsync }, bytes] = await Promise.all([
          import('docx-preview'),
          loadDocxData(filePath),
        ])

        if (cancelled) return

        const blob = new Blob([toArrayBuffer(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })

        await renderAsync(blob, container, container, {
          className: 'docx-viewer',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          renderComments: false,
          renderChanges: false,
        })

        if (!cancelled) {
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render DOCX preview')
          setIsLoading(false)
          if (containerRef.current) containerRef.current.innerHTML = ''
        }
      }
    }

    load()

    return () => {
      cancelled = true
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }
  }, [isOpen, filePath, loadDocxData])

  const canvasBgClass = theme === 'dark' ? 'bg-[#121418]' : 'bg-white'

  return (
    <PreviewOverlay
      isOpen={isOpen}
      onClose={onClose}
      filePath={filePath}
      typeBadge={{ icon: FileText, label: 'Word', variant: 'blue' }}
      theme={theme}
      error={error ? { label: 'Load Failed', message: error } : undefined}
      className="bg-background"
    >
      <div className="px-6 pb-6">
        <div className="mx-auto w-full max-w-[1200px]">
          <div
            className={`relative min-h-[72vh] h-[72vh] w-full overflow-auto rounded-xl border border-border/60 ${canvasBgClass}`}
          >
            {isLoading && (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground z-10">
                Loading document...
              </div>
            )}
            <div ref={containerRef} className="h-full w-full p-6" />
          </div>
        </div>
      </div>
    </PreviewOverlay>
  )
}
