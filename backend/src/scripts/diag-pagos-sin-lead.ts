// Diagnóstico SOLO LECTURA: de los pacientes que PAGARON pero NO tienen lead atado,
// ¿por qué no matchean? Clasifica cada paciente sin-lead en:
//   (a) MATCH PERDIDO: existe un lead SIN vincular con su teléfono/correo (se puede recuperar);
//   (b) DUPLICADO: existe un lead con su tel/correo pero ya atado a OTRO paciente;
//   (c) WALK-IN real: no existe ningún lead con su teléfono ni correo.
// Para el MATCH PERDIDO, además atribuye la campaña del lead recuperable (cuantifica, por
// campaña, el ingreso que estábamos perdiendo). No escribe nada.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { telKey, emailCanonico, rutKey, campanaKeyDe } from '@/services/crm.service'

async function main() {
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }] },
    select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' },
  })
  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    const pagos = await db.cobro.findMany({ where: { estado: 'PAGADO', anulado: false }, select: { pacienteId: true, monto: true } })
    const pagaron = new Set(pagos.map((p) => p.pacienteId))
    if (pagaron.size === 0) { await disposeTenant(c.dbName).catch(() => {}); continue }
    const cobradoPorPac = new Map<string, number>()
    for (const p of pagos) cobradoPorPac.set(p.pacienteId, (cobradoPorPac.get(p.pacienteId) ?? 0) + p.monto)

    const leads = await db.lead.findMany({ select: { id: true, telefono: true, email: true, rut: true, pacienteId: true, campana: true, utmCampaign: true, landing: true } })
    const atados = new Set(leads.filter((l) => l.pacienteId).map((l) => l.pacienteId!))
    const sinLead = [...pagaron].filter((id) => !atados.has(id))

    // Índices de leads por teléfono/correo. Para los LIBRES guardamos una campaña representativa.
    type G = { vinc: number; libre: number; campanaLibre: string | null }
    const leadTel = new Map<string, G>()
    const leadEmail = new Map<string, G>()
    const put = (m: Map<string, G>, k: string, l: typeof leads[number]) => {
      const g = m.get(k) ?? { vinc: 0, libre: 0, campanaLibre: null }
      if (l.pacienteId) g.vinc++
      else { g.libre++; if (!g.campanaLibre) g.campanaLibre = campanaKeyDe(l) || '(Sin campaña)' }
      m.set(k, g)
    }
    for (const l of leads) {
      const tk = telKey(l.telefono); if (tk) put(leadTel, tk, l)
      const ek = emailCanonico(l.email); if (ek) put(leadEmail, ek, l)
    }

    const pacs = await db.paciente.findMany({ where: { id: { in: sinLead } }, select: { id: true, telefono: true, email: true, rut: true } })
    let conTel = 0, conEmail = 0, conRut = 0
    let matchPerdido = 0, matchPerdidoPago = 0, duplicado = 0, walkIn = 0
    let cobradoMatchPerdido = 0
    const perdidoPorCampana = new Map<string, { n: number; cobrado: number }>()
    for (const p of pacs) {
      const tk = telKey(p.telefono), ek = emailCanonico(p.email), rk = rutKey(p.rut)
      if (tk) conTel++; if (ek) conEmail++; if (rk) conRut++
      const gt = tk ? leadTel.get(tk) : undefined
      const ge = ek ? leadEmail.get(ek) : undefined
      const campanaLibre = gt?.libre ? gt.campanaLibre : (ge?.libre ? ge.campanaLibre : null)
      const cobrado = cobradoPorPac.get(p.id) ?? 0
      if (gt?.libre || ge?.libre) {
        matchPerdido++; matchPerdidoPago++; cobradoMatchPerdido += cobrado
        const key = campanaLibre ?? '(Sin campaña)'
        const g = perdidoPorCampana.get(key) ?? { n: 0, cobrado: 0 }
        g.n++; g.cobrado += cobrado; perdidoPorCampana.set(key, g)
      } else if (gt?.vinc || ge?.vinc) duplicado++
      else walkIn++
    }
    const fmt = (n: number) => '$' + n.toLocaleString('es-CL')
    console.log(`\n━━ ${c.slug} ━━  pagaron ${pagaron.size} · sin lead atado ${sinLead.length}`)
    console.log(`  de los sin-lead: con teléfono ${conTel}, con correo ${conEmail}, con RUT ${conRut}`)
    console.log(`  (a) MATCH PERDIDO (hay lead libre con su tel/correo → recuperable): ${matchPerdido}  · cobrado ${fmt(cobradoMatchPerdido)}`)
    console.log(`  (b) DUPLICADO (lead ya atado a otra ficha): ${duplicado}`)
    console.log(`  (c) WALK-IN real (ningún lead con su tel ni correo): ${walkIn}`)
    if (perdidoPorCampana.size) {
      console.log(`  MATCH PERDIDO por campaña:`)
      for (const [k, g] of [...perdidoPorCampana.entries()].sort((a, b) => b[1].cobrado - a[1].cobrado)) {
        console.log(`     · ${k}: ${g.n} paciente(s) · ${fmt(g.cobrado)}`)
      }
    }
    await disposeTenant(c.dbName).catch(() => {})
  }
  await control.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
