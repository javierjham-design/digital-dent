// Mantenimiento que se ejecuta al arrancar el backend (best-effort, no bloquea
// el arranque). Garantiza que las prestaciones duplicadas se fusionen en CADA
// deploy, sin depender de que nadie apriete un botón. Es idempotente: si no hay
// duplicados no hace nada.
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'
import { dedupePrestaciones } from '@/services/catalogo.service'
import { backfillFormularios } from '@/services/meta-leadads.service'
import { clasificarVinculosHuerfanos, vincularLeadPaciente } from '@/services/crm.service'
import { cambiarEstadoCita } from '@/services/citas.service'
import { totalesDePlan } from '@/services/tratamientos.service'
import { emitirTreatmentPending } from '@/lib/tubot-webhooks'
import { runWithRequestContext } from '@/lib/request-context'
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

// Cierre automático de no-shows + fin de recaptura. Por clínica:
//  1) Cita cuya hora pasó hace más de N horas (config noShowAutoHoras, default 3) y sigue sin
//     marcar (estado pre-asistencia) → NO_ASISTIO. NUNCA se asume ATENDIÓ. cambiarEstadoCita
//     propaga el no-show al lead (lead.asistio=false + recapturaNoShowAt) y dispara el webhook
//     appointment.attendance a TuBot (recaptura inmediata) con el slug de la clínica en contexto.
//  2) Lead en no-show con recaptura disparada hace más de X días (config recapturaDiasPerdido,
//     default 5) y sin re-agendar (sigue asistio=false) → PERDIDO (no queda en el aire).
// Acotado a una ventana reciente (no toca citas viejas). Idempotente y best-effort. Cada 30 min.
const NOSHOW_HORAS_DEFAULT = 3
const RECAPTURA_DIAS_PERDIDO_DEFAULT = 5
const NOSHOW_VENTANA_DIAS = 7 // no marca no-show citas más viejas que esto (evita tocar backlog)
const ESTADOS_PRE_ASISTENCIA_JOB = ['PENDIENTE', 'CONFIRMADA', 'CONFIRMADO', 'EN_ESPERA'] // EN_ATENCION ya está en el sillón
const clampHoras = (n: unknown) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(72, Math.max(1, v)) : NOSHOW_HORAS_DEFAULT }
const clampDiasPerdido = (n: unknown) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(60, Math.max(1, v)) : RECAPTURA_DIAS_PERDIDO_DEFAULT }

export async function cerrarNoShowsTodasLasClinicas(): Promise<void> {
  try {
    const clinicas = await control.clinica.findMany({ where: { activo: true }, select: { slug: true, dbName: true } })
    const ahora = Date.now()
    for (const c of clinicas) {
      try {
        await runWithRequestContext({ requestId: `cron-noshow-${c.slug}`, slug: c.slug }, async () => {
          const db = tenantClient(c.dbName)
          const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { noShowAutoHoras: true, recapturaDiasPerdido: true } })
          const corte = new Date(ahora - clampHoras(cfg?.noShowAutoHoras ?? NOSHOW_HORAS_DEFAULT) * 3600_000)
          const piso = new Date(ahora - NOSHOW_VENTANA_DIAS * 86400_000)
          const vencidas = await db.cita.findMany({ where: { estado: { in: ESTADOS_PRE_ASISTENCIA_JOB }, fecha: { lt: corte, gte: piso } }, select: { id: true } })
          let noShows = 0
          for (const cita of vencidas) {
            await cambiarEstadoCita(db, cita.id, 'NO_ASISTIO', 'Sistema (no-show automático)')
            noShows++
          }
          const corteP = new Date(ahora - clampDiasPerdido(cfg?.recapturaDiasPerdido ?? RECAPTURA_DIAS_PERDIDO_DEFAULT) * 86400_000)
          // No-show que NO re-agendó en X días → PERDIDO. Se mide desde la fecha de la cita
          // perdida (fechaAgenda); si hubiese re-agendado, el reenganche habría puesto asistio=null.
          const perdidos = await db.lead.updateMany({
            where: { asistio: false, fechaAgenda: { not: null, lt: corteP }, estado: { notIn: ['CONVERTIDO', 'PERDIDO'] } },
            data: { estado: 'PERDIDO', ultimaGestionAt: new Date() },
          })
          if (noShows > 0 || perdidos.count > 0) log.info('mantenimiento: no-shows automáticos', { clinica: c.slug, noShows, perdidos: perdidos.count })
        })
      } catch (e) {
        log.error('mantenimiento: cierre de no-shows falló', { clinica: c.slug, err: serializeError(e) })
      } finally {
        await disposeTenant(c.dbName)
      }
    }
  } catch (e) {
    log.error('mantenimiento: cierre de no-shows (global) falló', { err: serializeError(e) })
  }
}

