import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const THEME_COLOR = '#2340A8'
const BACKGROUND_COLOR = '#F4F6F8'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // O app mostra um aviso "Nova versão disponível" em vez de recarregar sozinho
      // no meio de uma compra.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Casa em Ordem',
        short_name: 'Casa em Ordem',
        description: 'Listas de compras da família, calculadora de custo-benefício e histórico de preços.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: BACKGROUND_COLOR,
        theme_color: THEME_COLOR,
        categories: ['shopping', 'lifestyle', 'productivity'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Rotas da API (função de notificações na Vercel) não são páginas do app.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // Recebe as notificações no celular (Web Push) e abre o app no lugar certo.
        importScripts: ['push-sw.js'],
        // As requisições ao Supabase não passam pelo cache do service worker:
        // os dados offline ficam no cache do próprio app (IndexedDB), que sabe
        // distinguir o que já foi sincronizado do que está pendente.
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: true, target: 'es2022' },
})
