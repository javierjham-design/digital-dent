import type { Request, Response, NextFunction } from 'express'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { unauthorized, forbidden } from '@/lib/errors'
import { hashApiKey } from '@/services/ext.service'

// Autenticación por API key para el acceso externo read-only (servidor MCP de
// Claude / integraciones). Resuelve la clínica por el hash de la key y adjunta
// su cliente de tenant, análogo a requireTenant pero sin JWT. Scope: 1 clínica.
export async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = req.get('authorization') ?? ''
    const raw = (req.get('x-api-key') ?? auth.replace(/^Bearer\s+/i, '')).trim()
    if (!raw) throw unauthorized('Falta la API key (header X-API-Key o Authorization: Bearer).')
    const c = await control.clinica.findUnique({
      where: { apiKeyHash: hashApiKey(raw) },
      select: { id: true, slug: true, dbName: true, activo: true },
    })
    if (!c) throw unauthorized('API key inválida.')
    if (!c.activo) throw forbidden('La cuenta de la clínica está suspendida.')
    req.clinica = { id: c.id, slug: c.slug, dbName: c.dbName }
    req.tenant = tenantClient(c.dbName)
    next()
  } catch (e) {
    next(e)
  }
}
