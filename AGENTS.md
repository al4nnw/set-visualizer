# Set Visualizer: guide for contributors and coding agents

Set Visualizer turns a recorded DJ set (the audio plus the `.cue` sheet Rekordbox writes next to it) into a YouTube-ready video: two track cards (A/B) that swap as the mix moves on, a scrolling waveform, artwork and titles. It is a **web app only**. Everything heavy happens in the user's browser: decoding, analysis, rendering and H.264 encoding. The backend is a few Firebase Cloud Functions for sign-in-gated YouTube search and export accounting.

The [README](README.md) explains what the app does for a user. This file is about the code.

## Ground rules (decided by the owner, don't reopen them)

1. **Never render or process audio in the cloud.** No server-side upload, decode, analysis or render of a set, not even as an option. Hosting users' recordings would mean hosting copyrighted music. If a feature seems to need it, find a client-side way or drop it.
2. **The backend never stores set data.** No audio, no `.djvis` projects, no track lists, file names, artwork or thumbnail caches. Firestore holds accounts and export counts only (see `functions/src/billing/README.md`). Artwork lookup runs in the browser and is saved in the local project.
3. **Web only.** The Electron desktop build and the Node render CLI were removed on purpose. Don't bring back Node-only rendering paths (`@napi-rs/canvas`, ffmpeg export, etc.). ffmpeg exists only as a dev-time reference for testing the analysis (`scripts/ffmpeg/`).
4. **Export is CPU/browser WebCodecs.** A GPU/NVENC ffmpeg path was tried and dropped (not worth it).
5. **Sign-in is Google only.** Apple and Microsoft were dropped.
6. **Exports need an account:** 3 free exports per account (once, not monthly), then a Monthly (~US$10) or Lifetime (~US$45) plan. Each export is authorised by a **server-signed export ticket**. The payment provider sits behind a swappable interface and none is chosen yet (`BILLING_PROVIDER=none` shows plans as "coming soon").
7. **The watermark is REKCUT, and paid plans drop it.** `BRAND` in `src/shared/types.ts`. The old editable DJ-name field was removed from the Style tab. The signed export ticket says whether the account is on a paid plan, and `runExport.ts` sets the name from it: `BRAND` on free exports, none on paid ones. Don't take the watermark decision from anything the app could change itself.
8. **Every user-facing string goes through i18n.** The app launches worldwide (the owner is in Brazil): English, Brazilian Portuguese and Spanish, all complete.
9. **Two decks, A and B.** The owner mixes on two decks, so at most two tracks play at once. The model (`Deck = 'A' | 'B'`), the timeline lanes and the card layout all assume it. Don't add a third layer.
10. **Exports are plain browser downloads** in every browser (no save picker, no direct disk write).

## Commands

Needs Node.js 22 and Chrome or Edge.

```bash
npm install && npm ci --prefix functions   # both: the billing tests import the functions' packages
npm run dev            # Vite dev server, http://localhost:5174
npm run build          # static site into out/web (npm run preview serves it)
npm run typecheck      # tsc --noEmit; CI runs it before deploying
npm test               # vitest: test/*.test.ts; CI runs it before deploying
npm run test:browser   # browser analysis vs ffmpeg in Playwright Chromium (needs ffmpeg, see below)
npm run compare-analysis -- set.wav --cue set.cue   # same check in Node, without a browser
npm run build:wasm     # regenerate src/shared/resampleWasm.ts from resample.wat
npm run emulators      # Auth + Functions + Firestore emulators (fake payment provider)
npm run dev:emulators  # the app talking to the emulators; emulatorSignIn(email) in the console signs in
npm run make-admin -- you@example.com [--emulators]   # let a signed-up user open the back office
npm --prefix functions run build   # compile the functions (tsc)
```

`npm run dev:web` / `build:web` are aliases kept because `firebase.json` and `.claude/launch.json` use them.

