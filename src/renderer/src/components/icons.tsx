/** Monochrome line icons (16px grid), drawn with currentColor. */
const paths: Record<string, string> = {
  play: 'M5 3.5v9l7.5-4.5z',
  pause: 'M5 3.5v9M11 3.5v9',
  prev: 'M4 3.5v9M12.5 3.5 6 8l6.5 4.5z',
  next: 'M12 3.5v9M3.5 3.5 10 8l-6.5 4.5z',
  start: 'M3 3.5v9M13 3.5 8.5 8l4.5 4.5zM8.5 3.5 4 8l4.5 4.5z',
  end: 'M13 3.5v9M3 3.5 7.5 8 3 12.5zM7.5 3.5 12 8l-4.5 4.5z',
  back: 'M8.5 4.5 5 8l3.5 3.5M12.5 4.5 9 8l3.5 3.5',
  fwd: 'M7.5 4.5 11 8l-3.5 3.5M3.5 4.5 7 8l-3.5 3.5',
  plus: 'M8 3v10M3 8h10',
  minus: 'M3 8h10',
  fit: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  gear: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  speaker: 'M2.5 6v4h2.5L9 13V3L5 6zM11.5 5.5a3.5 3.5 0 0 1 0 5',
  speakerLow: 'M2.5 6v4h2.5L9 13V3L5 6z',
  speakerOff: 'M2.5 6v4h2.5L9 13V3L5 6zM11 6.5l3 3M14 6.5l-3 3',
  deck: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  lock: 'M4.5 7.5h7v6h-7zM6 7.5V5.5a2 2 0 0 1 4 0v2',
  file: 'M4 1.5h5l3 3v10H4zM9 1.5v3h3',
  folder: 'M1.5 4h4.5l1.5 1.5h7v8h-13z',
  music: 'M6 12V3.5l7-1.5v8.5M6 12a1.75 1.75 0 1 1-3.5 0A1.75 1.75 0 0 1 6 12zM13 10.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0z',
  cue: 'M3 2.5h10v11H3zM5.5 5.5h5M5.5 8h5M5.5 10.5h3',
  export: 'M8 10.5V2M4.5 5.5 8 2l3.5 3.5M2.5 10v3.5h11V10',
  check: 'M3 8.5 6.5 12 13 4.5',
  dot: 'M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  search: 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.5 10.5l3 3',
  image: 'M2 3h12v10H2zM2 11l3.5-3.5L8 10l2-2 4 4M10.5 5.5h.01',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 9h6l.5-9',
  chevron: 'M6 4l4 4-4 4',
  close: 'M4 4l8 8M12 4l-8 8',
  fullscreen: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  fullscreenExit: 'M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5'
}

const filled = new Set(['play', 'prev', 'next', 'start', 'end', 'dot'])

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  const d = paths[name]
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d={d} fill={filled.has(name) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
