// Cuenta (solo-lectura, sin Graph) los leads de Meta que necesitan backfill del
// nombre del formulario, y cuántos ya tienen el form_id guardado en su historial.
import { tenantClient } from '@/db/tenant'

const dbName = process.env.DB || 'clariva_t_digital_dent'

async function main() {
  const db = tenantClient(dbName)
  const conLeadgen = await db.lead.count({ where: { leadgenId: { not: null } } })
  const pendientes = await db.lead.findMany({
    where: { leadgenId: { not: null }, formularioNombre: null },
    select: { ingresos: true },
  })
  let conFormEnIngresos = 0
  for (const l of pendientes) {
    if (l.ingresos && /"formId"\s*:\s*"[^"]/.test(l.ingresos)) conFormEnIngresos++
  }
  console.log(JSON.stringify({
    dbName,
    leadsConLeadgen: conLeadgen,
    pendientesSinNombre: pendientes.length,
    conFormIdEnHistorial: conFormEnIngresos,
    requierenGraph: pendientes.length - conFormEnIngresos,
  }, null, 2))
  await db.$disconnect()
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1) })
