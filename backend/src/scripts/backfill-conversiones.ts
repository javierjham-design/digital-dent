// Backfill histórico de conversiones del CRM: marca CONVERTIDO los leads cuyo paciente
// vinculado YA tiene al menos un cobro PAGADO (no anulado) y que aún no están CONVERTIDO.
//
// ⚠️⚠️ ESTE SCRIPT NO EMITE NADA A META — A PROPÓSITO. NO LO "ARREGLES" agregando la emisión.
// Son conversiones VIEJAS. Emitirlas al dataset de CRM de Meta:
//   · si el event_time real tiene > 7 días → Meta las RECHAZA (ver lib/meta.ts), o
//   · el clamp del emisor (dispararEtapaCrmMeta, [now−6d, now]) las APLASTA a ~6 días atrás,
//     inflando las conversiones "recientes" y arruinando la optimización de la campaña.
// Por eso escribe estado=CONVERTIDO DIRECTO en la base, SIN pasar por el emisor de etapas
// (dispararEtapaCrmMeta). La emisión hacia adelante (cobro nuevo) sí ocurre por el flujo
// normal; esto es solo para sincerar el histórico del embudo.
//
// Dry-run por defecto (no escribe). Para aplicar: --apply.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'

const APPLY = process.argv.includes('--apply')

async function main() {
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }] },
    select: { slug: true, dbName: true }, orderBy: { createdAt: 'asc' },
  })
  console.log(`\n${APPLY ? '=== APLICAR ===' : '=== DRY-RUN (no escribe) ==='}  backfill de conversiones · NO emite a Meta · ${clinicas.length} clínica(s)\n`)

  let total = 0
  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    // Pacientes con al menos un cobro PAGADO no anulado.
    const pagados = await db.cobro.findMany({ where: { estado: 'PAGADO', anulado: false }, select: { pacienteId: true }, distinct: ['pacienteId'] })
    const pacIds = pagados.map((p) => p.pacienteId)
    // Leads vinculados a esos pacientes que aún NO están CONVERTIDO.
    const candidatos = await db.lead.findMany({
      where: { estado: { not: 'CONVERTIDO' }, pacienteId: { in: pacIds } },
      select: { id: true, nombre: true, apellido: true, estado: true, leadgenId: true },
      orderBy: { createdAt: 'asc' },
    })
    console.log(`${c.slug} → ${candidatos.length} lead(s) a marcar CONVERTIDO`)
    for (const l of candidatos) {
      console.log(`   · ${(l.nombre ?? l.id.slice(-6))} ${l.apellido ?? ''}`.trimEnd() + `  [${l.estado} → CONVERTIDO]${l.leadgenId ? '  (Meta Form — NO se emite igual)' : ''}`)
      if (APPLY) {
        // Escritura DIRECTA (ver cabecera): estado + nota, SIN dispararEtapaCrmMeta.
        await db.lead.update({ where: { id: l.id }, data: { estado: 'CONVERTIDO', ultimaGestionAt: new Date() } })
        await db.leadNota.create({ data: { leadId: l.id, tipo: 'ESTADO', texto: 'Estado → CONVERTIDO (backfill histórico: paciente con cobro pagado; SIN emisión a Meta)', autorNombre: 'Sistema (backfill)' } }).catch(() => {})
      }
    }
    total += candidatos.length
    await disposeTenant(c.dbName).catch(() => {})
  }
  console.log(`\n${APPLY ? 'Marcados' : 'Se marcarían'}: ${total} lead(s).${APPLY ? '' : '  (dry-run — corré con --apply para aplicar)'}`)
  await control.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
