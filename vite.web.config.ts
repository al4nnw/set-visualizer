import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web version: the desktop app's renderer on the browser platform (src/renderer/src/platform/web.ts).
//   npm run dev:web     serves it at http://localhost:5174
//   npm run build:web   builds a static site into out/web
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  plugins: [react()],
  server: { port: 5174, fs: { allow: [__dirname] } },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true },
  worker: { format: 'es' }
})
