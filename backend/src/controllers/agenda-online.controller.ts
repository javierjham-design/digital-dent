import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { control } from '@/db/control'
import { tenantClient, type TenantClient } from '@/db/tenant'
import { notFound, tooMany } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import * as svc from '@/services/agenda-online.service'
import { crearLinkSchema, reservarOnlineSchema } from '@/validators/schemas'

// ── Admin (tenant) ────────────────────────────────────────────────────────────
export async function getLinks(req: Request, res: Response) {
  res.json({ slug: req.clinica?.slug ?? '', links: await svc.listarLinks(tenantDb(req)) })
}
export async function postLink(req: Request, res: Response) {
  const input = crearLinkSchema.parse(req.body)
  res.status(201).json(await svc.crearLink(tenantDb(req), input))
}
export async function patchLink(req: Request, res: Response) {
  res.json(await svc.actualizarLink(tenantDb(req), req.params.id, req.body ?? {}))
}
export async function deleteLink(req: Request, res: Response) {
  await svc.eliminarLink(tenantDb(req), req.params.id)
  res.json({ ok: true })
}
export async function getReservas(req: Request, res: Response) {
  const linkId = typeof req.query.linkId === 'string' ? req.query.linkId : undefined
  res.json(await svc.listarReservas(tenantDb(req), { linkId }))
}

// ── Público (sin auth, resuelve la clínica por slug) ──────────────────────────
async function resolverTenant(slug: string): Promise<TenantClient> {
  const clinica = await control.clinica.findUnique({ where: { slug }, select: { dbName: true, activo: true } })
  if (!clinica || !clinica.activo) throw notFound('Clínica no disponible')
  return tenantClient(clinica.dbName)
}

export async function getPublicAgenda(req: Request, res: Response) {
  const { slug, token } = req.params
  const db = await resolverTenant(slug)
  const link = await svc.obtenerLinkPorToken(db, token)
  if (!link) throw notFound('Link de agendamiento no encontrado o inactivo')
  const cfg = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: { nombre: true, logoUrl: true, direccion: true, telefono: true, ciudad: true, metaEnabled: true, metaPixelId: true },
  })
  // Profesionales del link (uno o varios). El paciente elige; por defecto el primero.
  const profes = (link.profesionales.length ? link.profesionales.map((p) => p.user) : [link.doctor])
  const ids = profes.map((p) => p.id)
  const sel = typeof req.query.doctorId === 'string' && ids.includes(req.query.doctorId) ? req.query.doctorId : ids[0]
  const dias = await svc.calcularSlots(db, link, sel)
  res.json({
    clinica: { nombre: cfg?.nombre ?? 'Clínica', logoUrl: cfg?.logoUrl ?? null, direccion: cfg?.direccion ?? '', telefono: cfg?.telefono ?? '', ciudad: cfg?.ciudad ?? '' },
    pixelId: cfg?.metaEnabled ? (cfg?.metaPixelId ?? null) : null,
    link: {
      nombre: link.nombre, descripcion: link.descripcion, tipoCita: link.tipoCita, duracionMin: link.duracionMin,
      diasMaxFuturo: link.diasMaxFuturo, color: link.color, mensajeConfirmacion: link.mensajeConfirmacion,
      profesionales: profes.map((p) => ({ id: p.id, nombre: p.name ?? p.email, especialidad: p.especialidad })),
    },
    doctorId: sel,
    dias,
  })
}

export async function postPublicReserva(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown'
  const rl = rateLimit(`reserva:ip:${ip}`, { limit: 8, windowMs: 60 * 60_000 })
  if (!rl.ok) throw tooMany('Demasiados intentos seguidos. Intenta nuevamente en un rato.')
  const { slug, token } = req.params
  const input = reservarOnlineSchema.parse(req.body)
  const db = await resolverTenant(slug)
  const link = await svc.obtenerLinkPorToken(db, token)
  if (!link) throw notFound('Link de agendamiento no encontrado o inactivo')
  res.status(201).json(await svc.reservarPublico(db, link, input))
}
