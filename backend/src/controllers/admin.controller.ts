import type { Request, Response } from 'express'
import * as svc from '@/services/admin.service'
import type { AuditCtx } from '@/services/admin.service'

// Contexto de auditoría a partir del request (super-admin autenticado).
function audit(req: Request): AuditCtx {
  return {
    actorId: req.auth!.sub,
    actorEmail: req.auth!.email ?? '',
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  }
}

// ── Clínicas ──
export const getClinicas = async (_req: Request, res: Response) => res.json(await svc.listarClinicas())
export const getClinica = async (req: Request, res: Response) => res.json(await svc.obtenerClinica(req.params.id))
export const postClinica = async (req: Request, res: Response) => res.status(201).json(await svc.crearClinica(audit(req), req.body ?? {}))
export const patchClinica = async (req: Request, res: Response) => res.json(await svc.actualizarClinica(req.params.id, req.body ?? {}))
export const postCambiarPlan = async (req: Request, res: Response) => res.json(await svc.cambiarPlan(audit(req), req.params.id, req.body ?? {}))
export const postEstado = async (req: Request, res: Response) => res.json(await svc.cambiarEstado(audit(req), req.params.id, req.body ?? {}))
export const postExtenderTrial = async (req: Request, res: Response) => res.json(await svc.extenderTrial(audit(req), req.params.id, req.body ?? {}))
export const postResetPassword = async (req: Request, res: Response) => res.json(await svc.resetAdminPassword(audit(req), req.params.id, req.body ?? {}))

// ── Pagos ──
export const getPagos = async (req: Request, res: Response) => res.json({ pagos: await svc.listarPagos(req.params.id) })
export const postPago = async (req: Request, res: Response) => res.json(await svc.registrarPago(audit(req), req.params.id, req.body ?? {}))
export const deletePago = async (req: Request, res: Response) => { await svc.eliminarPago(req.params.id, req.params.pagoId); res.json({ ok: true }) }

// ── Extras ──
export const getExtras = async (req: Request, res: Response) => res.json({ extras: await svc.listarExtras(req.params.id) })
export const postExtra = async (req: Request, res: Response) => res.status(201).json({ ok: true, extra: await svc.crearExtra(audit(req), req.params.id, req.body ?? {}) })
export const patchExtra = async (req: Request, res: Response) => { await svc.actualizarExtra(audit(req), req.params.id, req.params.extraId, req.body ?? {}); res.json({ ok: true }) }
export const deleteExtra = async (req: Request, res: Response) => { await svc.eliminarExtra(audit(req), req.params.id, req.params.extraId); res.json({ ok: true }) }

// ── WhatsApp config ──
export const getWhatsapp = async (req: Request, res: Response) => res.json(await svc.getWhatsapp(req.params.id))
export const putWhatsapp = async (req: Request, res: Response) => { await svc.putWhatsapp(audit(req), req.params.id, req.body ?? {}); res.json({ ok: true }) }

// ── Planes de suscripción ──
export const getPlanes = async (_req: Request, res: Response) => res.json({ planes: await svc.listarPlanesSuscripcion() })
export const postPlan = async (req: Request, res: Response) => res.status(201).json({ ok: true, plan: await svc.crearPlanSuscripcion(req.body ?? {}) })
export const patchPlan = async (req: Request, res: Response) => res.json({ ok: true, plan: await svc.actualizarPlanSuscripcion(req.params.id, req.body ?? {}) })
export const deletePlan = async (req: Request, res: Response) => { await svc.eliminarPlanSuscripcion(req.params.id); res.json({ ok: true }) }

// ── Resumen / stats / leads ──
export const getStats = async (_req: Request, res: Response) => res.json(await svc.dashboardStats())
export const getResumen = async (_req: Request, res: Response) => res.json(await svc.resumenSuscripciones())
export const getLeads = async (_req: Request, res: Response) => res.json({ leads: await svc.listarLeads() })
