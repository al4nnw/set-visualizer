# Set Visualizer

Desktop app (Electron) that turns a recorded DJ set into a YouTube-ready video:

- **Full-set waveform** along the bottom with a playhead, track markers, and a zoomed "deck" waveform above it.
- **Track A / Track B cards**: the main track sits on the left, the next track fades in on the right while you mix it in, and when it takes over it slides smoothly to the left while the old one slides out.
- **Track art and titles** from YouTube, SoundCloud, Apple Music or Deezer, or your own image. Everything is editable.
- **Timeline** with deck A/B lanes. Drag a track to move where it takes over, drag the striped mix-in area to change when it appears on the right.
- **Track identification** with [AudD](https://audd.io) (optional, needs an API token), or import a tracklist.
- **YouTube chapters** text generated from the tracklist.

## Getting started

```bash
npm install
npm run dev        # run the app with hot reload
npm run dist       # build an installer for your OS into dist/
```

ffmpeg and ffprobe come bundled (`ffmpeg-static`, `ffprobe-static`), nothing else to install.

## Workflow

1. **Record** your set in Rekordbox (REC panel). It saves a WAV.
2. **Drop the WAV** on the app window. Drop a tracklist file with it if you have one.
3. **Get the tracklist**, any of:
   - **Identify tracks**: paste your AudD token, pick how often to sample (every 45 s is a good default; a 2-hour set is ~160 requests). Each recognised song is placed where it was first heard, marked with a dashed outline until you confirm it.
   - **Import tracklist**: `.cue` (with times), Rekordbox history export `.txt` (Rekordbox writes UTF-16; it has no times, so tracks are spread evenly for you to drag into place), `.m3u8`, or a plain text list like `00:00 Artist - Title` / `[1:02:03] Artist - Title`.
   - **+ Add** tracks by hand at the playhead.
4. **Fix the timing**: play the set, and hit **⇤ now** next to "Becomes main at" when the next track takes over. Optionally set "Mix-in" for when it should appear on the right (default is 45 s before; configurable in Export).
5. **Artwork**: select a track → **Find on YouTube / SoundCloud**. Pick a result to use its image (tick "Also use the result's title and artist" to copy those too), paste an image URL, or choose a local image. YouTube letterbox bars are trimmed automatically.
6. **Export video**: choose resolution (720p–4K), fps, quality, DJ name, set title, colours. Copy the YouTube chapters into your video description.

Keyboard: `Space` play/pause, `←/→` seek 5 s (`Shift` 30 s), `⌘/Ctrl+Z` undo, `⌘/Ctrl+Shift+Z` redo, `⌘/Ctrl+S` save, `Delete` remove selected track. `Ctrl/⌘ + scroll` zooms the timeline.

Projects save as `.djvis` (JSON: tracks, settings, and the analysed waveform; the audio and art stay where they are, art is cached in the app's user-data folder).

## How rendering works

`src/shared/scene.ts` draws one frame from `(project, time)`. The same function draws the live preview and the exported video, so the preview is exact.

Export runs in a Web Worker: it draws each frame on an `OffscreenCanvas` and encodes H.264 with WebCodecs (the GPU/hardware encoder on macOS and Windows when available). The encoded stream goes to the main process, which muxes it with the original audio (AAC 320k) using ffmpeg.

There is also a headless exporter (Skia + x264 in worker threads) for scripting or a future server:

```bash
npm run render -- path/to/set.wav --tracklist set.cue --out set.mp4 --dj "Alan" --title "Live session"
npm run render -- --project my-set.djvis --out set.mp4 --width 1280 --height 720
```

## Project layout

```
src/shared/     scene renderer, A/B card layout, tracklist parsers (no Node or DOM deps)
src/main/       Electron main: audio analysis, AudD, search, art download, export muxing
src/preload/    the API the UI uses (window.api)
src/renderer/   React UI + WebCodecs export worker
src/node/       headless Skia/x264 exporter used by the CLI
scripts/        render-cli.ts
```

## Toward a web version

Everything in `src/shared` and the renderer's export worker is plain web platform code (Canvas, WebCodecs). A web build would need to replace the `window.api` calls: decode audio with Web Audio for the waveform, mux in the browser (e.g. `mp4-muxer` + an `AudioEncoder`) or on a server, and move search/AudD calls behind a small backend (they need a server for CORS and to keep the AudD token private).

## Notes and limits

- YouTube search scrapes the public results page (`yt-search`) and SoundCloud uses its public web client id. Both work without API keys but can break if those sites change; Apple Music and Deezer use their public JSON APIs.
- Fingerprinting can't find unreleased tracks or IDs, and the time it reports is when the track was first heard, not the exact mix point, so check the times.
- Export speed depends on the machine; a GPU makes a big difference. A 2-hour set at 1080p30 is 216,000 frames.
