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
