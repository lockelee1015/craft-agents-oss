/**
 * CredentialsStep - Onboarding step wrapper for API key or OAuth flow
 */

import type { ApiSetupMethod } from "./APISetupStep"
import { StepFormLayout, BackButton, ContinueButton } from "./primitives"
import { ExternalLink } from "lucide-react"
import {
  ApiKeyInput,
  type ApiKeyStatus,
  type ApiKeySubmitData,
  OAuthConnect,
  type OAuthStatus,
} from "../apisetup"
import { useLocale, t } from "@/i18n"

export type CredentialStatus = ApiKeyStatus | OAuthStatus

interface CredentialsStepProps {
  apiSetupMethod: ApiSetupMethod
  status: CredentialStatus
  errorMessage?: string
  onSubmit: (data: ApiKeySubmitData) => void
  onStartOAuth?: (methodOverride?: ApiSetupMethod) => void
  onBack: () => void
  isWaitingForCode?: boolean
  onSubmitAuthCode?: (code: string) => void
  onCancelOAuth?: () => void
  editInitialValues?: {
    apiKey?: string
    baseUrl?: string
    connectionDefaultModel?: string
    activePreset?: string
  }
}

export function CredentialsStep({
  apiSetupMethod,
  status,
  errorMessage,
  onSubmit,
  onStartOAuth,
  onBack,
  isWaitingForCode,
  onSubmitAuthCode,
  onCancelOAuth,
  editInitialValues,
}: CredentialsStepProps) {
  const locale = useLocale()
  const isClaudeOAuth = apiSetupMethod === 'claude_oauth'
  const isChatGptOAuth = apiSetupMethod === 'pi_chatgpt_oauth'
  const isPiApiKey = apiSetupMethod === 'pi_api_key'

  if (isChatGptOAuth) {
    return (
      <StepFormLayout
        title={t(locale, { en: 'Connect Codex', zh: '连接 Codex' })}
        description={t(locale, {
          en: 'Use your ChatGPT subscription to run Codex agents.',
          zh: '使用 ChatGPT 订阅来运行 Codex Agent。',
        })}
        actions={
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'} />
            <ContinueButton
              onClick={() => onStartOAuth?.()}
              className="gap-2"
              loading={status === 'validating'}
              loadingText={t(locale, { en: 'Connecting...', zh: '连接中...' })}
            >
              <ExternalLink className="size-4" />
              {t(locale, { en: 'Sign in with ChatGPT', zh: '使用 ChatGPT 登录' })}
            </ContinueButton>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-foreground-2 p-4 text-sm text-muted-foreground">
            <p>{t(locale, { en: 'Click the button above to authenticate in your browser.', zh: '点击上方按钮后会在浏览器中完成认证。' })}</p>
          </div>
          {status === 'error' && errorMessage && <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-3">{errorMessage}</div>}
        </div>
      </StepFormLayout>
    )
  }

  if (isClaudeOAuth) {
    if (isWaitingForCode) {
      return (
        <StepFormLayout
          title={t(locale, { en: 'Enter Authorization Code', zh: '输入授权码' })}
          description={t(locale, { en: 'Paste the code from your browser.', zh: '请粘贴浏览器中的授权码。' })}
          actions={
            <>
              <BackButton onClick={onCancelOAuth} disabled={status === 'validating'}>{t(locale, { en: 'Cancel', zh: '取消' })}</BackButton>
              <ContinueButton type="submit" form="auth-code-form" loading={status === 'validating'} loadingText={t(locale, { en: 'Connecting...', zh: '连接中...' })} />
            </>
          }
        >
          <OAuthConnect
            status={status as OAuthStatus}
            errorMessage={errorMessage}
            isWaitingForCode={true}
            onStartOAuth={onStartOAuth!}
            onSubmitAuthCode={onSubmitAuthCode}
            onCancelOAuth={onCancelOAuth}
          />
        </StepFormLayout>
      )
    }

    return (
      <StepFormLayout
        title={t(locale, { en: 'Connect Claude Code', zh: '连接 Claude Code' })}
        description={t(locale, {
          en: 'Use your Claude subscription (API plan) to run Claude Code agents.',
          zh: '使用你的 Claude 订阅（API 方案）来运行 Claude Code Agent。',
        })}
        actions={
          <>
            <BackButton onClick={onBack} disabled={status === 'validating'} />
            <ContinueButton onClick={() => onStartOAuth?.()} className="gap-2" loading={status === 'validating'} loadingText={t(locale, { en: 'Connecting...', zh: '连接中...' })}>
              <ExternalLink className="size-4" />
              {t(locale, { en: 'Sign in with Claude', zh: '使用 Claude 登录' })}
            </ContinueButton>
          </>
        }
      >
        <OAuthConnect
          status={status as OAuthStatus}
          errorMessage={errorMessage}
          isWaitingForCode={false}
          onStartOAuth={onStartOAuth!}
          onSubmitAuthCode={onSubmitAuthCode}
          onCancelOAuth={onCancelOAuth}
        />
      </StepFormLayout>
    )
  }

  return (
    <StepFormLayout
      title={t(locale, { en: 'API Configuration', zh: 'API 配置' })}
      description={t(locale, {
        en: 'Enter your API key for Claude Code or Codex compatible providers.',
        zh: '请输入用于 Claude Code 或兼容 Codex 提供方的 API Key。',
      })}
      actions={
        <>
          <BackButton onClick={onBack} disabled={status === 'validating'} />
          <ContinueButton type="submit" form="api-key-form" loading={status === 'validating'} loadingText={t(locale, { en: 'Validating...', zh: '校验中...' })} />
        </>
      }
    >
      <ApiKeyInput
        status={status as ApiKeyStatus}
        errorMessage={errorMessage}
        onSubmit={onSubmit}
        providerType={isPiApiKey ? 'pi_api_key' : 'anthropic'}
        initialValues={editInitialValues}
      />
    </StepFormLayout>
  )
}
