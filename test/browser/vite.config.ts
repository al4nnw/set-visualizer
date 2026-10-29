import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Builds the page the browser analysis check (run.ts) loads.
export default defineConfig({
  root: __dirname,
  resolve: { alias: { '@shared': resolve(__dirname, '../../src/shared') } },
  build: { outDir: resolve(__dirname, '../../out/browser-test'), emptyOutDir: true, rollupOptions: { input: resolve(__dirname, 'harness.html') } },
  worker: { format: 'es' },
  logLevel: 'warn'
})
