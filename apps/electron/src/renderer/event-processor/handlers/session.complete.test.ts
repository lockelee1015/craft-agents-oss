import { describe, expect, it } from 'bun:test';
import type { Session } from '../../../shared/types';
import type { CompleteEvent, SessionState } from '../types';
import { handleComplete } from './session';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace',
    lastMessageAt: Date.now(),
    messages: [],
    isProcessing: true,
    ...overrides,
  };
}

describe('handleComplete', () => {
  it('updates session artifacts when complete event includes artifacts', () => {
    const initialState: SessionState = {
      session: createSession(),
      streaming: { content: 'streaming...' },
    };

    const event: CompleteEvent = {
      type: 'complete',
      sessionId: 'session-1',
      artifacts: [
        {
          path: '/tmp/final.pptx',
          name: 'final.pptx',
          title: 'Final Deck',
          kind: 'deliverable',
          size: 2048,
          updatedAt: 12345,
          exists: true,
        },
      ],
    };

    const result = handleComplete(initialState, event);
    expect(result.state.session.isProcessing).toBe(false);
    expect(result.state.session.artifacts).toEqual(event.artifacts);
    expect(result.state.streaming).toBeNull();
  });

  it('preserves previous artifacts when event omits artifacts', () => {
    const initialArtifacts: Session['artifacts'] = [
      {
        path: '/tmp/old.pdf',
        name: 'old.pdf',
        title: 'Old Export',
        kind: 'deliverable',
        size: 10,
        updatedAt: 1000,
        exists: false,
      },
    ];

    const initialState: SessionState = {
      session: createSession({ artifacts: initialArtifacts }),
      streaming: null,
    };

    const event: CompleteEvent = {
      type: 'complete',
      sessionId: 'session-1',
    };

    const result = handleComplete(initialState, event);
    expect(result.state.session.artifacts).toEqual(initialArtifacts);
  });
});

