import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Testes unitários: cálculos financeiros, conversões de unidades, interpretação
// de valores digitados e regras de domínio. Rodam sem banco e sem navegador.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    environment: 'node',
  },
})
