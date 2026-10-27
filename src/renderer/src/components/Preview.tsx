import { useEffect, useMemo, useRef, useState } from 'react'
import { drawFrame, prepareScene, type ArtAsset, type Ctx } from '@shared/scene'
import type { Project } from '@shared/types'
import { loadArtMap, offscreenFactory } from '../sceneAssets'

interface Props {
  project: Project
  audio: HTMLAudioElement | null
  /** Used while paused (e.g. scrubbing the timeline). */
  time: number
}

const PREVIEW_HEIGHT = 720

/** Live preview drawn with the exact same scene code as the exported video. */
export function Preview({ project, audio, time }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [art, setArt] = useState<Map<string, ArtAsset>>(new Map())
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    document.fonts.ready.then(() => Promise.all(['400', '500', '700', '800'].map((w) => document.fonts.load(`${w} 20px Inter`)))).then(() => setFontsReady(true))
  }, [])

  const artKey = project.tracks.map((t) => `${t.id}:${t.artwork ?? ''}`).join('|')
  useEffect(() => {
    let alive = true
    loadArtMap(project).then((m) => alive && setArt(m))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artKey])

  const { width, height } = project.settings
  const pw = Math.round((width / height) * PREVIEW_HEIGHT)
  const prep = useMemo(() => {
    const p: Project = { ...project, settings: { ...project.settings, width: pw, height: PREVIEW_HEIGHT } }
    return prepareScene(p, art, offscreenFactory)
    // fontsReady forces a redraw once Inter has loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.tracks, project.settings, project.waveform, project.duration, art, pw, fontsReady])

  const timeRef = useRef(time)
  timeRef.current = time

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d') as Ctx | null
    if (!ctx) return
    let raf = 0
    const loop = () => {
      const t = audio && !audio.paused ? audio.currentTime : timeRef.current
      drawFrame(ctx, prep, t)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(raf)
  }, [prep, audio])

  return (
    <div className="preview">
      <canvas ref={canvasRef} width={pw} height={PREVIEW_HEIGHT} />
    </div>
  )
}
