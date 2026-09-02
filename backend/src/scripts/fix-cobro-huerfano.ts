// Corrección PUNTUAL (one-off) de un CobroItem "huérfano" (pagado, sin acción ni plan
// tras borrar una acción pagada): se re-vincula como ABONO LIBRE de un plan. 1 sola
// fila, con guardas estrictas + aserción count===1 en transacción. DRY_RUN=1 simula.
//   railway run -s Postgres bash -c 'cd backend && TENANT_DB_SERVER_URL="$DATABASE_PUBLIC_URL" \
//     DB=clariva_t_digital_dent ITEM=<id> PLAN=<id> PACIENTE=<id> MONTO=<n> DRY_RUN=1 \
//     npx tsx src/scripts/fix-cobro-huerfano.ts'
import { tenantClient } from '@/db/tenant'

const dbName = process.env.DB || 'clariva_t_digital_dent'
const DRY = process.env.DRY_RUN === '1'
const ITEM_ID = process.env.ITEM || ''
const PLAN_ID = process.env.PLAN || ''
const PACIENTE_ID = process.env.PACIENTE || ''
const MONTO = Number(process.env.MONTO || 0)

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

async function main() {
  if (!ITEM_ID || !PLAN_ID || !PACIENTE_ID || !MONTO) throw new Error('Faltan ITEM/PLAN/PACIENTE/MONTO')
  const db = tenantClient(dbName)

  const antes = await db.cobroItem.aggregate({ where: { planId: PLAN_ID, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } }, _sum: { monto: true } })
  console.log(`Abono libre del plan ANTES: ${clp(antes._sum.monto ?? 0)}`)

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

    console.log(`Item ${item.id} (Cobro #${item.cobro.numero}, ${clp(item.monto)}) → abono libre del plan "${plan.nombre}" (${plan.id})`)
    if (DRY) { console.log('DRY_RUN: no se escribe. Guardas OK.'); return }

    const r = await tx.cobroItem.updateMany({
      where: { id: ITEM_ID, tratamientoId: null, planId: null, monto: MONTO },
      data: { planId: PLAN_ID },
    })
    if (r.count !== 1) throw new Error(`ABORTO: esperaba 1 fila, afectó ${r.count} (rollback)`)
    console.log('✓ 1 fila actualizada.')
  })

  const despues = await db.cobroItem.aggregate({ where: { planId: PLAN_ID, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } }, _sum: { monto: true } })
  console.log(`Abono libre del plan DESPUÉS: ${clp(despues._sum.monto ?? 0)}`)

  await db.$disconnect()
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
