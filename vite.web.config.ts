import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { landingPages } from './scripts/landingPages'

// The site (src/web): a static marketing front page at / and the pricing, terms, refund and
// privacy pages (each also at /pt-BR/ and /es/, see scripts/landingPages.ts), the app at
// /app.html, and the browser platform implementation (src/renderer/src/platform/web.ts) behind it.
//   npm run dev     serves it at http://localhost:5174
//   npm run build   builds a static site into out/web
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  plugins: [react(), landingPages(resolve(__dirname, 'src/web'))],
  server: { port: 5174, fs: { allow: [__dirname] } },
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'src/web/index.html'),
        pricing: resolve(__dirname, 'src/web/pricing.html'),
        terms: resolve(__dirname, 'src/web/terms.html'),
        refund: resolve(__dirname, 'src/web/refund.html'),
        privacy: resolve(__dirname, 'src/web/privacy.html'),
        app: resolve(__dirname, 'src/web/app.html')
      }
    }
  },
  worker: { format: 'es' }
})
