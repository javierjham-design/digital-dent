import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Alias idénticos a los de tsconfig (@/* → src, @shared/* → ../shared/src),
// para que los tests resuelvan los mismos imports que el runtime (tsx).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Por defecto solo lógica pura (sin DB). Los tests de integración viven en
    // test/integration/ y se corren aparte con npm run test:integration.
    exclude: ['node_modules/**', 'test/integration/**'],
    // El smoke arranca toda la app (incluye googleapis, pesado); damos margen
    // al hook de arranque para que no expire bajo carga paralela.
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
})
