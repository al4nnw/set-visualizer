import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { LOCALES, detectLocale, type Locale, type Msg } from '@shared/i18n'
import type { Preferences } from '@shared/types'
import { en } from './en'
import { es } from './es'
import { ptBR } from './pt-BR'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
  }
}

const resources = { en: { translation: en }, 'pt-BR': { translation: ptBR }, es: { translation: es } }

/** The language for someone who hasn't picked one: browser language, else location (same rule as the front page). */
export const systemLocale = (): Locale => {
  let timeZone: string | undefined
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    // No Intl time zone: the browser language decides alone.
  }
  return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language], timeZone)
}

/** The UI language a preference asks for. */
export const uiLocale = (pref: Preferences['language']): Locale => (pref && pref !== 'system' && LOCALES.includes(pref) ? pref : systemLocale())

i18n.use(initReactI18next).init({
  resources,
  lng: systemLocale(),
  fallbackLng: 'en',
  supportedLngs: [...LOCALES],
  interpolation: { escapeValue: false },
  returnNull: false
})

/** Switches the UI language (from the Settings preference). */
export function setUiLocale(pref: Preferences['language']) {
  const lng = uiLocale(pref)
  document.documentElement.lang = lng
  if (i18n.language !== lng) void i18n.changeLanguage(lng)
}
document.documentElement.lang = i18n.language

/** A key built at runtime (menu command ids, shared messages); i18next's typed keys can't follow it. */
export const tk = (key: string, values?: Record<string, unknown>): string => (i18n.t as unknown as (k: string, v?: Record<string, unknown>) => string)(key, values)

/** A message from shared code, under a catalog section (clipText, clipReason, swapReason). */
export const tMsg = (section: string, m: Msg): string => tk(`${section}.${m.key}`, m.values)

/** The current UI locale, for Intl and toLocaleString. */
export const lang = () => i18n.language

export { i18n }
