/**
 * The front page in every language. index.html is the English page at /; the build writes a
 * translated copy of it at /pt-BR/ and /es/ (and the dev server serves the same pages), so each
 * language is a real static page that search engines read without running JavaScript.
 *
 * Every page also gets a small inline script in <head> that sends a first-time visitor of / to their
 * language before anything renders (detectLocale: browser language, else time zone) and remembers
 * a choice made in the language menu. The choice is stored as `language` in the editor's own
 * preferences (localStorage "setvis.prefs"), so the front page and the editor always agree.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { detectLocale, type Locale } from '../src/shared/i18n'
import { LANDING_CATALOGS, type LandingCatalog } from '../src/web/landing/translations'

const SITE = 'https://set-visualizer-app.web.app/'
const OG_LOCALE: Record<Locale, string> = { en: 'en_US', 'pt-BR': 'pt_BR', es: 'es_ES' }
/** Where each language's page lives, relative to the site root. */
export const LANDING_PATHS: Record<Locale, string> = { en: '', 'pt-BR': 'pt-BR/', es: 'es/' }

const escapeAttr = (s: string) => s.replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/"/g, '&quot;')

/** The English source text of every translatable element and attribute in index.html, by key. */
export function landingKeys(html: string): Map<string, string> {
  const keys = new Map<string, string>()
  for (const m of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) keys.set(m[2], m[3])
  for (const tag of html.match(/<[a-z][^>]*\sdata-i18n-[a-z-]+="[^"]+"[^>]*>/g) ?? []) {
    for (const [, attr, key] of tag.matchAll(/\sdata-i18n-([a-z-]+)="([^"]+)"/g)) {
      const value = new RegExp(`\\s${attr}="([^"]*)"`).exec(tag)?.[1]
      if (value !== undefined && !keys.has(key)) keys.set(key, value)
    }
  }
  return keys
}

/** index.html (source or built) as the page for another language, served one folder down. */
export function translatePage(html: string, locale: Exclude<Locale, 'en'>, catalog: LandingCatalog = LANDING_CATALOGS[locale]): string {
  const text = (key: string) => {
    const t = catalog[key]
    if (t === undefined) throw new Error(`Front page: no ${locale} text for "${key}" (src/web/landing/translations.ts)`)
    return t
  }
  let out = html
    // Element text. The English inside never nests the same tag (test/landing.test.ts checks).
    .replace(/(<([a-z][a-z0-9]*)\b[^>]*?\sdata-i18n="([^"]+)"[^>]*>)[\s\S]*?(<\/\2>)/g, (_, open, _tag, key, close) => open + text(key) + close)
    // Attributes named by data-i18n-<attr>="key".
    .replace(/<[a-z][^>]*\sdata-i18n-[a-z-]+="[^"]+"[^>]*>/g, (tag) => {
      let t = tag
      for (const [, attr, key] of tag.matchAll(/\sdata-i18n-([a-z-]+)="([^"]+)"/g))
        t = t.replace(new RegExp(`(\\s${attr}=")[^"]*(")`), (_, a, b) => a + escapeAttr(text(key)) + b)
      return t
    })
    .replace(/<html lang="en">/, `<html lang="${locale}">`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${SITE}${LANDING_PATHS[locale]}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${SITE}${LANDING_PATHS[locale]}`)
    .replace(/(<meta property="og:locale" content=")[^"]*/, `$1${OG_LOCALE[locale]}`)
    .replace(new RegExp(`(<meta property="og:locale:alternate" content=")${OG_LOCALE[locale]}`), `$1${OG_LOCALE.en}`)
    // The language menu marks the page you're on.
    .replace(/ aria-current="true"/, '')
    .replace(`data-set-lang="${locale}"`, `data-set-lang="${locale}" aria-current="true"`)
    // One folder down: ./x becomes ../x (links, styles, scripts, the language menu).
    .replace(/(\s(?:href|src)=")\.\//g, '$1../')
  if (!out.includes(`<html lang="${locale}">`)) throw new Error('Front page: <html lang="en"> not found')
  return out
}

/**
 * The inline script every front page runs first: send a visitor of / who hasn't picked a language
 * to theirs, honour a language they picked, store a pick from the language menu, and close the menu
 * on Escape or a click outside it.
 */
export function languageScript(): string {
  return `(function () {
  var detect = ${detectLocale.toString()};
  var paths = ${JSON.stringify(LANDING_PATHS)};
  var KEY = 'setvis.prefs';
  var page = document.documentElement.lang;
  function prefs() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  var picked = prefs().language;
  var want = paths.hasOwnProperty(picked) ? picked : page;
  if (!paths.hasOwnProperty(picked) && page === 'en') {
    var tz;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    want = detect(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language], tz);
  }
  if (want !== page) {
    location.replace((page === 'en' ? './' : '../') + paths[want] + location.hash);
    return;
  }
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('[data-set-lang]');
    if (link) {
      var p = prefs();
      p.language = link.getAttribute('data-set-lang');
      try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (err) {}
      return;
    }
    var open = document.querySelector('details.lang-menu[open]');
    if (open && !open.contains(e.target)) open.removeAttribute('open');
  });
  document.addEventListener('keydown', function (e) {
    var open = e.key === 'Escape' && document.querySelector('details.lang-menu[open]');
    if (open) { open.removeAttribute('open'); open.querySelector('summary').focus(); }
  });
})();`
}

const translated = Object.keys(LANDING_CATALOGS) as Array<Exclude<Locale, 'en'>>

/** Vite plugin: the language script on the front page, and the translated pages in dev and in the build. */
export function landingPages(root: string): Plugin {
  return {
    name: 'landing-pages',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      if (!ctx.filename.endsWith('index.html')) return
      return { html, tags: [{ tag: 'script', children: languageScript(), injectTo: 'head-prepend' }] }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const locale = translated.find((l) => new RegExp(`^/${l}/(index\\.html)?(\\?.*)?$`).test(req.url ?? ''))
        if (!locale) return next()
        try {
          const source = await readFile(resolve(root, 'index.html'), 'utf8')
          const html = await server.transformIndexHtml(`/${locale}/index.html`, translatePage(source, locale))
          res.setHeader('Content-Type', 'text/html')
          res.end(html)
        } catch (e) {
          next(e)
        }
      })
    },
    generateBundle(_, bundle) {
      const home = bundle['index.html']
      if (!home || home.type !== 'asset') return
      for (const locale of translated)
        this.emitFile({ type: 'asset', fileName: `${locale}/index.html`, source: translatePage(String(home.source), locale) })
    }
  }
}