// Emite el evento patient.treatment_pending a TuBot (por el webhook de agenda) para los
// pacientes que ASISTIERON a la evaluación pero NO tomaron el tratamiento (plan ACTIVO con
// total > 0, abonado 0 y sin ejecución), dejando pasar N días desde que se creó el plan
// (config recapturaTratDias, default 3). TuBot decide a quién recapturar (filtro de paciente
// nuevo vive allá) y envía el WhatsApp: Cláriva SOLO emite el evento, no manda mensajes.
// Idempotente por PlanTratamiento.recapturaAt. Best-effort. Se corre una vez al día.
const TRAT_DIAS_DEFAULT = 3
const TRAT_VENTANA_DIAS = 60 // no mira planes más viejos que esto
const clampTratDias = (n: unknown) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? Math.min(60, Math.max(1, v)) : TRAT_DIAS_DEFAULT }

export async function emitirTratamientosPendientesTodasLasClinicas(): Promise<void> {
  try {
    const clinicas = await control.clinica.findMany({ where: { activo: true }, select: { slug: true, dbName: true } })
    const ahora = Date.now()
    for (const c of clinicas) {
      try {
        await runWithRequestContext({ requestId: `cron-trat-${c.slug}`, slug: c.slug }, async () => {
          const db = tenantClient(c.dbName)
          const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { agendaWhEnabled: true, automatizacionesEnabled: true, recapturaTratEnabled: true, recapturaTratDias: true } })
          // Gates: conexión de agenda activa + maestro encendido + el flujo de tratamiento encendido.
          // Así no se "consumen" planes con `recapturaAt` antes de que todo esté activo.
          if (!cfg?.agendaWhEnabled || !cfg.automatizacionesEnabled || !cfg.recapturaTratEnabled) return
          const corte = new Date(ahora - clampTratDias(cfg.recapturaTratDias) * 86400_000)
          const piso = new Date(ahora - TRAT_VENTANA_DIAS * 86400_000)
          const planes = await db.planTratamiento.findMany({
            where: { recapturaAt: null, estado: 'ACTIVO', createdAt: { lt: corte, gte: piso } },
            select: {
              id: true, nombre: true, pacienteId: true,
              tratamientos: { select: { estado: true, precio: true, descuento: true, cobroItems: { select: { monto: true, cobro: { select: { estado: true } } } } } },
            }, take: 200,
          })
          let emitidos = 0
          for (const plan of planes) {
            const t = totalesDePlan(plan.tratamientos)
            if (t.total <= 0 || t.abonado > 0 || t.tieneEjecucion) continue // ya tomó el tratamiento o plan vacío
            const atendidas = await db.cita.count({ where: { pacienteId: plan.pacienteId, estado: 'ATENDIDA' } })
            if (atendidas < 1) continue // no vino a la evaluación → ese caso va por el flujo de no-show
            await emitirTreatmentPending(db, { pacienteId: plan.pacienteId, planId: plan.id, planValue: t.total, serviceName: plan.nombre })
            await db.planTratamiento.update({ where: { id: plan.id }, data: { recapturaAt: new Date() } })
            emitidos++
          }
          if (emitidos > 0) log.info('mantenimiento: tratamiento pendiente emitido a TuBot', { clinica: c.slug, emitidos })
        })
      } catch (e) {
        log.error('mantenimiento: emisión de tratamiento pendiente falló', { clinica: c.slug, err: serializeError(e) })
      } finally {
        await disposeTenant(c.dbName)
      }
    }
  } catch (e) {
    log.error('mantenimiento: emisión de tratamiento pendiente (global) falló', { err: serializeError(e) })
  }
}
