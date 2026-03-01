import type { SessionSlashCommand } from '../shared/types';

export const CLAUDE_SESSION_SLASH_COMMAND_FALLBACK: SessionSlashCommand[] = [
  { name: 'compact' },
];

function cloneCommands(commands: SessionSlashCommand[]): SessionSlashCommand[] {
  return commands.map((command) => ({ ...command }));
}

export function getFallbackSlashCommandsForProvider(provider: string): SessionSlashCommand[] {
  if (provider === 'anthropic') {
    return cloneCommands(CLAUDE_SESSION_SLASH_COMMAND_FALLBACK);
  }
  return [];
}

export function resolveSessionSlashCommands(params: {
  provider: string;
  agentSlashCommands?: SessionSlashCommand[] | null;
}): SessionSlashCommand[] {
  const { provider, agentSlashCommands } = params;
  if (agentSlashCommands && agentSlashCommands.length > 0) {
    return cloneCommands(agentSlashCommands);
  }
  return getFallbackSlashCommandsForProvider(provider);
}
