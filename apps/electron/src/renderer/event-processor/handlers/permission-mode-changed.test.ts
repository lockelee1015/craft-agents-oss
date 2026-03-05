import { describe, expect, it } from 'bun:test';
import type { Session } from '../../../shared/types';
import type { PermissionModeChangedEvent, SessionState } from '../types';
import { handlePermissionModeChanged } from './session';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace',
    lastMessageAt: Date.now(),
    messages: [],
    isProcessing: false,
    ...overrides,
  };
}

describe('handlePermissionModeChanged', () => {
  it('emits effect with transition metadata when provided', () => {
    const state: SessionState = {
      session: createSession({ permissionMode: 'ask' }),
      streaming: null,
    };

    const event: PermissionModeChangedEvent = {
      type: 'permission_mode_changed',
      sessionId: 'session-1',
      permissionMode: 'safe',
      previousPermissionMode: 'ask',
      modeVersion: 3,
      changedAt: '2026-03-05T01:02:03.000Z',
      changedBy: 'user',
    };

    const result = handlePermissionModeChanged(state, event);
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toEqual({
      type: 'permission_mode_changed',
      sessionId: 'session-1',
      permissionMode: 'safe',
      previousPermissionMode: 'ask',
      modeVersion: 3,
      changedAt: '2026-03-05T01:02:03.000Z',
      changedBy: 'user',
    });
  });
});
