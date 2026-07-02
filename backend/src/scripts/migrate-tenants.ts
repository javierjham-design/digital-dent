// Runner de migraciones para database-per-tenant: aplica el schema tenant
// ACTUAL a TODAS las bases de las clínicas registradas en el control-plane.
//
// Uso: cuando cambia prisma/tenant/schema.prisma, correr:
//   1) npm run tenant:initsql      (regenera el DDL para clínicas NUEVAS)
//   2) npm run migrate:tenants     (sincroniza las clínicas EXISTENTES)
//
// SEGURIDAD DE DATOS: el push se hace SIN `--accept-data-loss` a propósito. Los
// cambios aditivos (columnas/tablas nuevas) se aplican igual; pero si un cambio
// implicara PERDER datos de una clínica, el push FALLA y se marca esa base como
// fallida en vez de borrar en silencio. Si alguna vez se necesita un cambio
// destructivo, se hace de forma deliberada (backup + migración manual), nunca
// como efecto colateral de un deploy. Requiere alcanzar cada base.
import { execSync } from 'node:child_process'
import { control } from '@/db/control'
import { tenantUrl } from '@/db/tenant'

async function main() {
  const ahora = new Date()
  // Saltamos demos ya expirados: su base pudo haber sido eliminada y no debe
  // hacer fallar el deploy.
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }, { demoExpiraEn: { gt: ahora } }] },
    select: { slug: true, dbName: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`[migrate-tenants] ${clinicas.length} base(s) de clínica a migrar`)

  let ok = 0
  const fallidas: string[] = []
  for (const c of clinicas) {
    process.stdout.write(`  · ${c.slug} (${c.dbName}) … `)
    try {
      execSync('npx prisma db push --schema prisma/tenant/schema.prisma --skip-generate', {
        stdio: ['ignore', 'ignore', 'inherit'],
        timeout: 90_000, // una base lenta/colgada no debe estancar el arranque
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
  if (fallidas.length > 0) {
    console.error(`[migrate-tenants] ⚠️ fallaron (revisar manualmente): ${fallidas.join(', ')}`)
  }
  await control.$disconnect()
  // IMPORTANTE: una migración de tenant fallida NO debe tumbar TODA la plataforma
  // (p. ej. un demo expirado cuya base ya no existe, o una base inalcanzable). El
  // server arranca igual; las bases fallidas quedan registradas arriba para
  // arreglarlas aparte. Sólo un error del control-plane (catch de abajo) es fatal.
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
