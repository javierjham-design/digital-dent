// Reconciliación histórica del vínculo lead→paciente: propone vincular los leads SIN
// pacienteId contra los pacientes existentes, por teléfono normalizado o RUT. Separa los
// matches INEQUÍVOCOS (se aplican con --apply) de los DUDOSOS (se listan para decidir a mano;
// se resuelven desde el aviso de la ficha del paciente). Dry-run por defecto.
//
// ⚠️ CRÍTICO: al vincular un lead cuyo paciente YA tiene cobros pagados, se marca CONVERTIDO
// pero DIRECTO en la base, SIN pasar por el emisor de etapas (dispararEtapaCrmMeta). Son
// conversiones VIEJAS: emitirlas las rechazaría el clamp de 7 días de Meta o las aplastaría a
// ~6 días atrás inflando el día. Eso lo garantiza `vincularLeadPaciente` (ver su comentario).
// NO cambiar este script para que emita.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { telKey, rutKey, vincularLeadPaciente } from '@/services/crm.service'

const APPLY = process.argv.includes('--apply')

function pushMap<K, V>(m: Map<K, V[]>, k: K, v: V) { const a = m.get(k) ?? []; a.push(v); m.set(k, a) }

async function main() {
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }] },
    select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' },
  })
  console.log(`\n${APPLY ? '=== APLICAR ===' : '=== DRY-RUN (no escribe) ==='}  reconciliación lead→paciente · ${clinicas.length} clínica(s)\n`)

  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    const pacientes = await db.paciente.findMany({ select: { id: true, nombre: true, apellido: true, telefono: true, rut: true } })
    const leadsSin = await db.lead.findMany({ where: { pacienteId: null }, select: { id: true, nombre: true, apellido: true, telefono: true, rut: true, estado: true } })

    // Índices de pacientes por clave de teléfono / RUT.
    const pacPorTel = new Map<string, typeof pacientes>()
    const pacPorRut = new Map<string, typeof pacientes>()
    for (const p of pacientes) {
      const tk = telKey(p.telefono); if (tk) pushMap(pacPorTel, tk, p)
      const rk = rutKey(p.rut); if (rk) pushMap(pacPorRut, rk, p)
    }
    // Cuántos leads sin vincular comparten cada teléfono (riesgo de familia).
    const leadsPorTel = new Map<string, number>()
    for (const l of leadsSin) { const tk = telKey(l.telefono); if (tk) leadsPorTel.set(tk, (leadsPorTel.get(tk) ?? 0) + 1) }

    const inequivocos: { lead: typeof leadsSin[number]; pacienteId: string; via: string }[] = []
    const dudosos: { lead: typeof leadsSin[number]; motivo: string }[] = []
    for (const l of leadsSin) {
      const tk = telKey(l.telefono), rk = rutKey(l.rut)
      const porRut = rk ? pacPorRut.get(rk) ?? [] : []
      const porTel = tk ? pacPorTel.get(tk) ?? [] : []
      const cand = [...new Map([...porRut, ...porTel].map((p) => [p.id, p])).values()]
      if (cand.length === 0) continue
      if (cand.length > 1) { dudosos.push({ lead: l, motivo: `coincide con ${cand.length} pacientes` }); continue }
      const p = cand[0]
      if (porRut.some((x) => x.id === p.id)) inequivocos.push({ lead: l, pacienteId: p.id, via: 'RUT' })
      else if ((leadsPorTel.get(tk!) ?? 0) > 1) dudosos.push({ lead: l, motivo: `mismo teléfono que otros ${(leadsPorTel.get(tk!) ?? 1) - 1} lead(s) sin vincular (¿familia?)` })
      else inequivocos.push({ lead: l, pacienteId: p.id, via: 'teléfono' })
    }

    // Atribución del embudo: pacientes con cobro pagado que quedan atados a un lead.
    const pagos = await db.cobro.findMany({ where: { estado: 'PAGADO', anulado: false }, select: { pacienteId: true }, distinct: ['pacienteId'] })
    const pacientesPagos = new Set(pagos.map((p) => p.pacienteId))
    const leadPacActuales = new Set((await db.lead.findMany({ where: { pacienteId: { not: null } }, select: { pacienteId: true } })).map((l) => l.pacienteId!))
    const atribuidosAntes = [...pacientesPagos].filter((id) => leadPacActuales.has(id)).length
    const nuevosAtribuidos = new Set(inequivocos.map((x) => x.pacienteId).filter((id) => pacientesPagos.has(id) && !leadPacActuales.has(id)))
    const atribuidosDespues = atribuidosAntes + nuevosAtribuidos.size

    const nom = (l: { nombre: string | null; apellido: string | null; id: string }) => `${l.nombre ?? ''} ${l.apellido ?? ''}`.trim() || l.id.slice(-6)
    console.log(`━━ ${c.slug} ━━  leads sin vincular: ${leadsSin.length}`)
    console.log(`  INEQUÍVOCOS (se vinculan con --apply): ${inequivocos.length}`)
    for (const x of inequivocos) console.log(`     · ${nom(x.lead)}  [${x.lead.estado}]  → paciente ${x.pacienteId.slice(-6)}  (por ${x.via})${pacientesPagos.has(x.pacienteId) ? '  ⭑ pagó → CONVERTIDO sin emitir' : ''}`)
    console.log(`  DUDOSOS (a decidir a mano, NO se tocan): ${dudosos.length}`)
    for (const x of dudosos) console.log(`     · ${nom(x.lead)}  [${x.lead.estado}]  — ${x.motivo}`)
    console.log(`  Atribución (pacientes con cobro pagado atados a un lead): ${atribuidosAntes} → ${atribuidosDespues}  (de ${pacientesPagos.size} que pagaron)`)

    if (APPLY) {
      let convertidos = 0
      for (const x of inequivocos) {
        const r = await vincularLeadPaciente(db, x.lead.id, x.pacienteId, { autorNombre: 'Sistema (reconciliación)', motivo: `reconciliación histórica por ${x.via}` })
        if (r.convertido) convertidos++
      }
      console.log(`  ✔ aplicado: ${inequivocos.length} vínculo(s), ${convertidos} marcado(s) CONVERTIDO (sin emitir a Meta).`)
    }
    console.log('')
    await disposeTenant(c.dbName).catch(() => {})
  }
  if (!APPLY) console.log('(dry-run — corré con --apply para aplicar los INEQUÍVOCOS. Los DUDOSOS se resuelven desde el aviso de la ficha.)')
  await control.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
