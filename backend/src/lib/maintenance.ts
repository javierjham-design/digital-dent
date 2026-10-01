// Mantenimiento que se ejecuta al arrancar el backend (best-effort, no bloquea
// el arranque). Garantiza que las prestaciones duplicadas se fusionen en CADA
// deploy, sin depender de que nadie apriete un botón. Es idempotente: si no hay
// duplicados no hace nada.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { dedupePrestaciones } from '@/services/catalogo.service'
import { backfillFormularios } from '@/services/meta-leadads.service'
import { clasificarVinculosHuerfanos, vincularLeadPaciente } from '@/services/crm.service'
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
// BACKOFF: si Meta responde rate limit (#4), se toma una pausa (para que el límite de
// la app se resetee) en vez de seguir golpeando cada 30 min (lo que lo mantendría
// caliente y nunca resolvería). El lote por corrida es acotado (`max`).
let backfillCooldownUntil = 0
const BACKFILL_COOLDOWN_MS = 90 * 60_000
export async function backfillFormulariosTodasLasClinicas(): Promise<void> {
  if (Date.now() < backfillCooldownUntil) return // en pausa por rate limit reciente
  try {
    const clinicas = await control.clinica.findMany({
      where: { metaLeadAdsEnabled: true, activo: true },
      select: { slug: true, dbName: true },
    })
    for (const c of clinicas) {
      try {
        const r = await backfillFormularios(tenantClient(c.dbName), { dias: 90, max: 60 })
        if (r.rateLimited) backfillCooldownUntil = Date.now() + BACKFILL_COOLDOWN_MS
        if (r.resueltos > 0 || r.rateLimited || r.error) {
          log.info('mantenimiento: backfill formularios Meta', { clinica: c.slug, resueltos: r.resueltos, sinResolver: r.sinResolver, rateLimited: r.rateLimited, error: r.error })
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

// Reconciliación automática del vínculo lead→paciente para los leads RECIENTES (los que la
// recepción pudo haber creado con datos distintos). Solo INEQUÍVOCOS (RUT/email, o teléfono
// no compartido); los DUDOSOS quedan para el aviso de la ficha. Acotado a los últimos
// RECONCILIAR_DIAS días a propósito: NO toca el backlog histórico profundo (ese se aplica a
// mano con backup y revisión). vincularLeadPaciente marca CONVERTIDO sin emitir a Meta (la
// emisión de conversiones recientes la hace el flujo del cobro). Idempotente y best-effort.
const RECONCILIAR_DIAS = 45
export async function reconciliarVinculosTodasLasClinicas(): Promise<void> {
  try {
    const clinicas = await control.clinica.findMany({ where: { activo: true }, select: { slug: true, dbName: true } })
    const desde = new Date(Date.now() - RECONCILIAR_DIAS * 86400_000)
    for (const c of clinicas) {
      try {
        const db = tenantClient(c.dbName)
        const leadsSin = await db.lead.findMany({ where: { pacienteId: null, createdAt: { gte: desde } }, select: { id: true, telefono: true, email: true, rut: true } })
        if (leadsSin.length === 0) continue
        const pacientes = await db.paciente.findMany({ select: { id: true, telefono: true, email: true, rut: true } })
        const { inequivocos } = clasificarVinculosHuerfanos(pacientes, leadsSin)
        let vinculados = 0, convertidos = 0
        for (const x of inequivocos) {
          const r = await vincularLeadPaciente(db, x.lead.id, x.pacienteId, { autorNombre: 'Sistema (reconciliación automática)', motivo: `reconciliación automática por ${x.via}` })
          vinculados++; if (r.convertido) convertidos++
        }
        if (vinculados > 0) log.info('mantenimiento: reconciliación lead→paciente', { clinica: c.slug, vinculados, convertidos })
      } catch (e) {
        log.error('mantenimiento: reconciliación lead→paciente falló', { clinica: c.slug, err: serializeError(e) })
      } finally {
        await disposeTenant(c.dbName)
      }
    }
  } catch (e) {
    log.error('mantenimiento: reconciliación lead→paciente (global) falló', { err: serializeError(e) })
  }
}
