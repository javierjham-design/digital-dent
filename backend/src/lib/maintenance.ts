// Mantenimiento que se ejecuta al arrancar el backend (best-effort, no bloquea
// el arranque). Garantiza que las prestaciones duplicadas se fusionen en CADA
// deploy, sin depender de que nadie apriete un botón. Es idempotente: si no hay
// duplicados no hace nada.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { dedupePrestaciones } from '@/services/catalogo.service'
import { backfillFormularios } from '@/services/meta-leadads.service'
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
      } finally {
        // No dejar el cliente de cada clínica en el caché: este job corre en cada
        // arranque y recorre TODAS las clínicas; sin esto alimentaría el LRU con
        // clientes que quizá no se usen después.
        await disposeTenant(c.dbName)
      }
    }
    log.info(totalEliminadas === 0
      ? 'mantenimiento: sin prestaciones duplicadas en ninguna clínica'
      : `mantenimiento: ${totalEliminadas} prestación(es) duplicada(s) eliminada(s) en total`)
  } catch (e) {
    log.error('mantenimiento: no se pudo deduplicar prestaciones', { err: serializeError(e) })
  }
}

// Completa el NOMBRE del formulario de origen en leads de Meta que aún no lo tienen
// (backlog + reintentos ante fallos de ingesta), en TODAS las clínicas con Lead Ads.
// Idempotente y barato en estado estable (si no hay leads pendientes, NO llama a
// Graph). Best-effort: nunca hace fallar nada. Se corre al arrancar y cada 30 min.
export async function backfillFormulariosTodasLasClinicas(): Promise<void> {
  try {
    const clinicas = await control.clinica.findMany({
      where: { metaLeadAdsEnabled: true, activo: true },
      select: { slug: true, dbName: true },
    })
    for (const c of clinicas) {
      try {
        // Lote acotado por corrida (para no gastar el rate limit de Meta de una); la
        // corrida cada 30 min va avanzando. `dias` evita gastar llamadas en leads viejos
        // que Meta ya no devuelve (>90 días).
        const r = await backfillFormularios(tenantClient(c.dbName), { dias: 90, max: 100 })
        if (r.resueltos > 0 || r.rateLimited || r.error) {
          log.info('mantenimiento: backfill formularios Meta', { clinica: c.slug, via: r.via, resueltos: r.resueltos, sinResolver: r.sinResolver, rateLimited: r.rateLimited, error: r.error })
        }
      } catch (e) {
        log.error('mantenimiento: backfill formularios Meta falló', { clinica: c.slug, err: serializeError(e) })
      } finally {
        await disposeTenant(c.dbName)
      }
    }
  } catch (e) {
    log.error('mantenimiento: backfill formularios Meta (global) falló', { err: serializeError(e) })
  }
}
