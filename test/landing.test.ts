import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectLocale } from '../src/shared/i18n'
import { SITE_PAGES, fillLegal, landingKeys, languageScript, translatePage, withSiteChrome } from '../scripts/landingPages'
import { LANDING_CATALOGS } from '../src/web/landing/translations'
import { LEGAL } from '../src/web/landing/legal'

const read = (page: string) => readFileSync(resolve(__dirname, '../src/web', page), 'utf8')
const html = read('index.html')
/** Every site page as the build sees it, with the front page's header and footer put in. */
const pages = SITE_PAGES.map((p) => [p, withSiteChrome(read(p), p, html)] as const)
const tags = (s: string) => [...s.matchAll(/<\/?([a-z]+)/g)].map((m) => m[0]).sort()

describe('site page translations', () => {
  const keys = new Map<string, string>()
  for (const [page, source] of pages)
    for (const [k, en] of landingKeys(source)) {
      if (keys.has(k)) expect(en, `${k} in ${page} has other English than elsewhere`).toBe(keys.get(k))
      keys.set(k, en)
    }

  it('finds the translatable text', () => {
    expect(keys.size).toBeGreaterThan(200)
    expect(keys.get('hero.2')).toContain('Rekordbox')
  })

  it('never nests a translated element inside the same tag', () => {
    for (const [, source] of pages)
      for (const m of source.matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g))
        expect(m[3].includes(`<${m[1]}`), m[2]).toBe(false)
  })

  it('gives every other page the front page header and footer, pointing back to it', () => {
    for (const [page, source] of pages.slice(1)) {
      expect(source, page).not.toContain('<!-- site-')
      expect(source, page).toContain('href="./#features"')
      expect(source, page).toContain(`href="./pt-BR/${page}" hreflang="pt-BR"`)
      expect(source, page).toContain('href="./terms.html"')
      expect(source, page).toContain(`<link rel="canonical" href="https://set-visualizer-app.web.app/${page}"`)
    }
  })

  it('fills in the legal details, and marks the missing ones', () => {
    const page = '<p>%legal.name%</p><a href="mailto:%legal.email%">%legal.email%</a>'
    expect(fillLegal(page, { ...LEGAL, name: 'Ana', email: 'a@b.co' })).toBe('<p>Ana</p><a href="mailto:a@b.co">a@b.co</a>')
    expect(fillLegal(page, { ...LEGAL, name: '', email: '' })).toBe(
      '<p><mark class="legal-todo">[name]</mark></p><a href="mailto:"><mark class="legal-todo">[email]</mark></a>'
    )
    expect(fillLegal('<p>%legal.taxId%</p>', { ...LEGAL, taxId: '' })).toBe('<p></p>')
    expect(() => fillLegal('%legal.nope%')).toThrow()
    for (const [page, source] of pages) expect(() => fillLegal(source), page).not.toThrow()
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

    it(`${locale} legal pages are translated and keep their own file name`, () => {
      for (const [name, source] of pages.slice(1)) {
        const page = translatePage(source, locale as 'pt-BR' | 'es')
        expect(page, name).toContain(`<link rel="canonical" href="https://set-visualizer-app.web.app/${locale}/${name}"`)
        expect(page, name).toContain(`href="../${locale}/${name}" hreflang="${locale}"`)
        expect(page, name).not.toMatch(/\s(href|src)="\.\//)
      }
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
  function visit(page: string, languages: string[], stored?: object, timeZone = 'America/New_York', file = '') {
    let went: string | undefined
    const storage = new Map<string, string>(stored ? [['setvis.prefs', JSON.stringify(stored)]] : [])
    const env = {
      document: { documentElement: { lang: page }, addEventListener: () => {} },
      navigator: { languages, language: languages[0] },
      localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
      location: { hash: '', pathname: `/${page === 'en' ? '' : page + '/'}${file}`, replace: (u: string) => (went = u) },
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

  it('keeps the page a visitor opened', () => {
    expect(visit('en', ['pt-BR'], undefined, 'America/New_York', 'terms.html')).toBe('./pt-BR/terms.html')
    expect(visit('es', ['en'], { language: 'en' }, 'America/New_York', 'refund.html')).toBe('../refund.html')
  })

  it('leaves a translated page alone when nothing was picked', () => {
    expect(visit('es', ['en-US'])).toBeUndefined()
  })
})
