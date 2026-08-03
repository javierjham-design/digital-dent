// Mantenimiento que se ejecuta al arrancar el backend (best-effort, no bloquea
// el arranque). Garantiza que las prestaciones duplicadas se fusionen en CADA
// deploy, sin depender de que nadie apriete un botón. Es idempotente: si no hay
// duplicados no hace nada.
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { dedupePrestaciones } from '@/services/catalogo.service'
import { log, serializeError } from '@/lib/logger'

export async function dedupePrestacionesTodasLasClinicas(): Promise<void> {
  try {
    const clinicas = await control.clinica.findMany({ select: { slug: true, dbName: true } })
    let totalEliminadas = 0
    for (const c of clinicas) {
      try {
        const r = await dedupePrestaciones(tenantClient(c.dbName))
        if (r.eliminadas > 0) {
          totalEliminadas += r.eliminadas
          log.info('mantenimiento: prestaciones duplicadas fusionadas', { clinica: c.slug, eliminadas: r.eliminadas, restantes: r.restantes })
        }
      } catch (e) {
        log.error('mantenimiento: error al deduplicar prestaciones', { clinica: c.slug, err: serializeError(e) })
      }
    }
    log.info(totalEliminadas === 0
      ? 'mantenimiento: sin prestaciones duplicadas en ninguna clínica'
      : `mantenimiento: ${totalEliminadas} prestación(es) duplicada(s) eliminada(s) en total`)
  } catch (e) {
    log.error('mantenimiento: no se pudo deduplicar prestaciones', { err: serializeError(e) })
  }
}
