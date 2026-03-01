/**
 * Tests for report_artifact tool permission handling across permission modes.
 *
 * report_artifact is a session-scoped MCP tool (mcp__session__report_artifact)
 * and should remain available in all permission modes, including safe/Explore.
 */
import { describe, it, expect } from 'bun:test';
import { shouldAllowToolInMode } from '../../agent/mode-manager.ts';

describe('report_artifact permission mode handling', () => {
  const toolName = 'mcp__session__report_artifact';
  const input = { path: '/tmp/example.csv', title: 'Example CSV' };

  it('is allowed in safe (Explore) mode', () => {
    const result = shouldAllowToolInMode(toolName, input, 'safe');
    expect(result.allowed).toBe(true);
  });

  it('is allowed in ask mode', () => {
    const result = shouldAllowToolInMode(toolName, input, 'ask');
    expect(result.allowed).toBe(true);
  });

  it('is allowed in allow-all (Execute) mode', () => {
    const result = shouldAllowToolInMode(toolName, input, 'allow-all');
    expect(result.allowed).toBe(true);
  });

  it('does not require permission prompt in ask mode', () => {
    const result = shouldAllowToolInMode(toolName, input, 'ask');
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.requiresPermission).toBeFalsy();
    }
  });
});
