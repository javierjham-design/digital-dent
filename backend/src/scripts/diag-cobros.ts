// DIAGNÓSTICO SOLO-LECTURA de cobros/abonos de un paciente. No escribe nada.
// Uso (contra prod, con la URL pública inyectada por railway):
//   railway run -s BACKEND bash -c 'TENANT_DB_SERVER_URL="$DATABASE_PUBLIC_URL" \
//     DB=clariva_t_digital_dent npx tsx src/scripts/diag-cobros.ts "Mora"'
import { tenantClient } from '@/db/tenant'

const dbName = process.env.DB || 'clariva_t_digital_dent'
const needle = (process.argv[2] || 'Mora').toLowerCase()

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

async function main() {
  const db = tenantClient(dbName)
  const pacientes = await db.paciente.findMany({
    where: { OR: [{ nombre: { contains: needle, mode: 'insensitive' } }, { apellido: { contains: needle, mode: 'insensitive' } }] },
    select: { id: true, numero: true, nombre: true, apellido: true },
  })
  console.log(`\n=== ${pacientes.length} paciente(s) con "${needle}" en ${dbName} ===`)

  for (const p of pacientes) {
    console.log(`\n──────── #${p.numero} ${p.nombre} ${p.apellido}  (id ${p.id}) ────────`)

    const ficha = await db.fichaClinica.findUnique({ where: { pacienteId: p.id }, select: { id: true } })
    const planes = await db.planTratamiento.findMany({ where: { pacienteId: p.id }, select: { id: true, nombre: true, estado: true } })

    // Cobros del paciente + sus items.
    const cobros = await db.cobro.findMany({
      where: { pacienteId: p.id },
      select: {
        id: true, numero: true, concepto: true, monto: true, estado: true, anulado: true, fechaPago: true, createdAt: true,
        items: { select: { id: true, tratamientoId: true, planId: true, monto: true, descripcion: true } },
      },
      orderBy: { numero: 'asc' },
    })

    console.log(`  Planes: ${planes.map((pl) => `${pl.nombre}[${pl.estado}] id=${pl.id}`).join(' · ') || '—'}`)

    // Tratamientos (acciones) por plan.
    for (const pl of planes) {
      const trats = await db.tratamiento.findMany({
        where: { planId: pl.id },
        select: { id: true, precio: true, descuento: true, estado: true, prestacion: { select: { nombre: true } } },
      })
      const total = trats.reduce((s, t) => s + Math.round(t.precio * (1 - (t.descuento || 0) / 100)), 0)
      console.log(`\n  PLAN "${pl.nombre}" (id ${pl.id}) — ${trats.length} acciones · total neto ${clp(total)}`)
      for (const t of trats) {
        const neto = Math.round(t.precio * (1 - (t.descuento || 0) / 100))
        console.log(`    · acción ${t.id} ${t.prestacion?.nombre ?? '?'} [${t.estado}] neto ${clp(neto)}`)
      }
      // Abono libre del plan (items con planId=pl.id, sin tratamiento, pagados).
      const abonoLibre = await db.cobroItem.findMany({
        where: { planId: pl.id, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } },
        select: { id: true, monto: true, cobroId: true, descripcion: true },
      })
      const sumAL = abonoLibre.reduce((s, i) => s + i.monto, 0)
      console.log(`    ABONO LIBRE del plan: ${clp(sumAL)} en ${abonoLibre.length} item(s) → ${abonoLibre.map((i) => `${i.id}(${clp(i.monto)})`).join(', ') || '—'}`)
    }

    // Todos los items + detección de HUÉRFANOS (sin tratamiento y sin plan).
    console.log(`\n  COBROS (${cobros.length}):`)
    let sumHuerfano = 0
    for (const c of cobros) {
      const cuando = (c.fechaPago ?? c.createdAt)?.toISOString().slice(0, 10)
      console.log(`    Cobro #${c.numero} ${clp(c.monto)} [${c.estado}${c.anulado ? ' ANULADO' : ''}] "${c.concepto}" id=${c.id} (${cuando})`)
      for (const it of c.items) {
        const tag = it.tratamientoId ? `→acción ${it.tratamientoId}` : it.planId ? `→abonoLibre plan ${it.planId}` : '⚠️ HUÉRFANO (sin acción ni plan)'
        if (!it.tratamientoId && !it.planId && c.estado === 'PAGADO' && !c.anulado) sumHuerfano += it.monto
        console.log(`        item ${it.id} ${clp(it.monto)} ${tag}  "${it.descripcion}"`)
      }
    }
    if (sumHuerfano > 0) console.log(`\n  ⚠️⚠️ TOTAL HUÉRFANO (pagado, sin acción ni plan): ${clp(sumHuerfano)} — este es el dinero "perdido".`)
    if (!ficha) console.log('  (sin ficha clínica)')
  }

  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
