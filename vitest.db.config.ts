import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Testes do banco (RLS, funções e regras de integridade). Precisam do
// Supabase local: `npm run stack:up` antes de `npm run test:db`.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/db/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
