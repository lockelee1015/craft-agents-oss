import { describe, expect, it } from 'bun:test'
import {
  CLAUDE_SESSION_SLASH_COMMAND_FALLBACK,
  getFallbackSlashCommandsForProvider,
  resolveSessionSlashCommands,
} from '../session-slash-commands'

describe('session slash commands', () => {
  it('returns Claude fallback when no agent commands are available', () => {
    expect(resolveSessionSlashCommands({
      provider: 'anthropic',
      agentSlashCommands: null,
    })).toEqual(CLAUDE_SESSION_SLASH_COMMAND_FALLBACK)
  })

  it('returns empty list for non-Claude providers when no agent exists', () => {
    expect(getFallbackSlashCommandsForProvider('openai')).toEqual([])
    expect(resolveSessionSlashCommands({
      provider: 'openai',
      agentSlashCommands: null,
    })).toEqual([])
  })

  it('prefers dynamic commands from agent when available', () => {
    const dynamic = [{ name: 'clear', description: 'Clear context' }]
    expect(resolveSessionSlashCommands({
      provider: 'anthropic',
      agentSlashCommands: dynamic,
    })).toEqual(dynamic)
  })
})
