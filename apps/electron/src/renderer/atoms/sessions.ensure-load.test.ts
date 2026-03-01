import { afterEach, describe, expect, it } from 'bun:test'
import { createStore } from 'jotai'
import type { Session } from '../../shared/types'
import { ensureSessionMessagesLoadedAtom, sessionAtomFamily } from './sessions'

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace',
    lastMessageAt: Date.now(),
    messages: [],
    isProcessing: false,
    ...overrides,
  }
}

const originalWindow = (globalThis as { window?: unknown }).window

afterEach(() => {
  ;(globalThis as { window?: unknown }).window = originalWindow
})

describe('ensureSessionMessagesLoadedAtom artifacts merge', () => {
  it('merges artifacts from getSessionMessages into existing session', async () => {
    const existing = createSession()
    const loaded = createSession({
      messages: [],
      artifacts: [
        {
          path: '/tmp/final.csv',
          name: 'final.csv',
          title: 'Final CSV',
          kind: 'deliverable',
          size: 1024,
          updatedAt: 1234,
          exists: true,
        },
      ],
    })

    ;(globalThis as { window?: unknown }).window = {
      electronAPI: {
        getSessionMessages: async () => loaded,
      },
    }

    const store = createStore()
    store.set(sessionAtomFamily('session-1'), existing)

    await store.set(ensureSessionMessagesLoadedAtom, 'session-1')

    const merged = store.get(sessionAtomFamily('session-1'))
    expect(merged?.artifacts).toEqual(loaded.artifacts)
  })

  it('preserves existing artifacts when getSessionMessages omits them', async () => {
    const existingArtifacts: Session['artifacts'] = [
      {
        path: '/tmp/existing.pdf',
        name: 'existing.pdf',
        title: 'Existing',
        kind: 'deliverable',
        size: 2048,
        updatedAt: 2222,
        exists: true,
      },
    ]

    const existing = createSession({ artifacts: existingArtifacts })
    const loaded = createSession({ messages: [], artifacts: undefined })

    ;(globalThis as { window?: unknown }).window = {
      electronAPI: {
        getSessionMessages: async () => loaded,
      },
    }

    const store = createStore()
    store.set(sessionAtomFamily('session-1'), existing)

    await store.set(ensureSessionMessagesLoadedAtom, 'session-1')

    const merged = store.get(sessionAtomFamily('session-1'))
    expect(merged?.artifacts).toEqual(existingArtifacts)
  })
})
