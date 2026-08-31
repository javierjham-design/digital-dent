import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { guardarHorarios, listarHorarios } from '@/services/horarios.service'
import { actualizarBloqueo, crearBloqueo, eliminarBloqueo, listarBloqueos } from '@/services/bloqueos.service'
import { slotsLibres } from '@/services/agenda-online.service'
import { todayYmd, addDaysYmd } from '@/lib/tz'
import { badRequest } from '@/lib/errors'
import { guardarHorariosSchema, crearBloqueoSchema } from '@/validators/schemas'

// ── Disponibilidad (slots libres de un profesional) ──
// Para elegir una hora real al agendar (CRM, etc.): slots libres según el
// HorarioDoctor − ocupación, en pasos de `durationMin`, del más cercano al más lejano.
export async function getDisponibilidad(req: Request, res: Response) {
  const q = req.query as Record<string, string | undefined>
  const doctorId = (q.doctorId ?? '').trim()
  if (!doctorId) throw badRequest('doctorId requerido')
  const durationMin = Math.min(Math.max(Number(q.durationMin) || 30, 5), 480)
  const dias = Math.min(Math.max(Number(q.dias) || 30, 1), 60)
  const from = todayYmd()
  const to = addDaysYmd(from, dias)
  const libres = await slotsLibres(tenantDb(req), doctorId, durationMin, from, to)
  res.json({ slots: libres.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })) })
}

// ── Horarios ──
export async function getHorarios(req: Request, res: Response) {
  const doctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined
  res.json(await listarHorarios(tenantDb(req), doctorId))
}

export async function postHorarios(req: Request, res: Response) {
  const { doctorId, days } = guardarHorariosSchema.parse(req.body)
  res.json(await guardarHorarios(tenantDb(req), doctorId, days))
}

// ── Bloqueos ──
export async function getBloqueos(req: Request, res: Response) {
  const { from, to, doctorId } = req.query as Record<string, string | undefined>
  res.json(await listarBloqueos(tenantDb(req), req.auth!, { from, to, doctorId }))
}

export async function postBloqueo(req: Request, res: Response) {
  const input = crearBloqueoSchema.parse(req.body)
  res.status(201).json(await crearBloqueo(tenantDb(req), req.auth!, input))
}

export async function patchBloqueo(req: Request, res: Response) {
  res.json(await actualizarBloqueo(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}

export async function deleteBloqueo(req: Request, res: Response) {
  await eliminarBloqueo(tenantDb(req), req.auth!, req.params.id)
  res.json({ ok: true })
}
