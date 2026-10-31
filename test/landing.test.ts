import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectLocale } from '../src/shared/i18n'
import { landingKeys, languageScript, translatePage } from '../scripts/landingPages'
import { LANDING_CATALOGS } from '../src/web/landing/translations'

const html = readFileSync(resolve(__dirname, '../src/web/index.html'), 'utf8')
const tags = (s: string) => [...s.matchAll(/<\/?([a-z]+)/g)].map((m) => m[0]).sort()

describe('front page translations', () => {
  const keys = landingKeys(html)

  it('finds the translatable text', () => {
    expect(keys.size).toBeGreaterThan(200)
    expect(keys.get('hero.2')).toContain('Rekordbox')
  })

  it('never nests a translated element inside the same tag', () => {
    for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g))
      expect(m[3].includes(`<${m[1]}`), m[2]).toBe(false)
  })

  for (const [locale, catalog] of Object.entries(LANDING_CATALOGS)) {
    it(`${locale} has every key, with the same markup`, () => {
      expect(Object.keys(catalog).sort()).toEqual([...keys.keys()].sort())
      for (const [k, en] of keys) expect(tags(catalog[k]), k).toEqual(tags(en))
    })

    it(`${locale} page is translated and one folder down`, () => {
      const page = translatePage(html, locale as 'pt-BR' | 'es')
      expect(page).toContain(`<html lang="${locale}">`)
      expect(page).toContain(`<link rel="canonical" href="https://set-visualizer-app.web.app/${locale}/"`)
      expect(page).toContain(catalog['hero.2'])
      expect(page).not.toContain('Turn a recorded Rekordbox set into a YouTube video')
      expect(page).not.toMatch(/\s(href|src)="\.\//)
      expect(page).toContain('href="../app.html"')
      expect(page).toContain(`data-set-lang="${locale}" aria-current="true"`)
      expect(page.match(/aria-current="true"/g)).toHaveLength(1)
    })
  }
})

describe('detectLocale', () => {
  it('prefers a Portuguese or Spanish browser language', () => {
    expect(detectLocale(['pt-BR', 'en'], 'America/New_York')).toBe('pt-BR')
    expect(detectLocale(['pt-PT'], 'Europe/Lisbon')).toBe('pt-BR')
    expect(detectLocale(['es-MX'], 'America/Sao_Paulo')).toBe('es')
    expect(detectLocale(['fr-FR', 'es'], 'Europe/Paris')).toBe('es')
  })

  it('falls back to the time zone when the browser is in English or another language', () => {
    expect(detectLocale(['en-US', 'en'], 'America/Sao_Paulo')).toBe('pt-BR')
    expect(detectLocale(['en-US'], 'America/Fortaleza')).toBe('pt-BR')
    expect(detectLocale(['en-US', 'pt-BR'], 'America/Recife')).toBe('pt-BR')
    expect(detectLocale(['en'], 'America/Argentina/Buenos_Aires')).toBe('es')
    expect(detectLocale(['de-DE'], 'Europe/Madrid')).toBe('es')
    expect(detectLocale(['en-US'], 'America/New_York')).toBe('en')
    expect(detectLocale(['en-US', 'es'], 'America/Los_Angeles')).toBe('en')
    expect(detectLocale([], undefined)).toBe('en')
  })
})

describe('front page language script', () => {
  /** Runs the inline script against a fake page and returns where it sends the visitor, if anywhere. */
  function visit(page: string, languages: string[], stored?: object, timeZone = 'America/New_York') {
    let went: string | undefined
    const storage = new Map<string, string>(stored ? [['setvis.prefs', JSON.stringify(stored)]] : [])
    const env = {
      document: { documentElement: { lang: page }, addEventListener: () => {} },
      navigator: { languages, language: languages[0] },
      localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
      location: { hash: '', replace: (u: string) => (went = u) },
      Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) }
    }
    new Function(...Object.keys(env), languageScript())(...Object.values(env))
    return went
  }

  it('sends a first visit to the visitor language', () => {
    expect(visit('en', ['pt-BR'])).toBe('./pt-BR/')
    expect(visit('en', ['en-US'], undefined, 'America/Sao_Paulo')).toBe('./pt-BR/')
    expect(visit('en', ['es-AR'])).toBe('./es/')
    expect(visit('en', ['en-US'])).toBeUndefined()
  })

  it('honours a language picked in the menu or in the editor', () => {
    expect(visit('en', ['pt-BR'], { language: 'en' })).toBeUndefined()
    expect(visit('pt-BR', ['pt-BR'], { language: 'es' })).toBe('../es/')
    expect(visit('en', ['en-US'], { language: 'system' }, 'America/Sao_Paulo')).toBe('./pt-BR/')
  })

  it('leaves a translated page alone when nothing was picked', () => {
    expect(visit('es', ['en-US'])).toBeUndefined()
  })
})
