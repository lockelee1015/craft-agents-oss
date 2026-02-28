import { cn } from "@/lib/utils"
import { Key } from "lucide-react"
import { CraftAgentsSymbol } from "@/components/icons/CraftAgentsSymbol"
import { StepFormLayout } from "./primitives"
import { useLocale, t } from "@/i18n"

import claudeIcon from "@/assets/provider-icons/claude.svg"
import openaiIcon from "@/assets/provider-icons/openai.svg"

/**
 * The high-level provider choice the user makes on first launch.
 * This maps to one or more ApiSetupMethods downstream.
 */
export type ProviderChoice = 'claude' | 'chatgpt' | 'api_key'

interface ProviderOption {
  id: ProviderChoice
  name: string
  description: string
  icon: React.ReactNode
}

interface ProviderSelectStepProps {
  /** Called when the user selects a provider */
  onSelect: (choice: ProviderChoice) => void
}

/**
 * ProviderSelectStep — First screen after install.
 */
export function ProviderSelectStep({ onSelect }: ProviderSelectStepProps) {
  const locale = useLocale()

  const providerOptions: ProviderOption[] = [
    {
      id: 'claude',
      name: t(locale, { en: 'Claude Code', zh: 'Claude Code' }),
      description: t(locale, {
        en: 'Use your Claude subscription to run Claude Code agents.',
        zh: '使用 Claude 订阅来运行 Claude Code Agent。',
      }),
      icon: <img src={claudeIcon} alt="" className="size-5 rounded-[3px]" />,
    },
    {
      id: 'chatgpt',
      name: 'Codex',
      description: t(locale, {
        en: 'Use your ChatGPT Plus/Pro subscription to run Codex agents.',
        zh: '使用 ChatGPT Plus/Pro 订阅来运行 Codex Agent。',
      }),
      icon: <img src={openaiIcon} alt="" className="size-5 rounded-[3px]" />,
    },
    {
      id: 'api_key',
      name: t(locale, { en: 'I have an API key', zh: '我有 API Key' }),
      description: t(locale, {
        en: 'Configure API access for Claude Code or Codex compatible endpoints.',
        zh: '为 Claude Code 或兼容 Codex 的端点配置 API 访问。',
      }),
      icon: <Key className="size-5" />,
    },
  ]

  return (
    <StepFormLayout
      iconElement={
        <div className="flex size-16 items-center justify-center">
          <CraftAgentsSymbol className="size-10 text-accent" />
        </div>
      }
      title={t(locale, { en: 'Welcome to Craft Agents', zh: '欢迎使用 Craft Agents' })}
      description={t(locale, {
        en: 'Choose an agent runtime to continue.',
        zh: '请选择要使用的 Agent 运行时。',
      })}
    >
      <div className="space-y-3">
        {providerOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option.id)}
            className={cn(
              "flex w-full items-start gap-4 rounded-xl bg-foreground-2 p-4 text-left transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "hover:bg-foreground/[0.02] shadow-minimal",
            )}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {option.icon}
            </div>

            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{option.name}</span>
              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
            </div>
          </button>
        ))}
      </div>
    </StepFormLayout>
  )
}
