// Limpieza one-off: deja una sola prestación por nombre en cada clínica.
// Las prestaciones duplicadas (mismo nombre) se fusionan: se repuntan los
// tratamientos e ítems de presupuesto a la que se conserva y se borran el resto.
// Se conserva la prestación con MÁS referencias (para no perder precios en uso).
//
// Uso (backend Railway Console):  npm run dedupe:prestaciones
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

async function dedupeClinica(dbName: string) {
  const db = tenantClient(dbName)
  const prestaciones = await db.prestacion.findMany({
    select: { id: true, nombre: true, _count: { select: { tratamientos: true, itemsPresupuesto: true } } },
  })
  const grupos = new Map<string, typeof prestaciones>()
  for (const p of prestaciones) {
    const key = norm(p.nombre)
    const arr = grupos.get(key) ?? []
    arr.push(p)
    grupos.set(key, arr)
  }

  let nombresDuplicados = 0
  let eliminadas = 0
  for (const [, arr] of grupos) {
    if (arr.length <= 1) continue
    nombresDuplicados++
    // Conservar la más referenciada (desempate: la primera).
    arr.sort((a, b) => (b._count.tratamientos + b._count.itemsPresupuesto) - (a._count.tratamientos + a._count.itemsPresupuesto))
    const keep = arr[0]
    const dups = arr.slice(1)
    const dupIds = dups.map((d) => d.id)
    await db.tratamiento.updateMany({ where: { prestacionId: { in: dupIds } }, data: { prestacionId: keep.id } })
    await db.itemPresupuesto.updateMany({ where: { prestacionId: { in: dupIds } }, data: { prestacionId: keep.id } })
    await db.prestacion.deleteMany({ where: { id: { in: dupIds } } })
    eliminadas += dups.length
  }
  return { total: prestaciones.length, nombresDuplicados, eliminadas, restantes: prestaciones.length - eliminadas }
}

async function main() {
  const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' } })
  console.log(`[dedupe-prestaciones] ${clinicas.length} clínica(s)`) // eslint-disable-line no-console
  for (const c of clinicas) {
    try {
      const r = await dedupeClinica(c.dbName)
      console.log(`  · ${c.slug}: ${r.total} → ${r.restantes} (${r.nombresDuplicados} nombres duplicados, ${r.eliminadas} eliminadas)`) // eslint-disable-line no-console
    } catch (e) {
      console.error(`  · ${c.slug}: ERROR`, e instanceof Error ? e.message : e) // eslint-disable-line no-console
    }
  }
  await control.$disconnect()
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
