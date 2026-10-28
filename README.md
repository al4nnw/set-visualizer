# Set Visualizer

Desktop app (Electron) that turns a recorded DJ set into a YouTube-ready video:

- **Full-set waveform** along the bottom with a playhead, track markers, and a zoomed "deck" waveform above it.
- **Track A / Track B cards**: the main track sits on the left, the next track fades in on the right while you mix it in, and when it takes over it slides smoothly to the left while the old one slides out.
- **Track art and titles** from YouTube, SoundCloud, Apple Music or Deezer, or your own image. Everything is editable.
- **Editor layout** like a video editor: program monitor top-left, inspector on the right (Tracks, Style, Project), timeline along the bottom with Set audio / Deck A / Deck B lanes. Panels resize by dragging the gaps between them.
- **Timeline** with deck A/B lanes. Drag a track to move where it takes over, drag the striped mix-in area to change when it appears on the right.
- **Rekordbox .cue import**: the cue sheet Rekordbox writes next to a recording places every track.
- **Projects with autosave**: opening a recording creates its `.djvis` project straight away, and every change (including the imported .cue) is saved into it.
- **YouTube chapters** text generated from the tracklist.

## Getting started

```bash
npm install
npm run dev        # run the app with hot reload
npm run dist       # build an installer for your OS into dist/
```

ffmpeg and ffprobe come bundled (`ffmpeg-static`, `ffprobe-static`), nothing else to install.

## Workflow

1. **Record** your set in Rekordbox (REC panel). It saves the audio and a `.cue` next to it.
2. **Drop the recording** on the window (or File ▸ Import Set Recording, `Ctrl+I`). Drop the `.cue` with it to place the tracks in one go. This creates `<recording name>.djvis` in the projects folder (`Documents/Set Visualizer` by default, change it in Settings) and from then on every change is autosaved.
3. **Import the .cue** later if you didn't drop it (File ▸ Import Rekordbox Cue, `Ctrl+Shift+I`). The cue sheet is stored in the project, and the app finds where each track takes over in the audio.
4. **Fix the timing** if needed: play the transition and press `A` where the next track mixes in, `S` where it takes over and `D` where the old one stops. Or select a track and use **Playhead** next to "Mix in", "Takes over" or "Plays until", or drag it on the timeline.
5. **Clips** tab (next to Program): once the .cue is in, the app suggests short clips of the set's best moments, the transitions, the drops after a breakdown and the most driving stretch of each track, ranked best first. **Play** loops a clip in Program in the clip format; Make a clip longer or shorter with the ‹ › buttons next to its start and end (1 s, Shift for 5 s), the 15 / 30 / 60 s lengths, or **Start here** / **End here** at the playhead while it loops; your trims are saved in the project. **Export** renders just that clip in 9:16 (the default, only the close-up waveform) or 16:9. The first time a set gets clips, a note points at the tab.
6. **Artwork**: thumbnails are looked up on YouTube automatically. To change one, select the track ▸ **Find artwork…** (YouTube, SoundCloud, Apple Music, Deezer), paste an image URL, or choose a local image.
7. **Style** tab: DJ name, set title, deck colours, transition timing.
8. **Export** (top right, `Ctrl+E`): resolution (720p–4K), fps, quality. Copy the YouTube chapters into your video description.

Menus: **File** (new, open, open recent, import, save, save as, export), **Edit** (undo/redo, tracks, Settings `Ctrl+,`), **View** (timeline zoom, panels), **Playback**, **Help ▸ Keyboard Shortcuts** (`Ctrl+/`). On macOS the shortcuts use `⌘`.

Keyboard: `Space` play/pause, `A`/`S`/`D` mix in / takes over / plays until at the playhead (`Shift+A`/`Shift+D` clear), `←`/`→` seek 5 s (`Shift` 30 s), `↑`/`↓` previous/next track, `Home/End`, `M` add a track at the playhead, `Delete` remove the selected track, `=`/`-`/`\` zoom the timeline. `Ctrl/Alt + scroll` zooms around the pointer.

Projects save as `.djvis` (JSON: tracks, settings and the imported cue sheet; the audio and art stay where they are, art is cached in the app's user-data folder). The analysed waveform and spectrum live in the user-data folder's `analysis` cache, keyed by the recording's path, size and date, so a project file stays a few KB and autosave is instant. Opening a project on a computer without that cache analyses the set again. Projects saved by older versions carry their waveform and still open. Settings and the recent projects list live in `settings.json` in the user-data folder.

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
src/shared/     scene renderer, A/B card layout, cue sheet parser, set analysis math, video text (no Node or DOM deps)
src/main/       Electron main: projects/autosave, search, art download, export muxing; audio analysis runs in a worker thread (analysisWorker.ts, one ffmpeg decode per set) and is cached (analysisCache.ts)
src/preload/    the API the UI uses (window.api)
src/renderer/   React UI, Platform interface (platform/), UI catalogs (i18n/), WebCodecs export worker
src/node/       headless Skia/x264 exporter used by the CLI
scripts/        render-cli.ts
```

## Languages

The UI comes in English, Brazilian Portuguese and Spanish (Settings ▸ Language, following the system by default). The text drawn into the video ("NOW PLAYING", "UP NEXT"…) has its own language per project (Style ▸ Video language), so a set can be published for a different audience than the app's language. New projects start in the UI language.

UI text lives in `src/renderer/src/i18n/` (`en.ts` is the source; `pt-BR.ts` and `es.ts` must have every key, which the type check and `test/i18n.test.ts` enforce). Video text is in `src/shared/i18n.ts`, since the scene renderer runs in workers and the CLI too.

## Toward a web version

The editor talks to its shell through the `Platform` interface (`src/renderer/src/platform/`), not to Electron: the desktop app implements it over IPC (`electron.ts`), and a web build will implement the same interface with browser APIs. The set analysis math (waveform envelopes, spectral frames) is in `src/shared/analysis.ts` with no Node dependencies; the desktop app feeds it samples decoded by ffmpeg, a browser worker will feed it samples from WebCodecs/WAV parsing. Still to do for the web: browser audio decode, muxing the MP4 in the browser, and browser storage for projects (see the web study).

## Notes and limits

- YouTube search scrapes the public results page (`yt-search`) and SoundCloud uses its public web client id. Both work without API keys but can break if those sites change; Apple Music and Deezer use their public JSON APIs.
- Export speed depends on the machine; a GPU makes a big difference. A 2-hour set at 1080p30 is 216,000 frames.
