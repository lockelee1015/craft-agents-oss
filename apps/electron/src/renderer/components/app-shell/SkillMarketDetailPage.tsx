import * as React from 'react'
import { Button } from '@/components/ui/button'
import { InstallSkillDialog } from './InstallSkillDialog'
import { PanelHeader } from './PanelHeader'
import type { MarketSkillDetail } from '../../../shared/types'

interface SkillMarketDetailPageProps {
  workspaceId: string
  marketId: string
  onInstalled?: (slug: string) => void
}

export function SkillMarketDetailPage({ workspaceId, marketId, onInstalled }: SkillMarketDetailPageProps) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<MarketSkillDetail | null>(null)
  const [installOpen, setInstallOpen] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await window.electronAPI.getMarketSkillDetail(marketId)
        if (!cancelled) setDetail(result)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load detail')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [marketId])

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading market detail...</div>
  if (error) return <div className="p-4 text-sm text-destructive">{error}</div>
  if (!detail) return <div className="p-4 text-sm text-muted-foreground">No detail available.</div>

  return (
    <div className="h-full flex flex-col min-h-0">
      <PanelHeader
        title={detail.name}
        actions={(
          <Button
            className="titlebar-no-drag"
            onClick={() => setInstallOpen(true)}
          >
            Install
          </Button>
        )}
      />

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="rounded-md border p-3 space-y-1 text-xs text-muted-foreground">
          <div>ID: {detail.id}</div>
          <div>Repo: {detail.repoUrl ?? 'Unavailable'}</div>
          <div>Weekly installs: {detail.installs ?? 'N/A'}</div>
          <div>Stars: {detail.stars ?? 'N/A'}</div>
          <div>First seen: {detail.firstSeen ?? 'N/A'}</div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div>alwaysAllow: {detail.parsedRisk.alwaysAllow.join(', ') || 'none'}</div>
          <div>requiredSources: {detail.parsedRisk.requiredSources.join(', ') || 'none'}</div>
          <div>globs: {detail.parsedRisk.globs.join(', ') || 'none'}</div>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">SKILL.md Preview</div>
          <pre className="max-h-[65vh] overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {detail.skillMarkdown ?? 'No preview available.'}
          </pre>
        </div>
      </div>

      <InstallSkillDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        workspaceId={workspaceId}
        marketId={marketId}
        onInstalled={onInstalled}
      />
    </div>
  )
}
