// Corrección PUNTUAL (one-off) del incidente de Patricio Mora (#2843, digital-dent):
// el pago huérfano de $949.000 (item sin acción ni plan tras borrar una acción pagada)
// se re-vincula como ABONO LIBRE del plan "Diseño Sonrisa". 1 sola fila, con guardas
// estrictas + aserción de count===1 en transacción. Con DRY_RUN=1 solo simula.
//   railway run -s Postgres bash -c 'cd backend && TENANT_DB_SERVER_URL="$DATABASE_PUBLIC_URL" \
//     DB=clariva_t_digital_dent DRY_RUN=1 npx tsx src/scripts/fix-cobro-huerfano.ts'
import { tenantClient } from '@/db/tenant'

const dbName = process.env.DB || 'clariva_t_digital_dent'
const DRY = process.env.DRY_RUN === '1'

const ITEM_ID = 'cmtai5fre028p62p2cvxp3i92'          // CobroItem huérfano
const PLAN_ID = 'cmsyqpu8a01ku3b07ky98mdtw'          // Plan "Diseño Sonrisa"
const PACIENTE_ID = 'cmp39qvrk02th99l7ozvv3omt'      // Patricio Hernán Mora Castillo #2843
const MONTO = 949000

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

async function main() {
  const db = tenantClient(dbName)

  const abonoLibreAntes = await db.cobroItem.aggregate({ where: { planId: PLAN_ID, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } }, _sum: { monto: true } })
  console.log(`Abono libre del plan ANTES: ${clp(abonoLibreAntes._sum.monto ?? 0)}`)

  await db.$transaction(async (tx) => {
    const item = await tx.cobroItem.findUnique({
      where: { id: ITEM_ID },
      select: { id: true, tratamientoId: true, planId: true, monto: true, cobro: { select: { estado: true, anulado: true, pacienteId: true, numero: true } } },
    })
    if (!item) throw new Error('ABORTO: el item no existe')
    if (item.tratamientoId !== null) throw new Error(`ABORTO: el item ya tiene tratamientoId=${item.tratamientoId}`)
    if (item.planId !== null) throw new Error(`ABORTO: el item ya tiene planId=${item.planId} (¿ya corregido?)`)
    if (item.monto !== MONTO) throw new Error(`ABORTO: monto ${item.monto} ≠ ${MONTO}`)
    if (item.cobro.estado !== 'PAGADO' || item.cobro.anulado) throw new Error('ABORTO: el cobro no está PAGADO/activo')
    if (item.cobro.pacienteId !== PACIENTE_ID) throw new Error('ABORTO: el cobro es de otro paciente')

    const plan = await tx.planTratamiento.findUnique({ where: { id: PLAN_ID }, select: { id: true, pacienteId: true, nombre: true } })
    if (!plan) throw new Error('ABORTO: el plan no existe')
    if (plan.pacienteId !== PACIENTE_ID) throw new Error('ABORTO: el plan es de otro paciente')

    console.log(`Item ${item.id} (Cobro #${item.cobro.numero}, ${clp(item.monto)}) → abono libre del plan "${plan.nombre}"`)

    if (DRY) { console.log('DRY_RUN: no se escribe. Guardas OK.'); return }

    const r = await tx.cobroItem.updateMany({
      where: { id: ITEM_ID, tratamientoId: null, planId: null, monto: MONTO },
      data: { planId: PLAN_ID },
    })
    if (r.count !== 1) throw new Error(`ABORTO: esperaba 1 fila, afectó ${r.count} (rollback)`)
    console.log('✓ 1 fila actualizada.')
  })

  const abonoLibreDespues = await db.cobroItem.aggregate({ where: { planId: PLAN_ID, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } }, _sum: { monto: true } })
  console.log(`Abono libre del plan DESPUÉS: ${clp(abonoLibreDespues._sum.monto ?? 0)}`)

  await db.$disconnect()
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
