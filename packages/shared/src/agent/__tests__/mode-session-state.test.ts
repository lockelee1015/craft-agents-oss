import { describe, it, expect } from 'bun:test';
import {
  cleanupModeState,
  getModeState,
  hydratePreviousPermissionMode,
  initializeModeState,
  getPermissionModeDiagnostics,
  setPermissionMode,
} from '../mode-manager.ts';

describe('mode-manager session state metadata', () => {
  it('tracks previous mode, version, and actor across transitions', () => {
    const sessionId = `mode-state-${Date.now()}-1`;
    cleanupModeState(sessionId);

    initializeModeState(sessionId, 'ask');
    const initial = getModeState(sessionId);
    expect(initial.permissionMode).toBe('ask');
    expect(initial.modeVersion).toBe(0);

    const changedToSafe = setPermissionMode(sessionId, 'safe', { changedBy: 'user' });
    expect(changedToSafe).toBe(true);

    const safeState = getModeState(sessionId);
    expect(safeState.permissionMode).toBe('safe');
    expect(safeState.previousPermissionMode).toBe('ask');
    expect(safeState.modeVersion).toBe(1);
    expect(safeState.lastChangedBy).toBe('user');

    const changedToAllowAll = setPermissionMode(sessionId, 'allow-all', { changedBy: 'automation' });
    expect(changedToAllowAll).toBe(true);

    const allowAllState = getModeState(sessionId);
    expect(allowAllState.permissionMode).toBe('allow-all');
    expect(allowAllState.previousPermissionMode).toBe('safe');
    expect(allowAllState.modeVersion).toBe(2);
    expect(allowAllState.lastChangedBy).toBe('automation');

    cleanupModeState(sessionId);
  });

  it('hydrates previous mode without mutating current mode/version', () => {
    const sessionId = `mode-state-${Date.now()}-2`;
    cleanupModeState(sessionId);

    initializeModeState(sessionId, 'safe');
    const beforeHydrate = getModeState(sessionId);

    hydratePreviousPermissionMode(sessionId, 'ask');
    const afterHydrate = getModeState(sessionId);

    expect(afterHydrate.permissionMode).toBe(beforeHydrate.permissionMode);
    expect(afterHydrate.modeVersion).toBe(beforeHydrate.modeVersion);
    expect(afterHydrate.previousPermissionMode).toBe('ask');

    const diagnostics = getPermissionModeDiagnostics(sessionId);
    expect(diagnostics.previousPermissionMode).toBe('ask');
    expect(diagnostics.transitionDisplay).toContain('->');

    cleanupModeState(sessionId);
  });
});