`test:browser` and `compare-analysis` need ffmpeg: `ffmpeg-static` / `ffprobe-static` are dev dependencies, or set `SETVIS_FFMPEG` / `SETVIS_FFPROBE`. In a headless Linux box, run `test:browser` under `xvfb-run -a`.

Before you open a PR: `npm run typecheck && npm test`. If you touched the analysis, also `npm run test:browser`. If you touched `functions/`, also `npm --prefix functions run build`.

## Layout

```
src/shared/          pure TS, no DOM or Node deps; runs on the page, in workers and in tests
  types.ts           Project, Track, RenderSettings, Preferences, DEFAULT_SETTINGS, BRAND
  scene.ts           draws one frame from (project, time): the preview AND the export use it
  layout.ts          A/B card positions, when the incoming track appears and swaps
  swapPlan.ts        per-transition swap curve ("Energy-matched (auto)" picks one)
  motion.ts          card movement driven by the bass (kicks), precomputed per waveform bucket
  tracklist.ts       .cue parser (Rekordbox quirks) and cue entries -> tracks
  takeover.ts        finds where each incoming track actually takes over in the audio
  clips.ts           suggested short clips (transitions, drops, peaks)
  analysis.ts, analyseSource.ts, dsp.ts, pcm.ts, mp3.ts, audioSource.ts, resample.wat
                     set analysis math, matched to ffmpeg (see "Set analysis" below)
  artwork.ts, youtube.ts   artwork provider order, YouTube link helpers
  i18n.ts            languages, and the text drawn INTO the video (per-project video language)
src/renderer/src/    the React app
  App.tsx            app state, commands, menus and keyboard shortcuts
  components/        Viewer/Preview, Timeline, Inspector (Tracks/Style/Project), Clips, dialogs
  platform/          Platform interface (types.ts) and its browser implementation:
    web.ts           files, projects, export target, artwork search
    webStore.ts      IndexedDB ("set-visualizer"): projects, prefs, file handles, analysis cache
    webExport.ts     MP4 muxing with Mediabunny, AAC (or Opus where the browser has no AAC encoder)
    webArt.ts        Deezer / Apple Music / YouTube artwork, all from the browser
    webFirebase.ts   Firebase app, Google sign-in, callable functions (lazy loaded)
  analysis/          analysis workers: segment workers + one decoder worker for compressed audio
  export/            encodeWorker.ts (OffscreenCanvas + WebCodecs H.264), runExport.ts, queue.ts
  account/           account store and dialogs, export ticket check (ticket.ts), back office (BackOffice.tsx)
  i18n/              UI catalogs: en.ts is the source, pt-BR.ts and es.ts must match it
src/web/             entry HTML and bootstrap (vite.web.config.ts roots here)
functions/src/       Cloud Functions (Node 22, region southamerica-east1)
  index.ts           youtubeSearch (signed-in only; the API key is a secret) + re-exports billing
  billing/           accounts, free exports, plans, tickets, payment providers, back office (admin.ts); has its own README
scripts/             ffmpeg/ (reference analysis), compare-analysis, build-wasm, make-tutorial,
                     ticket-key.mjs, deploy.ps1 (manual deploy, rarely needed)
test/                vitest suites; browser/ is the Playwright harness for test:browser
resources/tutorial/  the shortcuts tutorial clip (generated, gitignored)
```

The `@shared/*` import alias points at `src/shared/` (tsconfig + Vite).

## How it works

**One renderer for preview and export.** `src/shared/scene.ts` draws a frame from `(project, time)`. The live preview calls it on a canvas; the export worker calls it on an `OffscreenCanvas`. Change the look there and both follow. Keep it free of DOM-only APIs, since it runs in a worker.

