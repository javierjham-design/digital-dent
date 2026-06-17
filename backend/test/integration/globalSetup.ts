import { execSync } from 'node:child_process'

// Provisiona una DB SQLite efímera para los tests de integración. NUNCA toca la
// base de producción: usa su propio schema (sqlite) y su propio cliente.
export default function setup() {
  const opts = { stdio: 'inherit' as const, cwd: process.cwd() }
  // 1. derivar el schema sqlite desde el real
  execSync('node test/integration/gen-schema.mjs', opts)
  // 2. generar el cliente Prisma sqlite a prisma/.test-client
  execSync('npx prisma generate --schema prisma/schema.test.prisma', opts)
  // 3. crear/resetear las tablas en la DB sqlite
  execSync('npx prisma db push --schema prisma/schema.test.prisma --skip-generate --force-reset --accept-data-loss', opts)
}
