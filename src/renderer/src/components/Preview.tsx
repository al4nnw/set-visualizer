import { useEffect, useMemo, useRef, useState } from 'react'
import { drawAppOverlay, drawFrame, isSocial, prepareScene, type ArtAsset, type Ctx } from '@shared/scene'
import type { Project } from '@shared/types'
import { platform } from '../platform'
import { loadArtMap, offscreenFactory } from '../sceneAssets'

interface Props {
  project: Project
  audio: HTMLAudioElement | null
  /** Used while paused (e.g. scrubbing the timeline). */
  time: number
  /** The clip looping in Program, so the completion line fills over it as it will in the export. */
  range?: { from: number; to: number }
}

/** The preview renders with 720 px on the short side and is scaled to fit the viewer. */
const PREVIEW_SHORT = 720

/** Live preview drawn with the exact same scene code as the exported video. */
export function Preview({ project, audio, time, range }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [art, setArt] = useState<Map<string, ArtAsset>>(new Map())
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    document.fonts.ready.then(() => Promise.all(['400', '500', '700', '800'].map((w) => document.fonts.load(`${w} 20px Inter`)))).then(() => setFontsReady(true))
  }, [])

  const artKey = project.tracks.map((t) => `${t.id}:${t.artwork ?? ''}`).join('|')
  useEffect(() => {
    let alive = true
    loadArtMap(project, platform.mediaUrl).then((m) => alive && setArt(m))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artKey])

  const { width, height } = project.settings
  const k = PREVIEW_SHORT / Math.min(width, height)
  const pw = Math.round(width * k)
  const ph = Math.round(height * k)
  const prep = useMemo(() => {
    const p: Project = { ...project, settings: { ...project.settings, width: pw, height: ph } }
    return prepareScene(p, art, offscreenFactory, range)
    // fontsReady forces a redraw once Inter has loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.tracks, project.settings, project.waveform, project.duration, art, pw, ph, fontsReady, range?.from, range?.to])

  const timeRef = useRef(time)
  timeRef.current = time

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d') as Ctx | null
    if (!ctx) return
    let raf = 0
    let drawn = NaN
    const loop = () => {
      const t = audio && !audio.paused ? audio.currentTime : timeRef.current
      // Only redraw when time moves, so an idle preview doesn't compete with an export for the GPU.
      if (t !== drawn) {
        drawFrame(ctx, prep, t)
        // The apps' buttons, over the preview only, to check a social layout against them.
        const s = prep.project.settings
        if (isSocial(s)) drawAppOverlay(ctx, s, s.appOverlay ?? 'tiktok')
        drawn = t
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [prep, audio])

  return (
    <div className="preview">
      <canvas ref={canvasRef} width={pw} height={ph} />
    </div>
  )
}