**Export.** `export/queue.ts` runs jobs one at a time in the background. Before a job starts the app calls `claimExport` (spends a free export or confirms a plan, returns a signed ticket); `runExport.ts` verifies the ticket with the public key in `account/ticket.ts` and refuses to render without a valid one; the ticket id goes into the MP4 comment tag. When the job ends the app calls `settleExport`, and a failed or cancelled export gives its free one back. Frames are encoded with WebCodecs H.264 in `encodeWorker.ts` and muxed with the set's audio by Mediabunny in `platform/webExport.ts`.

**Set analysis** runs in Web Workers on the user's cores. WAV/RF64/AIFF are read straight from the file; MP3, FLAC, AAC/M4A, Ogg and WebM are decoded with WebCodecs (Mediabunny reads the container). The result is meant to be **identical to ffmpeg's** for the graph in `scripts/ffmpeg/audio.ts`: same biquads in the same float arithmetic, libswresample's resampler (inner loop in WebAssembly SIMD), same downmix and MP3 gapless trimming. If you change the analysis, change the ffmpeg reference graph to match and run `test:browser`.

**Projects** live in the browser's IndexedDB. The recording itself is never copied: Chrome/Edge keep a file handle so a project can reopen it later; other browsers ask for the file again. File ▸ Save As writes a `.djvis` file (JSON) that File ▸ Open brings back.

**Tracks and the cue sheet.** A `Track` has a `deck` ('A' or 'B'), a `start` (when it takes over as the main track), optional `mixIn` (when it starts being heard and appears on the right) and optional `tailEnd` (when it stops being heard after the swap). Importing a `.cue` sets each track's cue time as its mix-in and then finds the real takeover in the audio (`takeover.ts`). A track that never takes over is `layered`.

**Backend.** `functions/src/index.ts` exports `youtubeSearch` and the billing callables (`accountStatus`, `claimExport`, `settleExport`, `startCheckout`, `billingPortal`) plus the `billingWebhook` HTTP function, and the back office callables (`adminListUsers`, `adminAddExports`, `adminSetPlan`). Firestore rules deny all client access: only the functions read and write it.

**Back office.** Account ▸ Back office lists the users (newest first) and lets an admin give free exports or a Monthly/Lifetime plan without a payment. A user is an admin when `admins/{uid}` exists in Firestore (`npm run make-admin`, or by hand in the console). Every admin call checks that on the server; `accountStatus` only tells the app so it can show the button. Never decide admin access in the app.

## Conventions

- TypeScript strict everywhere. React function components and hooks; no state library (`useHistory.ts` gives undo/redo).
- Comments explain *why* and what a unit is for, in plain sentences, usually a `/** */` block above exports. Match the existing tone.
- New UI strings: add the key to `src/renderer/src/i18n/en.ts`, then the translation to `pt-BR.ts` **and** `es.ts`, with the same `{{placeholders}}` and `<0>` tags. The type check and `test/i18n.test.ts` fail otherwise. Text that is drawn into the video goes in `src/shared/i18n.ts` instead.
- Shared code that would return English text returns plain-data messages (see `src/shared/i18n.ts`) and the UI translates them.
- Logic that can be pure goes in `src/shared/` and gets a vitest test (`test/shared.test.ts`, `test/billing.test.ts`).
- Platform-specific things go behind the `Platform` interface (`platform/types.ts`), not straight into components.
- Commit messages: a plain-English sentence in the imperative saying what changed for the user, e.g. "Export as a regular browser download in every browser". Body explains why when it isn't obvious.
- Work on a branch and open a PR to `main`. **Merging to `main` deploys to production.**

## Deploys and infrastructure

