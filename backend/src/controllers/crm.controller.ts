import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import { control } from '@/db/control'
import { tenantClient, type TenantClient } from '@/db/tenant'
import { notFound, tooMany } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import * as svc from '@/services/crm.service'
import * as leadAds from '@/services/meta-leadads.service'
import { crearLeadSchema, notaSchema, agendarLeadSchema, metaLeadSchema } from '@/validators/schemas'
import { parseModulos } from '@shared/constants/modulos'

// ── Admin (tenant) ────────────────────────────────────────────────────────────
export async function getLeads(req: Request, res: Response) {
  const { estado, origen, campana, q, desde, hasta } = req.query as Record<string, string | undefined>
  res.json(await svc.listarLeads(tenantDb(req), { estado, origen, campana, q, desde, hasta }))
}
export async function getCampanas(req: Request, res: Response) {
  const { desde, hasta } = req.query as Record<string, string | undefined>
  res.json(await svc.listarCampanas(tenantDb(req), { desde, hasta }))
}
export async function patchCampana(req: Request, res: Response) {
  const { key, label } = (req.body ?? {}) as { key?: string; label?: string }
  res.json(await svc.renombrarCampana(tenantDb(req), String(key ?? ''), String(label ?? '')))
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
export async function postAgendar(req: Request, res: Response) {
  const input = agendarLeadSchema.parse(req.body)
  res.status(201).json(await svc.agendarLead(tenantDb(req), req.auth!, req.params.id, input))
}
export async function deleteLead(req: Request, res: Response) {
  await svc.eliminarLead(tenantDb(req), req.params.id)
  res.json({ ok: true })
}
export async function getConfig(req: Request, res: Response) {
  res.json({ slug: req.clinica?.slug ?? '', ...(await svc.obtenerConfigCrm(tenantDb(req))) })
}
export async function patchConfig(req: Request, res: Response) {
  // Incluye el slug igual que getConfig: si no, el front pierde el slug al guardar
  // y las URLs de intake (landing + Formulario Meta) quedan con "undefined".
  res.json({ slug: req.clinica?.slug ?? '', ...(await svc.guardarConfigCrm(tenantDb(req), req.body ?? {}, { slug: req.clinica?.slug })) })
}
export async function postProbarMeta(req: Request, res: Response) {
  res.json(await svc.probarMeta(tenantDb(req)))
}
export async function postProbarMetaCrm(req: Request, res: Response) {
  res.json(await svc.probarMetaCrm(tenantDb(req)))
}
export async function postProbarRecepcionLeadAds(req: Request, res: Response) {
  res.json(await leadAds.probarRecepcionLeadAds(tenantDb(req)))
}
export async function postBackfillSchedule(req: Request, res: Response) {
  res.json(await svc.backfillSchedule(tenantDb(req)))
}

// ── Público (formulario hospedado + intake por slug/token) ───────────────────
// Resuelve la clínica por slug y exige que tenga el módulo CRM habilitado (si el
// super-admin lo desactivó, el formulario deja de captar).
async function resolverTenant(slug: string): Promise<TenantClient> {
  const clinica = await control.clinica.findUnique({ where: { slug }, select: { dbName: true, activo: true, modulos: true } })
  if (!clinica || !clinica.activo) throw notFound('Clínica no disponible')
  if (!parseModulos(clinica.modulos).includes('crm')) throw notFound('Formulario no disponible')
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

// Intake del Formulario Instantáneo de Meta (Make hace POST aquí con los campos +
// leadgen_id + ad/adset/campaign/form/page). Dedup por teléfono/rut/email.
export async function postMetaLead(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown'
  const rl = rateLimit(`metalead:ip:${ip}`, { limit: 60, windowMs: 60 * 60_000 })
  if (!rl.ok) throw tooMany('Demasiados envíos seguidos. Intenta nuevamente en un rato.')
  const { slug, token } = req.params
  const db = await resolverTenant(slug)
  if (!(await svc.tokenCrmValido(db, token))) throw notFound('Formulario no encontrado')
  const input = metaLeadSchema.parse(req.body)
  const r = await svc.ingestarLeadMeta(db, input, { ip, userAgent: req.get('user-agent') ?? undefined })
  res.status(201).json({ ok: true, leadId: r.lead?.id, reconciliado: r.reconciliado })
}
