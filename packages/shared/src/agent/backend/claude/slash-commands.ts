import type { SupportedSlashCommand } from '../types.ts';

export const CLAUDE_FALLBACK_SLASH_COMMANDS: SupportedSlashCommand[] = [
  { name: 'compact' },
];

export const LEADING_SLASH_COMMAND_REGEX = /^\/([a-z][a-z0-9-]*)(\s|$)/i;

/**
 * Normalize a slash command name to SDK-comparable format.
 * Accepts both "compact" and "/compact".
 */
export function normalizeSlashCommandName(name: string): string | null {
  const trimmed = name.trim().replace(/^\/+/, '').toLowerCase();
  if (!trimmed || !/^[a-z][a-z0-9-]*$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Normalize unknown SDK supportedCommands() output to a typed command list.
 */
export function normalizeStructuredSlashCommands(input: unknown): SupportedSlashCommand[] {
  if (!Array.isArray(input)) return [];

  const commands: SupportedSlashCommand[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as { name?: unknown; description?: unknown; argumentHint?: unknown };
    if (typeof raw.name !== 'string') continue;
    const normalizedName = normalizeSlashCommandName(raw.name);
    if (!normalizedName) continue;

    commands.push({
      name: normalizedName,
      ...(typeof raw.description === 'string' && raw.description.trim().length > 0
        ? { description: raw.description.trim() }
        : {}),
      ...(typeof raw.argumentHint === 'string' && raw.argumentHint.trim().length > 0
        ? { argumentHint: raw.argumentHint.trim() }
        : {}),
    });
  }

  return mergeSlashCommands(commands, []);
}

/**
 * Merge structured commands with name-only commands captured from `system:init.slash_commands`.
 * Structured command metadata always wins when names overlap.
 */
export function mergeSlashCommands(
  structuredCommands: SupportedSlashCommand[],
  initSlashCommandNames: string[],
): SupportedSlashCommand[] {
  const merged = new Map<string, SupportedSlashCommand>();

  for (const cmd of structuredCommands) {
    const normalizedName = normalizeSlashCommandName(cmd.name);
    if (!normalizedName) continue;
    merged.set(normalizedName, { ...cmd, name: normalizedName });
  }

  for (const name of initSlashCommandNames) {
    const normalizedName = normalizeSlashCommandName(name);
    if (!normalizedName || merged.has(normalizedName)) continue;
    merged.set(normalizedName, { name: normalizedName });
  }

  return Array.from(merged.values());
}

/**
 * Extract command name from a leading `/command` prompt.
 * Returns null when prompt doesn't start with a valid slash command.
 */
export function extractLeadingSlashCommandName(prompt: string): string | null {
  const match = prompt.trim().match(LEADING_SLASH_COMMAND_REGEX);
  const rawName = match?.[1];
  if (!rawName) return null;
  return normalizeSlashCommandName(rawName);
}

/**
 * Check whether a user prompt should bypass context wrapping and be sent
 * directly to the Claude SDK as a slash command.
 */
export function isSdkSlashCommandPrompt(
  prompt: string,
  supportedCommands: SupportedSlashCommand[],
  hasAttachments: boolean,
): boolean {
  if (hasAttachments) return false;

  const commandName = extractLeadingSlashCommandName(prompt);
  if (!commandName) return false;

  const supported = new Set(
    supportedCommands
      .map((cmd) => normalizeSlashCommandName(cmd.name))
      .filter((name): name is string => !!name),
  );
  return supported.has(commandName);
}
