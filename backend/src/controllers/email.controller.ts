import type { Request, Response } from 'express'
import { tenantDb } from '@/middlewares/tenant'
import * as svc from '@/services/email.service'

// Envío manual de un correo (presupuesto, consentimiento, comprobante, plan,
// documento, aviso de deuda…). El PDF va como base64 (lo genera el frontend).
export async function postEnviar(req: Request, res: Response) {
  const b = (req.body ?? {}) as Record<string, unknown>
  res.status(201).json(await svc.enviarManual(tenantDb(req), req.auth!, {
    to: String(b.to ?? ''),
    tipo: b.tipo != null ? String(b.tipo) : undefined,
    asunto: String(b.asunto ?? ''),
    mensaje: b.mensaje != null ? String(b.mensaje) : undefined,
    html: b.html != null ? String(b.html) : undefined,
    pacienteId: b.pacienteId != null ? String(b.pacienteId) : undefined,
    pacienteNombre: b.pacienteNombre != null ? String(b.pacienteNombre) : undefined,
    pdfBase64: b.pdfBase64 != null ? String(b.pdfBase64) : undefined,
    pdfNombre: b.pdfNombre != null ? String(b.pdfNombre) : undefined,
  }))
}

export async function getEmails(req: Request, res: Response) {
  const pacienteId = typeof req.query.pacienteId === 'string' ? req.query.pacienteId : undefined
  res.json(await svc.listarEmails(tenantDb(req), pacienteId))
}
