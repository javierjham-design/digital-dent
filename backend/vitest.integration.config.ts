import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Config de tests de INTEGRACIÓN: corre contra una DB sqlite efímera.
// Aliasamos `@prisma/client` → cliente de prueba (sqlite), de modo que TODO el
// código que pase por src/lib/prisma.ts (sea import alias o relativo) use la DB
// efímera sin tocar producción. El regex exacto deja intactos los subpaths
// `@prisma/client/runtime/*` que el propio cliente generado necesita.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@prisma\/client$/, replacement: fileURLToPath(new URL('./prisma/.test-client/index.js', import.meta.url)) },
      { find: '@shared', replacement: fileURLToPath(new URL('../shared/src', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/integration/globalSetup.ts'],
    setupFiles: ['./test/integration/setup-env.ts'],
    fileParallelism: false, // comparten la misma DB sqlite
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
