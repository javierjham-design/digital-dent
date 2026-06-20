// Runner de migraciones para database-per-tenant: aplica el schema tenant
// ACTUAL a TODAS las bases de las clínicas registradas en el control-plane.
//
// Uso: cuando cambia prisma/tenant/schema.prisma, correr:
//   1) npm run tenant:initsql      (regenera el DDL para clínicas NUEVAS)
//   2) npm run migrate:tenants     (sincroniza las clínicas EXISTENTES)
//
// `prisma db push` es idempotente y aditivo; con cambios no destructivos no
// pierde datos. Requiere que TENANT_DB_SERVER_URL pueda conectarse a cada base.
import { execSync } from 'node:child_process'
import { control } from '@/db/control'
import { tenantUrl } from '@/db/tenant'

async function main() {
  const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' } })
  console.log(`[migrate-tenants] ${clinicas.length} base(s) de clínica a migrar`)

  let ok = 0
  const fallidas: string[] = []
  for (const c of clinicas) {
    process.stdout.write(`  · ${c.slug} (${c.dbName}) … `)
    try {
      execSync('npx prisma db push --schema prisma/tenant/schema.prisma --skip-generate --accept-data-loss', {
        stdio: ['ignore', 'ignore', 'inherit'],
        env: { ...process.env, TENANT_DATABASE_URL: tenantUrl(c.dbName) },
      })
      console.log('OK')
      ok++
    } catch {
      console.log('FALLÓ')
      fallidas.push(c.slug)
    }
  }

  console.log(`\n[migrate-tenants] ${ok}/${clinicas.length} OK`)
  if (fallidas.length > 0) console.error(`[migrate-tenants] fallaron: ${fallidas.join(', ')}`)
  await control.$disconnect()
  process.exit(fallidas.length > 0 ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
