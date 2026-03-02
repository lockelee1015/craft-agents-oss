import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { PreviewOverlay } from '@craft-agent/ui'

type PptxViewerInstance = {
  load: (source: ArrayBuffer | string | File) => Promise<void>
  destroy: () => void
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export interface PptxVisualPreviewOverlayProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  loadPptxData: (path: string) => Promise<Uint8Array>
  theme?: 'light' | 'dark'
}

export function PptxVisualPreviewOverlay({
  isOpen,
  onClose,
  filePath,
  loadPptxData,
  theme = 'light',
}: PptxVisualPreviewOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<PptxViewerInstance | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const cleanupViewer = () => {
      try {
        viewerRef.current?.destroy()
      } catch {
        // Ignore cleanup errors.
      }
      viewerRef.current = null
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
    }

    const load = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const container = containerRef.current
        if (!container) {
          throw new Error('PPTX preview container not ready')
        }

        const [{ PPTXViewer }, bytes] = await Promise.all([
          import('pptx-viewer'),
          loadPptxData(filePath),
        ])

        if (cancelled) return

        cleanupViewer()

        const viewer = new PPTXViewer(container, {
          showControls: true,
          keyboardNavigation: true,
        }) as PptxViewerInstance

        viewerRef.current = viewer
        await viewer.load(toArrayBuffer(bytes))

        if (!cancelled) {
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render PPTX preview')
          setIsLoading(false)
          cleanupViewer()
        }
      }
    }

    load()

    return () => {
      cancelled = true
      cleanupViewer()
    }
  }, [isOpen, filePath, loadPptxData])

  const canvasBgClass = theme === 'dark' ? 'bg-[#111318]' : 'bg-white'

  return (
    <PreviewOverlay
      isOpen={isOpen}
      onClose={onClose}
      filePath={filePath}
      typeBadge={{ icon: FileText, label: 'PowerPoint', variant: 'orange' }}
      theme={theme}
      error={error ? { label: 'Load Failed', message: error } : undefined}
      className="bg-background"
    >
      <div className="px-6 pb-6">
        <div className="mx-auto w-full max-w-[1400px]">
          <div
            className={`relative min-h-[72vh] h-[72vh] w-full overflow-auto rounded-xl border border-border/60 ${canvasBgClass}`}
          >
            {isLoading && (
              <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground z-10">
                Loading presentation...
              </div>
            )}
            <div ref={containerRef} className="h-full w-full" />
          </div>
        </div>
      </div>
    </PreviewOverlay>
  )
}