- Firebase / Google Cloud project: **`set-visualizer-app`**. Hosting serves `out/web`; Functions and Firestore are in **`southamerica-east1`**.
- `.github/workflows/deploy.yml` deploys Hosting and Functions on every push to `main` (and by hand from the Actions tab). It runs `npm ci`, `typecheck` and `test` first, and authenticates through Workload Identity Federation, so no key file exists anywhere.
- Secrets live in Google Secret Manager and GitHub Actions secrets, never in the repo: `YOUTUBE_API_KEY` and `EXPORT_TICKET_KEY` (functions), and the WIF provider/service account (Actions). The Firebase web config in `webFirebase.ts` is public by design.
- The export ticket key pair is made with `npm run ticket-key` (owner only). It stores the private half as a secret and writes the public half into `PROD_KEY` in `src/renderer/src/account/ticket.ts`. Never write a private key into the repo or anywhere else.
- Emulators use a separate dev key pair (`DEV_KEY` in the app, `functions/.secret.local` for the functions) so local runs never need the production secret.

## Gotchas

- **Rekordbox `.cue` times are `hh:mm:ss`**, not the spec's `mm:ss:ff` (75 frames per second). `parseCue` detects Rekordbox by its `REM RECORDED_BY "rekordbox..."` line, or by a third field of 75 or more. Don't "fix" it back to frames.
- **`npm test` fails on a fresh clone** with "Cannot find package 'firebase-functions/params'" until `npm ci --prefix functions` has run.
- **Firebase Admin in functions:** initialise the default app by name (`getApps().some(a => a.name === '[DEFAULT]')`). firebase-functions creates its own app first, so `getApps().length` is never 0 and `getFirestore()` would throw `app/no-app`.
- **Sign-in popups need a user click.** `signInWithPopup` must be called from a click handler. After signing in mid-export the user clicks Export again.
- **`apis.google.com` is blocked in some sandboxes**, so the Google popup can't run there. Use the emulators and `emulatorSignIn(email)`.
- **YouTube Data API quota is shared app-wide** (10,000 units/day, ~100 per search). Deezer, then Apple Music, are tried first; YouTube only for signed-in users.
- **Chrome on Linux has no AAC encoder**, so the audio falls back to Opus there; `webExport.ts` also falls back to 48 kHz or a lower bitrate when the browser can't encode the set's audio as is.
- **`src/shared/resampleWasm.ts` is generated.** Edit `resample.wat` and run `npm run build:wasm`.
- **The tutorial clip isn't in the repo** (`resources/tutorial/tutorial.*` is gitignored), so Help ▸ Shortcuts Tutorial says "not installed" unless you generate it with `npm run make-tutorial -- set.wav set.cue`.
- **Before production exports work**, Firestore must exist in `southamerica-east1` and `npm run ticket-key` must have run. Otherwise exports can't start, or the deploy fails.

## Keeping these docs up to date

These files are only useful while they're true, so updating them is part of the change that makes them wrong, in the same PR, not a later cleanup. Agents: do this without being asked.

| File | What belongs there | Update it when |
| --- | --- | --- |
| `README.md` | What the app does for a user, the workflow, how to run it locally | A user-visible feature, menu, shortcut or setup step changes |
| `AGENTS.md` | How the code works and how to work in it: rules, layout, commands, conventions, gotchas | A file or folder moves, a command or script changes, a convention is set, or something surprising cost you time |
| `CLAUDE.md` | Only `@AGENTS.md` | Never: put the content in AGENTS.md so every agent reads the same thing |
| `functions/src/billing/README.md` | Accounts, plans, tickets, payment providers | Billing or the provider setup changes |

How to write them:

- **Ground rules are the owner's decisions.** Add, change or remove one only when the owner decides it, and say so in the PR description. Don't loosen one to make a change fit.
- **Gotchas earn their place.** Add one when something isn't obvious from the code and someone would get it wrong: say what happens and what to do instead. Remove it when the code no longer has the problem.
- **Check before you write.** Every path, command and name in these files should exist. Run the commands you document.
- **Keep it short and current.** Describe how things are now, not their history (that's in git). Replace a stale line instead of adding a new one under it. Plain sentences, the same tone as the rest.
- **No secrets.** Name a secret and where it lives (Secret Manager, GitHub Actions secrets), never its value, and no private keys, tokens or personal data.
- **English only.** The docs are for contributors; the app's own text is what gets translated.
