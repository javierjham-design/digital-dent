// Runner de migraciones para database-per-tenant: aplica el schema tenant
// ACTUAL a TODAS las bases de las clínicas registradas en el control-plane.
//
// Uso: cuando cambia prisma/tenant/schema.prisma, correr a mano:
//   1) npm run tenant:initsql             (regenera el DDL para clínicas NUEVAS)
//   2) npm run migrate:tenants -- --strict  (sincroniza las EXISTENTES; aborta si el
//                                            último backup OK tiene >24 h — ver abajo)
// En el prestart (deploy/reinicio) corre SIN --strict: nunca aborta.
//
// SEGURIDAD DE DATOS: el push se hace SIN `--accept-data-loss` a propósito. Los
// cambios aditivos (columnas/tablas nuevas) se aplican igual; pero si un cambio
// implicara PERDER datos de una clínica, el push FALLA y se marca esa base como
// fallida en vez de borrar en silencio. Si alguna vez se necesita un cambio
// destructivo, se hace de forma deliberada (backup + migración manual), nunca
// como efecto colateral de un deploy. Requiere alcanzar cada base.
import { execSync } from 'node:child_process'
import { control } from '@/db/control'
import { tenantUrl, tenantClient, disposeTenant } from '@/db/tenant'
import { horasDesdeUltimoBackupOk } from '@/lib/backup/status'
import { alertar } from '@/lib/backup/alerts'
import { log } from '@/lib/logger'

// Aplicar DDL a bases PRODUCTIVAS sin una copia fresca es peligroso. Pero este script
// corre en DOS contextos muy distintos, y tratarlos igual sería un error grave:
//
//   - MANUAL y DELIBERADO (`npm run migrate:tenants -- --strict`): quien aplica un
//     cambio de schema a mano DEBE tener un backup reciente al que volver. Si el último
//     backup OK tiene >24 h, se ABORTA.
//
//   - AUTOMÁTICO (prestart de package.json, en CADA deploy y CADA reinicio del
//     contenedor): acá NUNCA se aborta. Si abortáramos, un backup atrasado >24 h
//     impediría que el backend arranque, y con restartPolicy ON_FAILURE eso deja a las
//     dos clínicas SIN plataforma por un problema de backups. Contradiría además la
//     regla que este mismo archivo declara abajo: una migración fallida jamás debe
//     tumbar TODA la plataforma. Por eso el prestart solo AVISA fuerte (log error +
//     alerta por email) y deja arrancar el server.
//
// ⚠️ No "arregles" esto haciendo que el prestart aborte: es intencional. El hard-abort
// vive solo detrás de --strict. Override para saltear el chequeo: SKIP_BACKUP_FRESHNESS_CHECK=1.
// (Nada de esto toca el `prisma db push` sin --accept-data-loss: esa decisión sigue igual.)
const STRICT = process.argv.includes('--strict')

async function verificarFrescuraBackups(): Promise<void> {
  if (process.env.SKIP_BACKUP_FRESHNESS_CHECK === '1') return
  const totalCorridas = await control.backupRun.count().catch(() => 0)
  if (totalCorridas === 0) {
    log.warn('migrate-tenants: backups aún no configurados (0 corridas); se continúa (docs/BACKUPS.md)')
    return
  }
  const horas = await horasDesdeUltimoBackupOk()
  if (horas !== null && horas <= 24) return // backups frescos → seguir sin ruido

  const detalle = horas === null ? 'no existe ninguna corrida OK' : `el último backup OK fue hace ${Math.floor(horas)} h (>24 h)`
  if (STRICT) {
    log.error(`migrate-tenants: ABORTADO (--strict) — ${detalle}. Corré \`npm run backup\` o forzá con SKIP_BACKUP_FRESHNESS_CHECK=1.`)
    process.exit(1)
  }
  // Prestart / automático: NO abortar. Avisar fuerte y seguir.
  log.error(`migrate-tenants: backups atrasados — ${detalle}. Se APLICA la migración igual (el prestart no aborta para no dejar la plataforma caída). Revisá los backups YA.`)
  await alertar(
    'Migración de schema con backups atrasados',
    `<p>Se ejecutó <code>migrate-tenants</code> (prestart) con ${detalle}. La migración se aplicó igual —el prestart no aborta para no tumbar la plataforma—, pero se aplicó DDL a producción <strong>sin una copia fresca reciente</strong>. Revisá el servicio de backups en Railway.</p>`,
  ).catch(() => {})
}

async function main() {
  await verificarFrescuraBackups()
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
      // Backfill idempotente: los leads previos no tienen ultimoIngresoAt y el CRM
      // ahora ordena por ese campo. Se iguala a createdAt (no cambia su posición).
      try {
        const tc = tenantClient(c.dbName)
        await tc.$executeRawUnsafe('UPDATE "Lead" SET "ultimoIngresoAt" = "createdAt" WHERE "ultimoIngresoAt" IS NULL')
        await disposeTenant(c.dbName)
      } catch { /* best-effort: si falla, el orden usa createdAt como respaldo en app */ }
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
