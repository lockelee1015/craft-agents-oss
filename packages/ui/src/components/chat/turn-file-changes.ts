import { normalizePath, pathStartsWith, stripPathPrefix } from '@craft-agent/core/utils'
import { parseDiffFromFile, type FileContents } from '@pierre/diffs'
import { getDiffStats, getUnifiedDiffStats } from '../code-viewer'

export interface EditWriteActivityLike {
  status: string
  toolName?: string
  toolInput?: Record<string, unknown>
}

export interface TurnFileChangeSummary {
  /** Absolute or relative file path from tool input */
  path: string
  /** Path with session/workspace prefix stripped for display */
  displayPath: string
  /** Basename for compact badge display */
  fileName: string
  /** File extension label (e.g. TS, MD, FILE) */
  extensionLabel: string
  /** Aggregated line additions across this turn */
  additions: number
  /** Aggregated line deletions across this turn */
  deletions: number
  /** Best-effort signal that at least one change created a new file */
  isNew: boolean
}

/**
 * Strip session/workspace folder paths from file paths for cleaner display.
 * Only strips paths that match the current session folder path.
 * Example: /path/to/sessions/260121-foo/plans/file.md → plans/file.md
 */
export function stripSessionFolderPath(filePath: string, sessionFolderPath?: string): string {
  if (!sessionFolderPath) return filePath

  // Get workspace path (parent of sessions folder)
  // sessionFolderPath: /path/workspaces/{uuid}/sessions/{sessionId}
  const workspacePath = normalizePath(sessionFolderPath).replace(/\/sessions\/[^/]+$/, '')

  // Try session folder first (more specific)
  if (pathStartsWith(filePath, sessionFolderPath)) {
    return stripPathPrefix(filePath, sessionFolderPath)
  }

  // Then try workspace folder
  if (pathStartsWith(filePath, workspacePath)) {
    return stripPathPrefix(filePath, workspacePath)
  }

  return filePath
}

/**
 * Compute diff stats for Edit/Write tool inputs.
 * Supports both:
 * - Claude Code format: { file_path, old_string, new_string }
 * - Codex format: { changes: Array<{ path, kind, diff }> }
 */
export function computeEditWriteDiffStats(
  toolName: string | undefined,
  toolInput: Record<string, unknown> | undefined
): { additions: number; deletions: number } | null {
  if (!toolInput) return null

  if (toolName === 'Edit') {
    // Check for Codex format: { changes: Array<{ path, kind, diff }> }
    if (toolInput.changes && Array.isArray(toolInput.changes)) {
      let totalAdditions = 0
      let totalDeletions = 0
      for (const change of toolInput.changes as Array<{ path?: string; diff?: string }>) {
        if (change.diff) {
          const stats = getUnifiedDiffStats(change.diff, change.path || 'file')
          if (stats) {
            totalAdditions += stats.additions
            totalDeletions += stats.deletions
          }
        }
      }
      if (totalAdditions === 0 && totalDeletions === 0) return null
      return { additions: totalAdditions, deletions: totalDeletions }
    }

    // Claude Code format: { file_path, old_string, new_string }
    const oldString = (toolInput.old_string as string) ?? ''
    const newString = (toolInput.new_string as string) ?? ''
    if (!oldString && !newString) return null

    const oldFile: FileContents = { name: 'file', contents: oldString, lang: 'text' }
    const newFile: FileContents = { name: 'file', contents: newString, lang: 'text' }
    const fileDiff = parseDiffFromFile(oldFile, newFile)
    return getDiffStats(fileDiff)
  }

  if (toolName === 'Write') {
    const content = (toolInput.content as string) ?? ''
    if (!content) return null

    // For Write, everything is an addition (new file content)
    const oldFile: FileContents = { name: 'file', contents: '', lang: 'text' }
    const newFile: FileContents = { name: 'file', contents: content, lang: 'text' }
    const fileDiff = parseDiffFromFile(oldFile, newFile)
    return getDiffStats(fileDiff)
  }

  return null
}

function getFileExtensionLabel(fileName: string): string {
  const normalized = normalizePath(fileName)
  const baseName = normalized.split('/').pop() || normalized
  const dotIndex = baseName.lastIndexOf('.')
  if (dotIndex > 0 && dotIndex < baseName.length - 1) {
    return baseName.slice(dotIndex + 1, dotIndex + 5).toUpperCase()
  }
  if (baseName.length > 0 && baseName.length <= 4) {
    return baseName.toUpperCase()
  }
  return 'FILE'
}

function isAddedKind(kind: unknown): boolean {
  if (typeof kind !== 'string') return false
  return /^(add|added|new|create|created)$/i.test(kind.trim())
}

/**
 * Build per-file change summary for a single assistant turn.
 * Includes all completed Edit/Write tool calls in the turn.
 */
export function computeTurnFileChanges(
  activities: EditWriteActivityLike[],
  sessionFolderPath?: string
): TurnFileChangeSummary[] {
  const fileMap = new Map<string, TurnFileChangeSummary & { firstSeen: number }>()

  const upsertFile = (rawPath: string, firstSeen: number): TurnFileChangeSummary & { firstSeen: number } => {
    const normalizedPath = normalizePath(rawPath)
    const existing = fileMap.get(normalizedPath)
    if (existing) return existing

    const fileName = normalizedPath.split('/').pop() || normalizedPath
    const summary: TurnFileChangeSummary & { firstSeen: number } = {
      path: normalizedPath,
      displayPath: stripSessionFolderPath(normalizedPath, sessionFolderPath),
      fileName,
      extensionLabel: getFileExtensionLabel(fileName),
      additions: 0,
      deletions: 0,
      isNew: false,
      firstSeen,
    }
    fileMap.set(normalizedPath, summary)
    return summary
  }

  activities.forEach((activity, activityIndex) => {
    if (activity.status !== 'completed') return
    if (activity.toolName !== 'Edit' && activity.toolName !== 'Write') return

    const input = activity.toolInput
    if (!input) return

    const codexChanges = Array.isArray(input.changes)
      ? input.changes as Array<{ path?: unknown; kind?: unknown; diff?: unknown }>
      : []

    if (codexChanges.length > 0) {
      codexChanges.forEach((change) => {
        const changePath = typeof change.path === 'string' ? change.path : ''
        if (!changePath) return

        const file = upsertFile(changePath, activityIndex)
        file.isNew = file.isNew || isAddedKind(change.kind)

        if (typeof change.diff === 'string' && change.diff.trim().length > 0) {
          const stats = getUnifiedDiffStats(change.diff, file.path)
          if (stats) {
            file.additions += stats.additions
            file.deletions += stats.deletions
          }
        }
      })
      return
    }

    if (typeof input.file_path === 'string' && input.file_path.trim().length > 0) {
      const file = upsertFile(input.file_path, activityIndex)
      const stats = computeEditWriteDiffStats(activity.toolName, input)
      if (stats) {
        file.additions += stats.additions
        file.deletions += stats.deletions
      }
    }
  })

  return Array.from(fileMap.values())
    .sort((a, b) => {
      if (a.firstSeen !== b.firstSeen) return a.firstSeen - b.firstSeen
      return a.displayPath.localeCompare(b.displayPath)
    })
    .map(({ firstSeen: _firstSeen, ...summary }) => summary)
}
