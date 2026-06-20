import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Tests de INTEGRACIÓN del modelo database-per-tenant. Aislamiento FÍSICO: una
// base sqlite de control-plane + una base sqlite por clínica. Se aliasan
// @/db/control y @/db/tenant a clientes de prueba (sqlite); el resto del backend
// queda intacto. El orden de alias importa (matches exactos antes del prefijo @).
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/db\/control$/, replacement: fileURLToPath(new URL('./test/integration/control-test.ts', import.meta.url)) },
      { find: /^@\/db\/tenant$/, replacement: fileURLToPath(new URL('./test/integration/tenant-test.ts', import.meta.url)) },
      { find: '@shared', replacement: fileURLToPath(new URL('../shared/src', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/integration/globalSetup.ts'],
    setupFiles: ['./test/integration/setup-env.ts'],
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 40_000,
  },
})
