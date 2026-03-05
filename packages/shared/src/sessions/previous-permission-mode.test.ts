import { describe, it, expect } from 'bun:test';
import { SESSION_PERSISTENT_FIELDS, type SessionConfig } from './types.ts';
import { pickSessionFields } from './utils.ts';

describe('session previousPermissionMode persistence', () => {
  it('includes previousPermissionMode in persistent field registry', () => {
    expect(SESSION_PERSISTENT_FIELDS).toContain('previousPermissionMode');
  });

  it('pickSessionFields preserves previousPermissionMode', () => {
    const source: SessionConfig = {
      id: 'session-1',
      workspaceRootPath: '/tmp/workspace',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      permissionMode: 'allow-all',
      previousPermissionMode: 'ask',
    };

    const picked = pickSessionFields(source);
    expect(picked.permissionMode).toBe('allow-all');
    expect(picked.previousPermissionMode).toBe('ask');
  });
});
