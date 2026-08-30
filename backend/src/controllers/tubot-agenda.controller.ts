import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/tubot-agenda.service'
import { estadoTubotApiKey, rotarTubotApiKey, revocarTubotApiKey } from '@/services/ext.service'
import { AppError } from '@/lib/errors'

// API que consume TuBot para agendar (contrato docs/TUBOT_AGENDA.md). Autenticada
// por token dedicado (requireTubotApiKey), que resuelve el tenant en req.clinica/req.tenant.
// Fase 1: catálogo de lectura (clinics / professionals / services).

export async function getClinics(req: Request, res: Response) {
  res.json(await svc.clinics(tenantDb(req), req.clinica!.slug))
}

export async function getProfessionals(req: Request, res: Response) {
  res.json(await svc.professionals(tenantDb(req), req.clinica!.slug))
}

export async function getServices(req: Request, res: Response) {
  res.json(await svc.services(tenantDb(req)))
}

export async function getProfessionalServices(req: Request, res: Response) {
  res.json(await svc.professionalServices(tenantDb(req), req.params.id))
}

// GET /availability?clinicId&professionalId&serviceId&from&to (Fase 2)
export async function getAvailability(req: Request, res: Response) {
  const q = req.query as Record<string, string | undefined>
  res.json(await svc.availability(tenantDb(req), req.clinica!.slug, {
    professionalId: q.professionalId, serviceId: q.serviceId, from: q.from, to: q.to,
  }))
}

// ── Fase 3: citas (TuBot agenda) + pacientes ──────────────────────────────────

// Idempotencia best-effort del POST /appointments: cachea la respuesta por
// (clínica + Idempotency-Key) durante IDEM_TTL, para que un reintento de red no
// duplique la cita. En memoria del proceso (no persistente): suficiente para el
// reintento inmediato, que es el caso de uso del contrato.
const IDEM_TTL = 15 * 60 * 1000
const idemCache = new Map<string, { at: number; body: unknown }>()
function idemGet(k: string): unknown | null {
  const v = idemCache.get(k)
  if (!v) return null
  if (Date.now() - v.at > IDEM_TTL) { idemCache.delete(k); return null }
  return v.body
}
function idemSet(k: string, body: unknown) {
  idemCache.set(k, { at: Date.now(), body })
  if (idemCache.size > 5000) for (const [kk, vv] of idemCache) if (Date.now() - vv.at > IDEM_TTL) idemCache.delete(kk)
}

export async function postAppointment(req: Request, res: Response) {
  const slug = req.clinica!.slug
  const key = req.get('Idempotency-Key')
  const cacheKey = key ? `${slug}:${key}` : ''
  if (cacheKey) { const hit = idemGet(cacheKey); if (hit) return res.status(201).json(hit) }
  try {
    const appt = await svc.createAppointment(tenantDb(req), slug, req.body)
    if (cacheKey) idemSet(cacheKey, appt)
    res.status(201).json(appt)
  } catch (e) {
    // Doble reserva (findSolapada/bloqueo) → el contrato espera 409 slot_taken.
    if (e instanceof AppError && e.status === 409) return res.status(409).json({ error: 'slot_taken', message: e.message })
    throw e
  }
}

export async function getAppointmentById(req: Request, res: Response) {
  const appt = await svc.getAppointment(tenantDb(req), req.clinica!.slug, req.params.id)
  if (!appt) return res.status(404).json({ error: 'not_found' })
  res.json(appt)
}

export async function patchAppointment(req: Request, res: Response) {
  try {
    const appt = await svc.updateAppointment(tenantDb(req), req.clinica!.slug, req.params.id, req.body)
    if (!appt) return res.status(404).json({ error: 'not_found' })
    res.json(appt)
  } catch (e) {
    if (e instanceof AppError && e.status === 409) return res.status(409).json({ error: 'slot_taken', message: e.message })
    throw e
  }
}

async function cambiarEstado(req: Request, res: Response, estado: string) {
  const appt = await svc.setEstadoAppointment(tenantDb(req), req.clinica!.slug, req.params.id, estado)
  if (!appt) return res.status(404).json({ error: 'not_found' })
  res.json(appt)
}
export const cancelAppointment = (req: Request, res: Response) => cambiarEstado(req, res, 'CANCELADA')
export const confirmAppointment = (req: Request, res: Response) => cambiarEstado(req, res, 'CONFIRMADO')
export function attendanceAppointment(req: Request, res: Response) {
  const attended = req.body?.attended !== false
  return cambiarEstado(req, res, attended ? 'ATENDIDA' : 'NO_ASISTIO')
}

export async function putPatient(req: Request, res: Response) {
  res.json(await svc.upsertPatient(tenantDb(req), req.body))
}

export async function getPatientAppointments(req: Request, res: Response) {
  res.json(await svc.patientAppointments(tenantDb(req), req.clinica!.slug, req.params.phone))
}

// ── Fase 4: CRM (lectura de pacientes + notas) ────────────────────────────────
export async function getCrmPatients(req: Request, res: Response) {
  const q = req.query as Record<string, string | undefined>
  res.json(await svc.crmSearchPatients(tenantDb(req), {
    query: q.query ?? q.q,
    page: q.page ? Number(q.page) : undefined,
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  }))
}
export async function getCrmPatient(req: Request, res: Response) {
  res.json(await svc.crmPatient(tenantDb(req), req.clinica!.slug, req.params.id))
}
export async function getCrmNotes(req: Request, res: Response) {
  res.json(await svc.crmNotes(tenantDb(req), req.params.id))
}
export async function postCrmNote(req: Request, res: Response) {
  res.status(201).json(await svc.crmAddNote(tenantDb(req), req.params.id, req.body?.text))
}

// ── Super-admin: gestión del token de la integración (por clínica) ────────────
export async function getTubotConfig(req: Request, res: Response) {
  res.json(await estadoTubotApiKey(req.params.id))
}
export async function postTubotToken(req: Request, res: Response) {
  res.json(await rotarTubotApiKey(req.params.id))
}
export async function deleteTubotToken(req: Request, res: Response) {
  res.json(await revocarTubotApiKey(req.params.id))
}
