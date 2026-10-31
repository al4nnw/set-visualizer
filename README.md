# Set Visualizer

Web app that turns a recorded DJ set into a YouTube-ready video, right in the browser (the recording never leaves the computer):

- **Close-up waveform** that scrolls under the playhead, coloured by deck, with track boundaries. It sits in the top, middle or bottom lane of the area under the cards (Style ▸ Waveform ▸ Position).
- **Three formats** (Style ▸ Format): 16:9 for YouTube, 9:16 for phones, and **Social** for TikTok and Reels, a 9:16 layout that keeps the title, cards and waveform clear of the apps' buttons and captions, with the waveform on the first line, right of the REKCUT name (across the whole line on a paid plan).
- **No watermark on paid plans**: free exports carry the REKCUT name; Monthly and Lifetime exports don't.
- **Completion line** along the very bottom that fills up as the video (or clip) plays, which helps people keep watching. Style ▸ Completion line sets its look (flat, rounded or glow), size, how much it pulses on the kicks, and its colour (the playing deck's, or your own).
- **App buttons preview** in Social: grey stand-ins for the TikTok or Reels buttons and captions over the preview, to check the layout. They're never in the export.
- **Track A / Track B cards**: the main track sits on the left, the next track fades in on the right while you mix it in, and when it takes over it slides smoothly to the left while the old one slides out.
- **Track art and titles**: looked up on Deezer and Apple Music automatically (and YouTube once you're signed in), or paste an image URL or choose your own image. Everything is editable.
- **Editor layout** like a video editor: program monitor top-left, inspector on the right (Tracks, Style, Project), timeline along the bottom with Set audio / Deck A / Deck B lanes. Panels resize by dragging the gaps between them.
- **Timeline** with deck A/B lanes. Drag a track to move where it takes over, drag the striped mix-in area to change when it appears on the right.
- **Rekordbox .cue import**: the cue sheet Rekordbox writes next to a recording places every track.
- **Projects with autosave**: opening a recording creates its project in the browser straight away, and every change (including the imported .cue) is saved into it.
- **YouTube chapters** text generated from the tracklist.

## Getting started

You need Node.js 22 (what CI and the Cloud Functions use) and Chrome or Edge.

```bash
npm install
npm ci --prefix functions   # the functions' packages, needed by npm test
npm run dev        # the app at http://localhost:5174 with hot reload
npm run build      # a static site in out/web (npm run preview serves it)
npm run typecheck  # tsc, as CI runs it
npm test           # vitest
```

The local app talks to the real Firebase project for sign-in, YouTube search and exports. To try sign-in and exports without it, run `npm run emulators` in one terminal and `npm run dev:emulators` in another, then call `emulatorSignIn('you@example.com')` in the browser console.

Working on the code, or pointing a coding agent at it? Read [AGENTS.md](AGENTS.md) first: the architecture, the rules that aren't up for debate, and the gotchas. (`CLAUDE.md` just loads it for Claude Code.)

The site is hosted on Firebase (project `set-visualizer-app`, functions in `southamerica-east1`). Every push to `main` deploys it through GitHub Actions (`.github/workflows/deploy.yml`), so there's no need to deploy by hand. YouTube search runs in a Firebase function (`functions/`) for signed-in users, so the Data API key stays server-side; nothing about the set is sent there. Chrome or Edge is recommended: they decode every format the app reads and can write the video and reopen recordings straight from disk.

## Workflow

1. **Record** your set in Rekordbox (REC panel). It saves the audio and a `.cue` next to it.
2. **Drop the recording** on the page (or File ▸ Import Set Recording, `Ctrl+I`). Drop the `.cue` with it to place the tracks in one go. This creates the project in the browser's storage, and from then on every change is autosaved.
3. **Import the .cue** later if you didn't drop it (File ▸ Import Rekordbox Cue, `Ctrl+Shift+I`). The cue sheet is stored in the project, and the app finds where each track takes over in the audio.
4. **Fix the timing** if needed: play the transition and press `A` where the next track mixes in, `S` where it takes over and `D` where the old one stops. Or select a track and use **Playhead** next to "Mix in", "Takes over" or "Plays until", or drag it on the timeline.
5. **Clips** tab (next to Program): once the .cue is in, the app suggests short clips of the set's best moments, the transitions, the drops after a breakdown and the most driving stretch of each track, ranked best first. **Play** loops a clip in Program in the clip format; Make a clip longer or shorter with the ‹ › buttons next to its start and end (1 s, Shift for 5 s), the 15 / 30 / 60 s lengths, or **Start here** / **End here** at the playhead while it loops; your trims are saved in the project. **Export** renders just that clip in 9:16 (the default), 16:9 or Social. The first time a set gets clips, a note points at the tab.
6. **Artwork**: looked up automatically (Deezer, else Apple Music, else YouTube when signed in). To change one, select the track ▸ **Find artwork…** (Deezer, Apple Music, YouTube), paste an image URL, or choose a local image.
7. **Style** tab: format, set title (it names the exported files; it isn't drawn in the video for now), waveform position, completion line, deck colours, transition timing. Free exports carry the REKCUT name (`BRAND` in `src/shared/types.ts`), which isn't editable; paid plans export without it.
8. **Export** (top right, `Ctrl+E`): resolution (720p–4K), fps, quality. Exporting needs a Google sign-in; the first 3 exports are free, then a Monthly or Lifetime plan (see `functions/src/billing/README.md`). The video arrives as a regular browser download. Copy the YouTube chapters into your video description.

Menus: **File** (new, open, open recent, import, save, save as, export), **Edit** (undo/redo, tracks, Settings `Ctrl+,`), **View** (timeline zoom, panels), **Playback**, **Help ▸ Keyboard Shortcuts** (`Ctrl+/`). On macOS the shortcuts use `⌘`.

Keyboard: `Space` play/pause, `A`/`S`/`D` mix in / takes over / plays until at the playhead (`Shift+A`/`Shift+D` clear), `←`/`→` seek 5 s (`Shift` 30 s), `↑`/`↓` previous/next track, `Home/End`, `M` add a track at the playhead, `Delete` remove the selected track, `=`/`-`/`\` zoom the timeline. `Ctrl/Alt + scroll` zooms around the pointer.

**Projects** are kept in the browser's own storage (IndexedDB, `src/renderer/src/platform/webStore.ts`), on that computer only: opening a recording creates its project, autosave keeps it up to date, and the recent list is where they're kept (Settings can delete them). The recording itself is never copied: in Chrome and Edge the browser's handle to the file is kept, so a project reopens on a later visit (the browser may ask to allow reading it), and other browsers ask the user to pick the recording again. Each recording's analysis is kept too, so reopening doesn't analyse again. File ▸ Save As writes a `.djvis` file to disk (JSON: tracks, settings, the imported cue sheet and its images), which File ▸ Open brings back into any browser.

## How rendering works

`src/shared/scene.ts` draws one frame from `(project, time)`. The same function draws the live preview and the exported video, so the preview is exact.

Export runs in a Web Worker: it draws each frame on an `OffscreenCanvas` and encodes H.264 with WebCodecs (the GPU/hardware encoder where the browser has one). The MP4 is put together in the browser (`src/renderer/src/platform/webExport.ts`, Mediabunny) with the set's audio encoded as AAC, or Opus where the browser has no AAC encoder (Chrome on Linux). It arrives as a regular browser download in every browser.

## Project layout

```
src/shared/            scene renderer, A/B card layout, cue sheet parser, set analysis math, video text (no DOM deps)
src/renderer/src/      React UI, Platform interface and its browser implementation (platform/), UI catalogs (i18n/), WebCodecs export worker, set analysis (analysis/)
src/web/               the entry page (vite.web.config.ts)
functions/             Firebase Cloud Functions: YouTube search, and accounts / free exports / plans (src/billing)
scripts/               compare-analysis.ts, build-wasm.ts, make-tutorial.ts; ffmpeg/ is the reference analysis the browser's is checked against
test/browser/          the browser analysis checked against ffmpeg's in a real browser (npm run test:browser)
```

## Languages

The UI comes in English, Brazilian Portuguese and Spanish (Settings ▸ Language, following the system by default). The text drawn into the video ("NOW PLAYING", "UP NEXT"…) has its own language per project (Style ▸ Video language), so a set can be published for a different audience than the app's language. New projects start in the UI language.

UI text lives in `src/renderer/src/i18n/` (`en.ts` is the source; `pt-BR.ts` and `es.ts` must have every key, which the type check and `test/i18n.test.ts` enforce). Video text is in `src/shared/i18n.ts`, since the scene renderer also runs in the export worker.

## Set analysis

The set analysis (`src/renderer/src/analysis/`) runs on the computer's own cores in Web Workers; the recording is never uploaded. WAV, RF64 and AIFF are read straight from the file (`src/shared/pcm.ts`), each worker taking the next piece of the set. MP3, FLAC, M4A/AAC, Ogg (Vorbis, Opus) and WebM are decoded by the browser (WebCodecs, with Mediabunny reading the container). MP3 and FLAC decode the same from mid-file, so every worker decodes its own piece (with a few packets before it to warm its decoder up) and the result is identical to decoding in one piece; the other codecs are decoded on one worker that hands each piece to whichever worker is free. Those need a browser with WebCodecs audio (Chrome, Edge); a codec the browser can't decode gets a message suggesting WAV.

It gives ffmpeg's result, not an approximation: `src/shared/analyseSource.ts` and `src/shared/dsp.ts` run the same filter graph as the ffmpeg reference (`scripts/ffmpeg/audio.ts`, spelled out there for this reason), with ffmpeg's biquads in the same float arithmetic, libswresample's resampler (its inner loop in WebAssembly SIMD, `src/shared/resample.wat`, rebuilt with `npm run build:wasm`), and its stereo downmix and gapless trimming (`src/shared/mp3.ts` for MP3). On test sets 99.9 to 100% of the waveform values are identical (the rest differ by one step of 0.001) and every takeover is the same. Two checks keep it that way (they need ffmpeg: `ffmpeg-static` is a dev dependency, or set `SETVIS_FFMPEG` / `SETVIS_FFPROBE`):

```bash
npm run test:browser                              # a synthetic set in 9 formats, in Playwright's Chromium
npm run test:browser -- set.wav --cue set.cue     # your own recordings (--channel chrome to use your Chrome)
npm run compare-analysis -- set.wav --cue set.cue # the same math in Node against ffmpeg, without a browser
```

A 2-hour set takes about 7 s as WAV, 11 s as FLAC and 17 s as MP3 on 4 cores (ffmpeg: 32, 12 and 36 s).

## Notes and limits

- YouTube search uses the YouTube Data API, whose daily quota is shared by everyone using the site.
- Export speed depends on the machine; a GPU makes a big difference. A 2-hour set at 1080p30 is 216,000 frames.
