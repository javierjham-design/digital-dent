// Reporte / backfill de correlativos de Caja y SesionCaja en TODAS las clínicas.
//
// El campo `numero` de Caja y SesionCaja nació como Int @default(0). El backfill que
// asigna correlativo a las filas viejas (numero = 0) es perezoso: solo corre cuando
// alguien abre la pantalla de gestión de cajas. Antes de poner @unique en Caja.numero
// hay que asegurarse de que NINGUNA base tenga filas en cero (si no, la creación del
// índice único falla —y peor: falla en unas clínicas sí y en otras no, dejando el
// schema disparejo entre bases).
//
// Uso:
//   tsx src/scripts/caja-numeros.ts            → REPORTE (solo lectura): filas numero=0 por clínica.
//   tsx src/scripts/caja-numeros.ts --apply    → corre el backfill en todas y re-verifica que quede 0.
//
// Alcanza cada base con TENANT_DB_SERVER_URL / CONTROL_DATABASE_URL (mismas envs que
// migrate-tenants). Contra prod hay que inyectar las URLs PÚBLICAS.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { asegurarNumerosCaja, asegurarNumerosSesion } from '@/services/caja.service'

const APPLY = process.argv.includes('--apply')

async function contarCeros(dbName: string): Promise<{ cajas0: number; sesiones0: number; cajasTot: number; sesionesTot: number }> {
  const db = tenantClient(dbName)
  const [cajas0, sesiones0, cajasTot, sesionesTot] = await Promise.all([
    db.caja.count({ where: { numero: 0 } }),
    db.sesionCaja.count({ where: { numero: 0 } }),
    db.caja.count(),
    db.sesionCaja.count(),
  ])
  return { cajas0, sesiones0, cajasTot, sesionesTot }
}

async function main() {
  const ahora = new Date()
  // Mismo conjunto que migrate-tenants: saltamos demos expirados (su base pudo ya no existir).
  const clinicas = await control.clinica.findMany({
    where: { OR: [{ esDemo: false }, { demoExpiraEn: null }, { demoExpiraEn: { gt: ahora } }] },
    select: { slug: true, dbName: true, esDemo: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`\n${APPLY ? 'BACKFILL' : 'REPORTE'} de numero=0 en Caja / SesionCaja — ${clinicas.length} clínica(s)\n`)
  console.log('clínica'.padEnd(24), 'Caja(0/tot)'.padEnd(16), 'SesionCaja(0/tot)'.padEnd(18), APPLY ? 'post-backfill' : '')

  let totalCajas0 = 0, totalSesiones0 = 0
  const noLimpias: string[] = []
  const fallidas: { slug: string; error: string }[] = []

  for (const c of clinicas) {
    const etiqueta = `${c.slug}${c.esDemo ? ' (demo)' : ''}`
    try {
      const antes = await contarCeros(c.dbName)
      totalCajas0 += antes.cajas0
      totalSesiones0 += antes.sesiones0

      let post = ''
      if (APPLY && (antes.cajas0 > 0 || antes.sesiones0 > 0)) {
        const db = tenantClient(c.dbName)
        await asegurarNumerosCaja(db)
        await asegurarNumerosSesion(db)
        const despues = await contarCeros(c.dbName)
        post = `Caja=${despues.cajas0} Sesion=${despues.sesiones0}`
        if (despues.cajas0 > 0 || despues.sesiones0 > 0) noLimpias.push(etiqueta)
      } else if (APPLY) {
        post = 'ok (nada que hacer)'
      }

      console.log(
        etiqueta.padEnd(24),
        `${antes.cajas0}/${antes.cajasTot}`.padEnd(16),
        `${antes.sesiones0}/${antes.sesionesTot}`.padEnd(18),
        post,
      )
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      fallidas.push({ slug: c.slug, error })
      console.log(etiqueta.padEnd(24), 'ERROR:', error.slice(0, 80))
    } finally {
      await disposeTenant(c.dbName).catch(() => {})
    }
  }

  console.log(`\nTotales: Caja numero=0 = ${totalCajas0} · SesionCaja numero=0 = ${totalSesiones0}`)
  if (fallidas.length) console.log(`⚠️  bases inalcanzables/erróneas: ${fallidas.map((f) => f.slug).join(', ')}`)
  if (APPLY && noLimpias.length) console.log(`⛔ NO quedaron limpias tras el backfill: ${noLimpias.join(', ')}`)
  if (APPLY && !noLimpias.length && !fallidas.length) console.log('✅ Todas las bases quedaron en 0 filas con numero=0.')

  await control.$disconnect()
  // Exit 1 si algo quedó sucio o inalcanzable (para no encadenar el constraint a ciegas).
  process.exit(fallidas.length || (APPLY && noLimpias.length) ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
