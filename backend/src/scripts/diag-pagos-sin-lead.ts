// Diagnóstico SOLO LECTURA: de los pacientes que PAGARON pero NO tienen lead atado,
// ¿por qué no matchean? Clasifica: (a) existe un lead con su mismo teléfono/correo pero
// atado a OTRO paciente (duplicado), (b) existe un lead SIN vincular con su teléfono/correo
// pero compartido con otros (familia/dudoso), (c) no existe ningún lead con esos datos
// (walk-in real). No escribe nada.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { telKey, emailCanonico, rutKey } from '@/services/crm.service'

async function main() {
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }] },
    select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' },
  })
  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    const pagos = await db.cobro.findMany({ where: { estado: 'PAGADO', anulado: false }, select: { pacienteId: true }, distinct: ['pacienteId'] })
    const pagaron = new Set(pagos.map((p) => p.pacienteId))
    if (pagaron.size === 0) { await disposeTenant(c.dbName).catch(() => {}); continue }
    const leads = await db.lead.findMany({ select: { id: true, telefono: true, email: true, rut: true, pacienteId: true } })
    const atados = new Set(leads.filter((l) => l.pacienteId).map((l) => l.pacienteId!))
    const sinLead = [...pagaron].filter((id) => !atados.has(id))

    // Índices de TODOS los leads por teléfono/correo (sin importar si están vinculados).
    const leadTel = new Map<string, { vinc: number; libre: number }>()
    const leadEmail = new Map<string, { vinc: number; libre: number }>()
    for (const l of leads) {
      const tk = telKey(l.telefono); if (tk) { const g = leadTel.get(tk) ?? { vinc: 0, libre: 0 }; l.pacienteId ? g.vinc++ : g.libre++; leadTel.set(tk, g) }
      const ek = emailCanonico(l.email); if (ek) { const g = leadEmail.get(ek) ?? { vinc: 0, libre: 0 }; l.pacienteId ? g.vinc++ : g.libre++; leadEmail.set(ek, g) }
    }

    const pacs = await db.paciente.findMany({ where: { id: { in: sinLead } }, select: { id: true, telefono: true, email: true, rut: true } })
    let conTel = 0, conEmail = 0, conRut = 0
    let leadMismoTelLibre = 0, leadMismoTelVinc = 0, leadMismoEmailLibre = 0, leadMismoEmailVinc = 0, sinNingunLead = 0
    for (const p of pacs) {
      const tk = telKey(p.telefono), ek = emailCanonico(p.email), rk = rutKey(p.rut)
      if (tk) conTel++; if (ek) conEmail++; if (rk) conRut++
      const gt = tk ? leadTel.get(tk) : undefined
      const ge = ek ? leadEmail.get(ek) : undefined
      if (gt?.libre) leadMismoTelLibre++
      else if (gt?.vinc) leadMismoTelVinc++
      if (ge?.libre) leadMismoEmailLibre++
      else if (ge?.vinc) leadMismoEmailVinc++
      if (!gt && !ge) sinNingunLead++
    }
    console.log(`\n━━ ${c.slug} ━━  pagaron ${pagaron.size} · sin lead atado ${sinLead.length}`)
    console.log(`  de los sin-lead: con teléfono ${conTel}, con correo ${conEmail}, con RUT ${conRut}`)
    console.log(`  existe lead con SU teléfono → libre(sin vincular): ${leadMismoTelLibre} · ya vinculado a OTRO paciente (duplicado): ${leadMismoTelVinc}`)
    console.log(`  existe lead con SU correo   → libre: ${leadMismoEmailLibre} · vinculado a otro (duplicado): ${leadMismoEmailVinc}`)
    console.log(`  SIN ningún lead con su teléfono NI correo (walk-in real): ${sinNingunLead}`)
    await disposeTenant(c.dbName).catch(() => {})
  }
  await control.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
