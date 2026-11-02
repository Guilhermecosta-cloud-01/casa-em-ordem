// Gera os ícones do app (PWA, iOS e favicon) a partir da marca em SVG.
// Uso: npm run icons
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const mark = (radius) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${radius}" fill="#2340A8"/>
  <path d="M32 11 10 29.5h6V51h32V29.5h6L32 11Z" fill="#FFD84A"/>
  <circle cx="32" cy="27" r="3.4" fill="#2340A8"/>
  <path d="m23.5 39.5 6 5.5 11-12" fill="none" stroke="#16213B" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

// Versão "maskable": a marca reduzida dentro da zona segura (80%), fundo cheio.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#2340A8"/>
  <g transform="translate(6.4 6.4) scale(0.8)">
    <path d="M32 11 10 29.5h6V51h32V29.5h6L32 11Z" fill="#FFD84A"/>
    <circle cx="32" cy="27" r="3.4" fill="#2340A8"/>
    <path d="m23.5 39.5 6 5.5 11-12" fill="none" stroke="#16213B" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`

await mkdir('public', { recursive: true })
await writeFile('public/favicon.svg', mark(16))
const render = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(`public/${file}`)
await render(mark(16), 192, 'pwa-192x192.png')
await render(mark(16), 512, 'pwa-512x512.png')
await render(maskable, 512, 'maskable-512x512.png')
// iOS aplica os cantos arredondados sozinho: fundo cheio, sem transparência.
await render(mark(0), 180, 'apple-touch-icon.png')
console.log('Ícones gerados em public/')
