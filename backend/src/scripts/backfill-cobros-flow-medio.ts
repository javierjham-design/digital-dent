// Backfill: cobros pagados por LINK de Flow que quedaron SIN medio (medioPagoId null)
// y por eso se muestran como "Efectivo". Bug corregido en el webhook (ahora setea el
// medio "Flow"); este script arregla los que ya se pagaron antes del fix.
//
// Para cada clínica: por cada PagoOnline FLOW PAGADO con cobro PAGADO y medioPagoId
// null → setea medioPagoId al medio "Flow" + metodoPago='FLOW' + fechaPago=pagadoAt.
//
// Uso:
//   tsx src/scripts/backfill-cobros-flow-medio.ts            → dry-run (no escribe)
//   tsx src/scripts/backfill-cobros-flow-medio.ts --apply    → aplica
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { assertBaseActual, assertControlActual } from '@/lib/db-guard'

const APPLY = process.argv.includes('--apply')

async function main() {
  await assertControlActual(control)
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }] },
    select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' },
  })
  console.log(`\n${APPLY ? '=== APLICAR ===' : '=== DRY-RUN (no escribe) ==='}  backfill medio Flow en cobros · ${clinicas.length} clínica(s)\n`)

  let total = 0
  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    await assertBaseActual(db, c.dbName)

    const medios = await db.medioPago.findMany({ select: { id: true, nombre: true } })
    const medioFlow = medios.find((m) => m.nombre.trim().toLowerCase() === 'flow')
    if (!medioFlow) { console.log(`  ${c.slug.padEnd(22)} sin medio "Flow" — se salta`); await disposeTenant(c.dbName).catch(() => {}); continue }

    const pagos = await db.pagoOnline.findMany({
      where: { proveedor: 'FLOW', estado: 'PAGADO', cobroId: { not: null } },
      select: { id: true, cobroId: true, pagadoAt: true },
    })
    let arregladas = 0
    for (const p of pagos) {
      const cobro = await db.cobro.findUnique({
        where: { id: p.cobroId! },
        select: { id: true, numero: true, monto: true, estado: true, anulado: true, medioPagoId: true, fechaPago: true, paciente: { select: { nombre: true, apellido: true, rut: true } } },
      })
      if (!cobro || cobro.anulado || cobro.estado !== 'PAGADO' || cobro.medioPagoId) continue // ya tiene medio o no aplica
      console.log(`  ${c.slug.padEnd(22)} cobro #${cobro.numero}  ${cobro.paciente.nombre} ${cobro.paciente.apellido} (${cobro.paciente.rut ?? '—'})  $${cobro.monto}  → medio Flow, fecha ${(p.pagadoAt ?? cobro.fechaPago)?.toISOString() ?? '—'}`)
      if (APPLY) {
        await db.cobro.update({
          where: { id: cobro.id },
          data: { medioPagoId: medioFlow.id, metodoPago: 'FLOW', ...(cobro.fechaPago ? {} : { fechaPago: p.pagadoAt ?? new Date() }) },
        })
      }
      arregladas++; total++
    }
    if (arregladas === 0) console.log(`  ${c.slug.padEnd(22)} sin cobros por arreglar`)
    await disposeTenant(c.dbName).catch(() => {})
  }
  console.log(`\n${APPLY ? 'Arreglados' : 'A arreglar'}: ${total} cobro(s).`)
  await control.$disconnect()
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
