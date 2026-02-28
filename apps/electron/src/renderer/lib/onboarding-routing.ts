export type ProviderChoice = 'claude' | 'chatgpt' | 'api_key'

export type OnboardingApiSetupMethod =
  | 'anthropic_api_key'
  | 'claude_oauth'
  | 'pi_chatgpt_oauth'
  | 'pi_api_key'

export function resolveApiSetupMethodForProvider(choice: ProviderChoice): OnboardingApiSetupMethod {
  switch (choice) {
    case 'claude':
      return 'claude_oauth'
    case 'chatgpt':
      return 'pi_chatgpt_oauth'
    case 'api_key':
      return 'anthropic_api_key'
  }
}

export function shouldAutoStartOAuth(choice: ProviderChoice): boolean {
  return choice === 'claude' || choice === 'chatgpt'
}
