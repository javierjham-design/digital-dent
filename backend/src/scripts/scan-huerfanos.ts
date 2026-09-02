// ESCANEO SOLO-LECTURA: busca CobroItem "huérfanos" (pagados, sin acción NI plan) en
// toda una clínica. Son pagos invisibles que dejan planes en deuda falsa (bug de borrar
// acción pagada, corregido). No escribe nada.
//   railway run -s Postgres bash -c 'cd backend && TENANT_DB_SERVER_URL="$DATABASE_PUBLIC_URL" \
//     DB=clariva_t_digital_dent npx tsx src/scripts/scan-huerfanos.ts'
import { tenantClient } from '@/db/tenant'

const dbName = process.env.DB || 'clariva_t_digital_dent'
const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

async function main() {
  const db = tenantClient(dbName)
  const huerfanos = await db.cobroItem.findMany({
    where: { tratamientoId: null, planId: null, cobro: { estado: 'PAGADO', anulado: false } },
    select: {
      id: true, monto: true, descripcion: true,
      cobro: { select: { id: true, numero: true, pacienteId: true, concepto: true, paciente: { select: { numero: true, nombre: true, apellido: true } } } },
    },
    orderBy: { monto: 'desc' },
  })

  console.log(`\n=== ${dbName}: ${huerfanos.length} CobroItem HUÉRFANO(S) pagado(s) ===`)
  let total = 0
  // Agrupar por paciente para verlo claro.
  const porPac = new Map<string, typeof huerfanos>()
  for (const h of huerfanos) {
    total += h.monto
    const k = h.cobro.pacienteId
    if (!porPac.has(k)) porPac.set(k, [])
    porPac.get(k)!.push(h)
  }
  for (const [, items] of porPac) {
    const p = items[0].cobro.paciente
    const sub = items.reduce((s, i) => s + i.monto, 0)
    console.log(`\n  #${p?.numero} ${p?.nombre} ${p?.apellido} — ${clp(sub)} en ${items.length} item(s)`)
    for (const it of items) {
      console.log(`    item ${it.id} ${clp(it.monto)} (Cobro #${it.cobro.numero}) "${it.descripcion}"`)
    }
  }
  console.log(`\n=== TOTAL huérfano en ${dbName}: ${clp(total)} en ${huerfanos.length} item(s), ${porPac.size} paciente(s) ===`)
  await db.$disconnect()
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
