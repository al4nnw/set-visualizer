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
npm run dev:web    # the web version at http://localhost:5174 (npm run build:web builds it into out/web)
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
src/renderer/   React UI, Platform interface (platform/), UI catalogs (i18n/), WebCodecs export worker, browser set analysis (analysis/)
src/web/        entry page of the web version
src/node/       headless Skia/x264 exporter used by the CLI
scripts/        render-cli.ts, compare-analysis.ts
test/browser/   the browser analysis checked against the desktop's in a real browser (npm run test:browser)
```

## Languages

The UI comes in English, Brazilian Portuguese and Spanish (Settings ▸ Language, following the system by default). The text drawn into the video ("NOW PLAYING", "UP NEXT"…) has its own language per project (Style ▸ Video language), so a set can be published for a different audience than the app's language. New projects start in the UI language.

UI text lives in `src/renderer/src/i18n/` (`en.ts` is the source; `pt-BR.ts` and `es.ts` must have every key, which the type check and `test/i18n.test.ts` enforce). Video text is in `src/shared/i18n.ts`, since the scene renderer runs in workers and the CLI too.

## Toward a web version

The editor talks to its shell through the `Platform` interface (`src/renderer/src/platform/`), not to Electron: the desktop app implements it over IPC (`electron.ts`) and the web version with browser APIs (`web.ts`). `npm run dev:web` runs the same editor in the browser: open a recording and its .cue, and it shows the waveform, places the tracks and finds the takeovers. Artwork search and video export aren't in the web version yet and say so.

**Projects in the browser** are kept in its own storage (IndexedDB, `src/renderer/src/platform/webStore.ts`), on that computer only: opening a recording creates its project, autosave works as on the desktop, and the recent list is where they're kept (Preferences can delete them). The recording itself is never copied: in Chrome and Edge the browser's handle to the file is kept, so a project reopens on a later visit (the browser may ask to allow reading it), and other browsers ask the user to pick the recording again. Each recording's analysis is kept too, so reopening doesn't analyse again. File ▸ Save As writes a .djvis to disk (with its images inside), which File ▸ Open brings back into any browser.

**Set analysis in the browser** (`src/renderer/src/analysis/`) runs on the computer's own cores in Web Workers; the recording is never uploaded. WAV, RF64 and AIFF are read straight from the file (`src/shared/pcm.ts`), each worker taking the next piece of the set. MP3, FLAC, M4A/AAC, Ogg (Vorbis, Opus) and WebM are decoded by the browser (WebCodecs, with Mediabunny reading the container). MP3 and FLAC decode the same from mid-file, so every worker decodes its own piece (with a few packets before it to warm its decoder up) and the result is identical to decoding in one piece; the other codecs are decoded on one worker that hands each piece to whichever worker is free. Those need a browser with WebCodecs audio (Chrome, Edge); a codec the browser can't decode gets a message suggesting WAV.

It gives the desktop app's result, not an approximation: `src/shared/analyseSource.ts` and `src/shared/dsp.ts` run the same filter graph the desktop gives ffmpeg (`src/main/audio.ts`, spelled out there for this reason), with ffmpeg's biquads in the same float arithmetic, libswresample's resampler (its inner loop in WebAssembly SIMD, `src/shared/resample.wat`, rebuilt with `npm run build:wasm`), and its stereo downmix and gapless trimming (`src/shared/mp3.ts` for MP3). On test sets 99.9 to 100% of the waveform values are identical (the rest differ by one step of 0.001) and every takeover is the same. Two checks keep it that way:

```bash
npm run test:browser                              # a synthetic set in 9 formats, in Electron's Chromium
npm run test:browser -- set.wav --cue set.cue     # your own recordings (on Linux without a display: xvfb-run -a)
npm run compare-analysis -- set.wav --cue set.cue # the same math in Node against ffmpeg, without a browser
```

A 2-hour set takes about 7 s as WAV, 11 s as FLAC and 17 s as MP3 on 4 cores (the desktop's ffmpeg: 32, 12 and 36 s). Still to do for the web: muxing the MP4 in the browser (see the web study).

## Notes and limits

- YouTube search scrapes the public results page (`yt-search`) and SoundCloud uses its public web client id. Both work without API keys but can break if those sites change; Apple Music and Deezer use their public JSON APIs.
- Export speed depends on the machine; a GPU makes a big difference. A 2-hour set at 1080p30 is 216,000 frames.
