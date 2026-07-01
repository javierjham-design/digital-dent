import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { control } from '@/db/control'
import { tenantClient, type TenantClient } from '@/db/tenant'
import { notFound, tooMany } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import * as svc from '@/services/crm.service'
import { crearLeadSchema, notaSchema } from '@/validators/schemas'

// ── Admin (tenant) ────────────────────────────────────────────────────────────
export async function getLeads(req: Request, res: Response) {
  const { estado, origen, q, desde, hasta } = req.query as Record<string, string | undefined>
  res.json(await svc.listarLeads(tenantDb(req), { estado, origen, q, desde, hasta }))
}
export async function getResumen(req: Request, res: Response) {
  res.json(await svc.resumenCrm(tenantDb(req)))
}
export async function getLead(req: Request, res: Response) {
  res.json(await svc.obtenerLead(tenantDb(req), req.params.id))
}
export async function postLead(req: Request, res: Response) {
  const input = crearLeadSchema.parse(req.body)
  res.status(201).json(await svc.crearLead(tenantDb(req), { ...input, origen: input.origen || 'MANUAL' }, {
    autorId: req.auth?.sub, autorNombre: req.auth?.name ?? undefined,
  }))
}
export async function patchLead(req: Request, res: Response) {
  res.json(await svc.actualizarLead(tenantDb(req), req.auth!, req.params.id, req.body ?? {}))
}
export async function postNota(req: Request, res: Response) {
  const { texto } = notaSchema.parse(req.body)
  res.status(201).json(await svc.agregarNota(tenantDb(req), req.auth!, req.params.id, texto))
}
export async function postConvertir(req: Request, res: Response) {
  res.json(await svc.convertirEnPaciente(tenantDb(req), req.auth!, req.params.id))
}
export async function deleteLead(req: Request, res: Response) {
  await svc.eliminarLead(tenantDb(req), req.params.id)
  res.json({ ok: true })
}
export async function getConfig(req: Request, res: Response) {
  res.json({ slug: req.clinica?.slug ?? '', ...(await svc.obtenerConfigCrm(tenantDb(req))) })
}
export async function patchConfig(req: Request, res: Response) {
  res.json(await svc.guardarConfigCrm(tenantDb(req), req.body ?? {}))
}

// ── Público (formulario hospedado + intake por slug/token) ───────────────────
async function resolverTenant(slug: string): Promise<TenantClient> {
  const clinica = await control.clinica.findUnique({ where: { slug }, select: { dbName: true, activo: true } })
  if (!clinica || !clinica.activo) throw notFound('Clínica no disponible')
  return tenantClient(clinica.dbName)
}

export async function getPublicForm(req: Request, res: Response) {
  const { slug, token } = req.params
  const db = await resolverTenant(slug)
  const cfg = await svc.obtenerFormPublico(db, token)
  if (!cfg) throw notFound('Formulario no encontrado')
  res.json(cfg)
}

export async function postPublicLead(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown'
  const rl = rateLimit(`lead:ip:${ip}`, { limit: 12, windowMs: 60 * 60_000 })
  if (!rl.ok) throw tooMany('Demasiados envíos seguidos. Intenta nuevamente en un rato.')
  const { slug, token } = req.params
  const db = await resolverTenant(slug)
  if (!(await svc.tokenCrmValido(db, token))) throw notFound('Formulario no encontrado')
  const input = crearLeadSchema.parse(req.body)
  const lead = await svc.crearLead(db, { ...input, origen: input.origen || 'FORMULARIO' }, {
    ip, userAgent: req.get('user-agent') ?? undefined,
  })
  res.status(201).json({ ok: true, leadId: lead.id })
}
