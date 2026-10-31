/**
 * Languages the app and its videos come in, and the plain-data messages shared code returns where
 * it would otherwise return English text (the UI translates them with its catalogs).
 */
export const LOCALES = ['en', 'pt-BR', 'es'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', 'pt-BR': 'Português (Brasil)', es: 'Español' }

/** A message for the UI to translate: a key in its catalog plus the values it fills in. */
export interface Msg {
  key: string
  values?: Record<string, string | number>
}

/** The supported locale closest to a BCP 47 tag ("pt-PT" → pt-BR, "es-MX" → es), else English. */
export function matchLocale(tag: string | undefined | null): Locale {
  const t = (tag ?? '').toLowerCase()
  if (t.startsWith('pt')) return 'pt-BR'
  if (t.startsWith('es')) return 'es'
  return 'en'
}

/**
 * The language to show someone who hasn't picked one, from their browser languages and time zone.
 * A Portuguese or Spanish browser language wins. A browser left in English (common in Brazil) or in
 * another language falls back to where the clock says they are: Brazil or Portugal get Portuguese,
 * Spain and Spanish-speaking Latin America get Spanish, everyone else English.
 *
 * The editor ("Automatic" in Settings) and the front page both use it, so they agree. The front page
 * runs it from an inline script before anything renders (scripts/landingPages.ts serialises it with
 * toString), so keep it self-contained: no imports, no helpers or constants from outside its body.
 */
export function detectLocale(languages: readonly string[], timeZone: string | undefined): Locale {
  for (const tag of languages) {
    const t = (tag || '').toLowerCase()
    if (t.indexOf('pt') === 0) return 'pt-BR'
    if (t.indexOf('es') === 0) return 'es'
    if (t.indexOf('en') === 0) break
  }
  const tz = timeZone || ''
  if (
    /^(Brazil\/|Europe\/Lisbon$|Atlantic\/(Madeira|Azores)$|America\/(Sao_Paulo|Rio_Branco|Manaus|Cuiaba|Campo_Grande|Belem|Fortaleza|Recife|Bahia|Maceio|Araguaina|Santarem|Porto_Velho|Boa_Vista|Eirunepe|Noronha)$)/.test(tz)
  )
    return 'pt-BR'
  if (
    /^(Europe\/Madrid|Africa\/Ceuta|Atlantic\/Canary|Pacific\/(Galapagos|Easter)|America\/(Argentina\/.+|Buenos_Aires|Cordoba|Mendoza|Bogota|Caracas|Lima|Santiago|Punta_Arenas|Coyhaique|Montevideo|Asuncion|La_Paz|Guayaquil|Guatemala|Tegucigalpa|El_Salvador|Managua|Costa_Rica|Panama|Havana|Santo_Domingo|Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Mazatlan|Bahia_Banderas|Hermosillo|Tijuana))$/.test(tz)
  )
    return 'es'
  return 'en'
}

/** The fixed text drawn into the video, in the project's video language. */
export interface VideoText {
  nowPlaying: string
  upNext: string
  previous: string
  unknownTrack: string
  unknownArtist: string
}

const VIDEO_TEXT: Record<Locale, VideoText> = {
  en: { nowPlaying: 'NOW PLAYING', upNext: 'UP NEXT', previous: 'PREVIOUS', unknownTrack: 'Unknown track', unknownArtist: 'Unknown artist' },
  'pt-BR': { nowPlaying: 'TOCANDO AGORA', upNext: 'A SEGUIR', previous: 'ANTERIOR', unknownTrack: 'Faixa desconhecida', unknownArtist: 'Artista desconhecido' },
  es: { nowPlaying: 'SONANDO AHORA', upNext: 'A CONTINUACIÓN', previous: 'ANTERIOR', unknownTrack: 'Tema desconocido', unknownArtist: 'Artista desconocido' }
}

export const videoText = (locale: Locale | undefined): VideoText => VIDEO_TEXT[locale ?? 'en'] ?? VIDEO_TEXT.en
