/**
 * OnboardingFlowDemo — Interactive walkthrough of the onboarding flow.
 */
import { useState, useCallback, useEffect } from 'react'
import { ensureMockElectronAPI } from '../mock-utils'
import { WelcomeStep } from '@/components/onboarding/WelcomeStep'
import { ProviderSelectStep, type ProviderChoice } from '@/components/onboarding/ProviderSelectStep'
import { CredentialsStep } from '@/components/onboarding/CredentialsStep'
import { CompletionStep } from '@/components/onboarding/CompletionStep'
import type { ApiSetupMethod } from '@/components/onboarding/APISetupStep'
import type { CredentialStatus } from '@/components/onboarding/CredentialsStep'

type DemoStep = 'welcome' | 'provider-select' | 'credentials' | 'complete'

const CHOICE_TO_METHOD: Record<ProviderChoice, ApiSetupMethod> = {
  claude: 'claude_oauth',
  chatgpt: 'pi_chatgpt_oauth',
  api_key: 'anthropic_api_key',
}

export function OnboardingFlowDemo() {
  useEffect(() => { ensureMockElectronAPI() }, [])

  const [step, setStep] = useState<DemoStep>('welcome')
  const [method, setMethod] = useState<ApiSetupMethod | null>(null)
  const [credStatus, setCredStatus] = useState<CredentialStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()

  const handleProviderSelect = useCallback((choice: ProviderChoice) => {
    setCredStatus('idle')
    setErrorMessage(undefined)
    setMethod(CHOICE_TO_METHOD[choice])
    setStep('credentials')
  }, [])

  const handleBack = useCallback(() => {
    if (step === 'provider-select') setStep('welcome')
    if (step === 'credentials') setStep('provider-select')
  }, [step])

  const simulateOAuthSuccess = useCallback(() => {
    setCredStatus('validating')
    setTimeout(() => {
      setCredStatus('success')
      setTimeout(() => setStep('complete'), 400)
    }, 900)
  }, [])

  const handleRestart = useCallback(() => {
    setStep('welcome')
    setMethod(null)
    setCredStatus('idle')
    setErrorMessage(undefined)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex items-center justify-center p-8 bg-foreground-2 overflow-auto">
        {step === 'welcome' && <WelcomeStep isExistingUser={false} onContinue={() => setStep('provider-select')} />}
        {step === 'provider-select' && <ProviderSelectStep onSelect={handleProviderSelect} />}
        {step === 'credentials' && method && (
          <CredentialsStep
            apiSetupMethod={method}
            status={credStatus}
            errorMessage={errorMessage}
            onSubmit={simulateOAuthSuccess}
            onStartOAuth={simulateOAuthSuccess}
            onBack={handleBack}
            isWaitingForCode={false}
            onSubmitAuthCode={() => simulateOAuthSuccess()}
            onCancelOAuth={handleBack}
          />
        )}
        {step === 'complete' && <CompletionStep status="complete" onFinish={handleRestart} />}
      </div>
    </div>
  )
}
