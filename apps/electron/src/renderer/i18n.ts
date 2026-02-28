export type SupportedLocale = 'en' | 'zh'

export function resolveLocale(value?: string | null): SupportedLocale {
  if (!value) return 'en'
  const normalized = value.toLowerCase()
  if (normalized.startsWith('zh')) return 'zh'
  return 'en'
}

export function useLocale(): SupportedLocale {
  if (typeof navigator === 'undefined') return 'en'
  return resolveLocale(navigator.language)
}

export function t(locale: SupportedLocale, messages: { en: string; zh: string }): string {
  return locale === 'zh' ? messages.zh : messages.en
}
