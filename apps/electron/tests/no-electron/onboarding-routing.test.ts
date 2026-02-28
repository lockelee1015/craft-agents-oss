import { describe, expect, it } from 'bun:test'
import {
  resolveApiSetupMethodForProvider,
  shouldAutoStartOAuth,
  type ProviderChoice,
} from '../../src/renderer/lib/onboarding-routing'

describe('onboarding-routing (no Electron runtime required)', () => {
  it('maps provider choices to expected setup methods', () => {
    const cases: Array<[ProviderChoice, string]> = [
      ['claude', 'claude_oauth'],
      ['chatgpt', 'pi_chatgpt_oauth'],
      ['api_key', 'anthropic_api_key'],
    ]

    for (const [choice, expected] of cases) {
      expect(resolveApiSetupMethodForProvider(choice)).toBe(expected)
    }
  })

  it('only OAuth choices auto-start OAuth', () => {
    expect(shouldAutoStartOAuth('claude')).toBe(true)
    expect(shouldAutoStartOAuth('chatgpt')).toBe(true)
    expect(shouldAutoStartOAuth('api_key')).toBe(false)
  })
})
