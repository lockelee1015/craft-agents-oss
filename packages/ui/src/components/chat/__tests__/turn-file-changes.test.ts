import { describe, it, expect } from 'bun:test'
import { computeTurnFileChanges } from '../turn-file-changes'
import type { ActivityItem } from '../TurnCard'

function createActivity(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: `activity-${Math.random().toString(36).slice(2)}`,
    type: 'tool',
    status: 'completed',
    toolName: 'Write',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('computeTurnFileChanges', () => {
  it('aggregates repeated edits/writes for the same file', () => {
    const activities: ActivityItem[] = [
      createActivity({
        toolName: 'Write',
        toolInput: {
          file_path: '/repo/src/app.ts',
          content: 'line1\nline2\n',
        },
      }),
      createActivity({
        toolName: 'Edit',
        toolInput: {
          file_path: '/repo/src/app.ts',
          old_string: 'line2\n',
          new_string: 'line2-updated\nline3\n',
        },
      }),
    ]

    const result = computeTurnFileChanges(activities)
    expect(result).toHaveLength(1)

    const file = result[0]
    expect(file?.path).toBe('/repo/src/app.ts')
    expect(file?.fileName).toBe('app.ts')
    expect(file?.extensionLabel).toBe('TS')
    expect((file?.additions || 0) > 0).toBe(true)
    expect((file?.deletions || 0) > 0).toBe(true)
  })

  it('supports codex changes[] format and detects added files', () => {
    const activities: ActivityItem[] = [
      createActivity({
        toolName: 'Edit',
        toolInput: {
          changes: [
            {
              path: '/workspace/src/new-file.ts',
              kind: 'added',
              diff: `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+export const value = 1
+export default value
`,
            },
            {
              path: '/workspace/src/existing.ts',
              kind: 'modified',
              diff: `diff --git a/src/existing.ts b/src/existing.ts
--- a/src/existing.ts
+++ b/src/existing.ts
@@ -1 +1 @@
-export const oldValue = 1
+export const oldValue = 2
`,
            },
          ],
        },
      }),
    ]

    const result = computeTurnFileChanges(activities, '/workspace/sessions/20260304-abc')
    expect(result).toHaveLength(2)

    const added = result.find(f => f.fileName === 'new-file.ts')
    expect(added?.isNew).toBe(true)
    expect(added?.displayPath).toBe('src/new-file.ts')
    expect(added?.additions).toBe(2)
    expect(added?.deletions).toBe(0)

    const modified = result.find(f => f.fileName === 'existing.ts')
    expect(modified?.isNew).toBe(false)
    expect(modified?.additions).toBe(1)
    expect(modified?.deletions).toBe(1)
  })

  it('ignores non-completed activities and non-edit/write tools', () => {
    const activities: ActivityItem[] = [
      createActivity({
        toolName: 'Write',
        status: 'running',
        toolInput: {
          file_path: '/repo/should-not-appear.ts',
          content: 'x',
        },
      }),
      createActivity({
        toolName: 'Read',
        status: 'completed',
        toolInput: {
          file_path: '/repo/read-only.ts',
        },
      }),
    ]

    const result = computeTurnFileChanges(activities)
    expect(result).toHaveLength(0)
  })
})
