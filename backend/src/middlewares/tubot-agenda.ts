import type { Request, Response, NextFunction } from 'express'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { unauthorized, forbidden } from '@/lib/errors'
import { hashApiKey } from '@/services/ext.service'
import { patchRequestContext } from '@/lib/request-context'

// Autenticación de la API de AGENDA que consume TuBot (contrato docs/TUBOT_AGENDA.md).
// Token dedicado por clínica (`tbk_…`, hash en Clinica.tubotApiKeyHash), distinto de la
// API key del CRM/MCP. Resuelve la clínica por el hash y adjunta su cliente de tenant.
export async function requireTubotApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = req.get('authorization') ?? ''
    const raw = (req.get('x-api-key') ?? auth.replace(/^Bearer\s+/i, '')).trim()
    if (!raw) throw unauthorized('Falta el token (Authorization: Bearer).')
    const c = await control.clinica.findFirst({
      where: { tubotApiKeyHash: hashApiKey(raw) },
      select: { id: true, slug: true, dbName: true, activo: true },
    })
    if (!c) throw unauthorized('Token inválido.')
    if (!c.activo) throw forbidden('La cuenta de la clínica está suspendida.')
    req.clinica = { id: c.id, slug: c.slug, dbName: c.dbName }
    req.tenant = tenantClient(c.dbName)
    patchRequestContext({ slug: c.slug }) // para el clinicId de los webhooks salientes
    next()
  } catch (e) {
    next(e)
  }
}
