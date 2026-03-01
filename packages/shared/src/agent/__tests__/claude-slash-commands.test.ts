import { describe, expect, it } from 'bun:test';
import {
  CLAUDE_FALLBACK_SLASH_COMMANDS,
  extractLeadingSlashCommandName,
  isSdkSlashCommandPrompt,
  mergeSlashCommands,
  normalizeStructuredSlashCommands,
} from '../backend/claude/slash-commands.ts';

describe('Claude slash command utilities', () => {
  it('merges structured supportedCommands() with init slash_commands names', () => {
    const structured = normalizeStructuredSlashCommands([
      { name: 'compact', description: 'Compact conversation' },
      { name: '/clear', argumentHint: '<target>' },
    ]);

    const merged = mergeSlashCommands(structured, ['clear', 'status', '/compact']);

    expect(merged).toEqual([
      { name: 'compact', description: 'Compact conversation' },
      { name: 'clear', argumentHint: '<target>' },
      { name: 'status' },
    ]);
  });

  it('treats dynamic SDK commands as direct slash commands (no context wrapping)', () => {
    const commands = mergeSlashCommands(
      normalizeStructuredSlashCommands([{ name: 'clear' }, { name: 'my-command' }]),
      [],
    );

    expect(isSdkSlashCommandPrompt('/clear all', commands, false)).toBe(true);
    expect(isSdkSlashCommandPrompt('/my-command now', commands, false)).toBe(true);
    expect(isSdkSlashCommandPrompt('/clear all', commands, true)).toBe(false);
    expect(extractLeadingSlashCommandName('/my-command now')).toBe('my-command');
  });

  it('falls back to /compact when slash command cache is empty', () => {
    expect(isSdkSlashCommandPrompt('/compact', CLAUDE_FALLBACK_SLASH_COMMANDS, false)).toBe(true);
    expect(isSdkSlashCommandPrompt('/clear', CLAUDE_FALLBACK_SLASH_COMMANDS, false)).toBe(false);
  });
});
