// Limpieza one-off: deja una sola prestación por (nombre, categoría) en cada
// clínica. Reusa exactamente la misma lógica que la dedupe del backend (única
// fuente de verdad) — la misma que corre automáticamente en cada arranque.
//
// Uso (backend Railway Console):  npm run dedupe:prestaciones
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { dedupePrestaciones } from '@/services/catalogo.service'
import { assertBaseActual, assertControlActual } from '@/lib/db-guard'

async function main() {
  await assertControlActual(control)
  const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' } })
  console.log(`[dedupe-prestaciones] ${clinicas.length} clínica(s)`)
  for (const c of clinicas) {
    try {
      const db = tenantClient(c.dbName)
      await assertBaseActual(db, c.dbName)
      const r = await dedupePrestaciones(db)
      console.log(`  · ${c.slug}: ${r.eliminadas} eliminadas (${r.restantes} quedan)`)  
    } catch (e) {
      console.error(`  · ${c.slug}: ERROR`, e instanceof Error ? e.message : e)  
    }
  }
  await control.$disconnect()
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
