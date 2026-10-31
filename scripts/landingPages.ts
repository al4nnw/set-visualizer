/**
 * The site's static pages in every language. index.html (the front page), pricing.html, terms.html,
 * refund.html and privacy.html are the English pages; the build writes a translated copy of each
 * under /pt-BR/ and /es/ (and the dev server serves the same pages), so each language is a real
 * static page that search engines and Paddle's site review read without running JavaScript.
 *
 * The other pages take their header and footer from index.html (a `<!-- site-header -->` and
 * `<!-- site-footer -->` comment marks where), so the navigation is written once. The seller's legal
 * details come from src/web/landing/legal.ts through `%legal.<field>%` tokens.
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
import { LEGAL, OPTIONAL_LEGAL } from '../src/web/landing/legal'

const SITE = 'https://set-visualizer-app.web.app/'
const OG_LOCALE: Record<Locale, string> = { en: 'en_US', 'pt-BR': 'pt_BR', es: 'es_ES' }
/** Where each language's page lives, relative to the site root. */
export const LANDING_PATHS: Record<Locale, string> = { en: '', 'pt-BR': 'pt-BR/', es: 'es/' }

/** Every static page of the site, as its file name in src/web. */
export const SITE_PAGES = ['index.html', 'pricing.html', 'terms.html', 'refund.html', 'privacy.html'] as const
export type SitePage = (typeof SITE_PAGES)[number]

const pageName = (file: string) => SITE_PAGES.find((p) => file.endsWith(`/${p}`) || file === p)

/**
 * A page with the front page's header and footer put in where its markers are. In-page links of
 * the front page (#features) point back to it, and the language menu points at this page in each
 * language.
 */
export function withSiteChrome(html: string, page: SitePage, home: string): string {
  if (page === 'index.html') return html
  const part = (tag: 'header' | 'footer') => {
    const m = new RegExp(`<${tag} class="site-${tag}">[\\s\\S]*?</${tag}>`).exec(home)
    if (!m) throw new Error(`index.html has no site ${tag}`)
    return m[0]
      .replace(/(\shref=")#/g, '$1./#')
      .replace(/(<a href=")\.\/((?:pt-BR\/|es\/)?)(" hreflang)/g, `$1./$2${page}$3`)
  }
  return html.replace('<!-- site-header -->', part('header')).replace('<!-- site-footer -->', part('footer'))
}

/**
 * Puts the seller's details from legal.ts into the page. A required detail that isn't filled in yet
 * shows as a highlighted placeholder, so a missing one is easy to spot; an optional one is left out.
 */
export function fillLegal(html: string, legal: Record<string, string> = LEGAL): string {
  const value = (token: string, field: string) => {
    if (!(field in legal)) throw new Error(`Unknown legal detail ${token} (src/web/landing/legal.ts)`)
    return legal[field]
  }
  let out = html
  // Inside an attribute (mailto: links, meta descriptions) a detail goes in as plain text.
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(/(="[^"<>]*?)%legal\.([a-zA-Z]+)%/, (_, before: string, field: string) => before + escapeAttr(value(`%legal.${field}%`, field)))
  }
  return out.replace(/%legal\.([a-zA-Z]+)%/g, (token, field: string) =>
    value(token, field) || (OPTIONAL_LEGAL.includes(field) ? '' : `<mark class="legal-todo">[${field}]</mark>`)
  )
}

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
    .replace(new RegExp(`(<link rel="canonical" href="${SITE})`), `$1${LANDING_PATHS[locale]}`)
    .replace(new RegExp(`(<meta property="og:url" content="${SITE})`), `$1${LANDING_PATHS[locale]}`)
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
  var file = (location.pathname || '').split('/').pop() || '';
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
    location.replace((page === 'en' ? './' : '../') + paths[want] + file + location.hash);
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

/**
 * Vite plugin: the shared header and footer, the legal details and the language script on every
 * site page, and the translated pages in dev and in the build.
 */
export function landingPages(root: string): Plugin {
  const home = () => readFile(resolve(root, 'index.html'), 'utf8')
  return {
    name: 'landing-pages',
    enforce: 'post',
    async transformIndexHtml(html, ctx) {
      const page = pageName(ctx.filename)
      if (!page) return
      return {
        html: fillLegal(withSiteChrome(html, page, await home())),
        tags: [{ tag: 'script', children: languageScript(), injectTo: 'head-prepend' }]
      }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/(pt-BR|es)\/([a-z]+\.html)?(\?.*)?$/.exec(req.url ?? '')
        const locale = m?.[1] as Exclude<Locale, 'en'> | undefined
        const page = pageName(m?.[2] ?? 'index.html')
        if (!locale || !page) return next()
        try {
          const source = withSiteChrome(await readFile(resolve(root, page), 'utf8'), page, await home())
          const html = await server.transformIndexHtml(`/${locale}/${page}`, fillLegal(translatePage(source, locale)))
          res.setHeader('Content-Type', 'text/html')
          res.end(html)
        } catch (e) {
          next(e)
        }
      })
    },
    generateBundle(_, bundle) {
      for (const page of SITE_PAGES) {
        const built = bundle[page]
        if (!built || built.type !== 'asset') continue
        for (const locale of translated)
          this.emitFile({ type: 'asset', fileName: `${locale}/${page}`, source: fillLegal(translatePage(String(built.source), locale)) })
      }
    }
  }
}
