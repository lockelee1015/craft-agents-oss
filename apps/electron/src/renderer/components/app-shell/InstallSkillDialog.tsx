import * as React from 'react'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ConflictResult, InstallScope, MarketInstallProgress, MarketInstallProgressStage, MarketSkillDetail } from '../../../shared/types'

interface InstallSkillDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  marketId: string | null
  onInstalled?: (slug: string) => void
}

const INSTALL_STEPS: Array<{ stage: MarketInstallProgressStage; label: string }> = [
  { stage: 'prepare', label: 'Prepare' },
  { stage: 'fetchDetail', label: 'Fetch detail' },
  { stage: 'cloneRepo', label: 'Clone repository' },
  { stage: 'locateSkill', label: 'Locate skill' },
  { stage: 'backupExisting', label: 'Backup existing skill' },
  { stage: 'copyFiles', label: 'Copy files' },
  { stage: 'writeMetadata', label: 'Write metadata' },
  { stage: 'completed', label: 'Completed' },
]

export function InstallSkillDialog({
  open,
  onOpenChange,
  workspaceId,
  marketId,
  onInstalled,
}: InstallSkillDialogProps) {
  const [scope, setScope] = React.useState<InstallScope>('workspace')
  const [loadingDetail, setLoadingDetail] = React.useState(false)
  const [installing, setInstalling] = React.useState(false)
  const [detail, setDetail] = React.useState<MarketSkillDetail | null>(null)
  const [conflict, setConflict] = React.useState<ConflictResult | null>(null)
  const [installProgress, setInstallProgress] = React.useState<MarketInstallProgress | null>(null)
  const installIdRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const unsubscribe = window.electronAPI.onMarketSkillInstallProgress((progress) => {
      if (!installIdRef.current || progress.installId !== installIdRef.current) return
      setInstallProgress(progress)
    })
    return unsubscribe
  }, [])

  React.useEffect(() => {
    if (open) return
    installIdRef.current = null
    setInstallProgress(null)
    setInstalling(false)
  }, [open])

  React.useEffect(() => {
    if (!open || !marketId) return
    const selectedMarketId = marketId
    let cancelled = false

    async function load() {
      setLoadingDetail(true)
      try {
        const result = await window.electronAPI.getMarketSkillDetail(selectedMarketId)
        if (cancelled) return
        setDetail(result)
      } catch (error) {
        if (cancelled) return
        toast.error('Failed to load market skill detail', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, marketId])

  React.useEffect(() => {
    if (!open || !detail) return
    const selectedDetail = detail
    let cancelled = false

    async function checkConflict() {
      try {
        const result = await window.electronAPI.checkMarketSkillConflict(workspaceId, scope, selectedDetail.skillId)
        if (!cancelled) setConflict(result)
      } catch {
        if (!cancelled) setConflict(null)
      }
    }

    checkConflict()
    return () => {
      cancelled = true
    }
  }, [open, workspaceId, scope, detail])

  const handleInstall = React.useCallback(async () => {
    if (!detail || !marketId) return
    const installId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    installIdRef.current = installId
    setInstallProgress({
      installId,
      stage: 'prepare',
      percent: 1,
      message: 'Preparing installation',
    })
    setInstalling(true)
    try {
      const result = await window.electronAPI.installMarketSkill({
        workspaceId,
        scope,
        marketSkillId: marketId,
        overwrite: conflict?.exists,
        installId,
      })
      toast.success(`Installed skill: ${result.slug}`)
      onOpenChange(false)
      onInstalled?.(result.slug)
    } catch (error) {
      setInstallProgress((prev) => prev ? {
        ...prev,
        stage: 'failed',
        percent: 100,
        message: 'Installation failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      } : null)
      toast.error('Failed to install skill', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setInstalling(false)
    }
  }, [detail, marketId, workspaceId, scope, conflict, onInstalled, onOpenChange])

  const progressPercent = Math.max(0, Math.min(100, Math.round(installProgress?.percent ?? 0)))
  const activeStepIndex = installProgress ? INSTALL_STEPS.findIndex((step) => step.stage === installProgress.stage) : -1

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && installing) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/60">
          <DialogTitle>Install Skill</DialogTitle>
          <DialogDescription>
            Review source and risk signals before installing third-party skills.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          {loadingDetail && (
            <div className="text-sm text-muted-foreground">Loading skill details...</div>
          )}

          {!loadingDetail && detail && (
            <div className="space-y-4">
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">{detail.name}</div>
                <div className="text-xs text-muted-foreground mt-1">{detail.id}</div>
                <div className="text-xs text-muted-foreground mt-1">Repo: {detail.repoUrl ?? 'Unavailable'}</div>
                {detail.stars != null && (
                  <div className="text-xs text-muted-foreground">Stars: {detail.stars}</div>
                )}
                {detail.installs != null && (
                  <div className="text-xs text-muted-foreground">Weekly installs: {detail.installs}</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Install scope</div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={scope === 'workspace' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScope('workspace')}
                  >
                    Workspace
                  </Button>
                  <Button
                    type="button"
                    variant={scope === 'global' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setScope('global')}
                  >
                    Global
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Global scope path: <code>~/.agents/skills</code>
                </div>
              </div>

              {installing && (
                <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {installProgress?.stage === 'failed' ? (
                        <XCircle className="h-4 w-4 text-destructive shrink-0" />
                      ) : installProgress?.stage === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                      ) : (
                        <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
                      )}
                      <div className="text-xs font-medium truncate">
                        {installProgress?.message ?? 'Installing...'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{progressPercent}%</div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full transition-[width] duration-300',
                        installProgress?.stage === 'failed' ? 'bg-destructive' : 'bg-foreground',
                      )}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {INSTALL_STEPS.map((step, index) => {
                      const isDone = activeStepIndex > index
                      const isActive = activeStepIndex === index
                      return (
                        <div key={step.stage} className="flex items-center gap-1.5 min-w-0">
                          {isDone ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                          ) : isActive ? (
                            <Loader2 className="h-3.5 w-3.5 text-foreground shrink-0 animate-spin" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                          )}
                          <span className={cn(
                            'text-[11px] truncate',
                            isDone || isActive ? 'text-foreground' : 'text-muted-foreground',
                          )}>
                            {step.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {conflict?.exists && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                  Conflict: {conflict.existingSkillName ?? detail.skillId} already exists at {conflict.targetPath}. Installing will create a backup and overwrite.
                </div>
              )}

              <div className="space-y-2">
                <div className="text-sm font-medium">Risk hints</div>
                <div className="text-xs text-muted-foreground">alwaysAllow: {detail.parsedRisk.alwaysAllow.join(', ') || 'none'}</div>
                <div className="text-xs text-muted-foreground">requiredSources: {detail.parsedRisk.requiredSources.join(', ') || 'none'}</div>
                <div className="text-xs text-muted-foreground">globs: {detail.parsedRisk.globs.join(', ') || 'none'}</div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">SKILL.md preview</div>
                <pre className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap break-words font-mono leading-5">
                  {detail.skillMarkdown ?? 'No preview available.'}
                </pre>
              </div>

              {detail.warnings.length > 0 && (
                <div className="space-y-1">
                  {detail.warnings.map((warning) => (
                    <div key={warning} className="text-xs text-amber-700 dark:text-amber-300">- {warning}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={installing}>Cancel</Button>
          <Button onClick={handleInstall} disabled={installing || !detail}>
            {installing ? 'Installing...' : conflict?.exists ? 'Install and Overwrite' : 'Install'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
