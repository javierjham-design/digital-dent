import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { TEST_SLUGS } from './fixtures'

// Provisiona DBs sqlite efímeras para los tests de aislamiento físico:
// una base de control-plane + una base SEPARADA por cada clínica de prueba.
// NOTA: este módulo NO debe importar nada que cargue los clientes Prisma
// generados (aún no existen cuando vitest carga el globalSetup) → dbNameForSlug
// va inline (copia de lib/provision).
const fileUrl = (p: string) => 'file:' + path.resolve(p).replace(/\\/g, '/')
function dbNameForSlug(slug: string): string {
  const norm = slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  return `clariva_t_${norm || 'clinica'}`
}

export default function setup() {
  const opts = { stdio: 'inherit' as const, cwd: process.cwd() }
  execSync('node test/integration/gen-schemas.mjs', opts)
  execSync('npx prisma generate --schema prisma/control/schema.test.prisma', opts)
  execSync('npx prisma generate --schema prisma/tenant/schema.test.prisma', opts)

  // Base de control-plane.
  execSync('npx prisma db push --schema prisma/control/schema.test.prisma --skip-generate --force-reset --accept-data-loss',
    { ...opts, env: { ...process.env, CONTROL_DATABASE_URL: fileUrl('prisma/.test-control.db') } })

  // Una base física por clínica de prueba.
  fs.mkdirSync('prisma/.test-tenants', { recursive: true })
  for (const slug of TEST_SLUGS) {
    const db = dbNameForSlug(slug)
    execSync('npx prisma db push --schema prisma/tenant/schema.test.prisma --skip-generate --force-reset --accept-data-loss',
      { ...opts, env: { ...process.env, TENANT_DATABASE_URL: fileUrl(path.join('prisma/.test-tenants', `${db}.db`)) } })
  }
}
