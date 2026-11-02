import { defineConfig, devices } from '@playwright/test'

/**
 * Testes ponta a ponta (seção 12 da especificação). Rodam contra o app
 * compilado (`vite preview`) e o Supabase local (`npm run stack:up`).
 *
 *   npm run stack:up
 *   cp .local-stack/env .env.local && echo VITE_SYNC_POLL_MS=3000 >> .env.local
 *   npm run build && npm run test:e2e
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
