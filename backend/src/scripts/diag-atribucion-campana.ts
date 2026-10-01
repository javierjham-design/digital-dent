// Diagnóstico SOLO LECTURA: cierra el ROI por campaña. Para cada clínica no-demo,
// entre los pacientes con cobro PAGADO (no anulado), cuántos están atados a un lead
// y de qué campaña, y cuántos de esos leads están CONVERTIDO. No escribe nada.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'

async function main() {
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }] },
    select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' },
  })
  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    const pagos = await db.cobro.findMany({ where: { estado: 'PAGADO', anulado: false }, select: { pacienteId: true }, distinct: ['pacienteId'] })
    const pacPagaron = new Set(pagos.map((p) => p.pacienteId))
    if (pacPagaron.size === 0) { await disposeTenant(c.dbName).catch(() => {}); continue }
    // Leads atados a un paciente que pagó.
    const leads = await db.lead.findMany({
      where: { pacienteId: { in: [...pacPagaron] } },
      select: { estado: true, campana: true, origen: true, formularioId: true, pacienteId: true },
    })
    const porCampana = new Map<string, { vinculados: Set<string>; convertidos: number }>()
    for (const l of leads) {
      const clave = l.campana || l.formularioId || l.origen || '(sin campaña)'
      const g = porCampana.get(clave) ?? { vinculados: new Set<string>(), convertidos: 0 }
      g.vinculados.add(l.pacienteId!)
      if (l.estado === 'CONVERTIDO') g.convertidos += 1
      porCampana.set(clave, g)
    }
    const atados = new Set(leads.map((l) => l.pacienteId!))
    console.log(`\n━━ ${c.slug} ━━  pacientes que pagaron: ${pacPagaron.size} · atados a un lead: ${atados.size} · sin lead: ${pacPagaron.size - atados.size}`)
    const filas = [...porCampana.entries()].map(([k, v]) => ({ campana: k, pagaron: v.vinculados.size, convertidos: v.convertidos })).sort((a, b) => b.pagaron - a.pagaron)
    for (const f of filas) console.log(`   · ${f.campana}  → pagaron ${f.pagaron}, CONVERTIDO ${f.convertidos}`)
    await disposeTenant(c.dbName).catch(() => {})
  }
  await control.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
