import type { TenantClient } from '@/db/tenant'

export interface AuditEvent {
  accion: 'CREAR' | 'EDITAR' | 'EVOLUCIONAR' | 'ELIMINAR' | 'ACCESO'
  entidad: string
  entidadId?: string | null
  pacienteId?: string | null
  resumen: string
  datosPrevios?: unknown
}

// Deja un registro de auditoría. Nunca debe interrumpir la operación principal:
// si el log falla, se ignora (la trazabilidad es best-effort, no bloqueante).
export async function audit(db: TenantClient, actorId: string, e: AuditEvent): Promise<void> {
  try {
    const u = await db.user.findUnique({ where: { id: actorId }, select: { name: true, email: true } }).catch(() => null)
    await db.auditLog.create({
      data: {
        userId: actorId,
        userNombre: u?.name ?? u?.email ?? null,
        accion: e.accion,
        entidad: e.entidad,
        entidadId: e.entidadId ?? null,
        pacienteId: e.pacienteId ?? null,
        resumen: e.resumen.slice(0, 500),
        datosPrevios: e.datosPrevios != null ? JSON.stringify(e.datosPrevios).slice(0, 4000) : null,
      },
    })
  } catch {
    // No-op: la auditoría no debe romper la acción clínica.
  }
}

export async function listarAuditoria(db: TenantClient, pacienteId: string) {
  if (!pacienteId) return []
  return db.auditLog.findMany({ where: { pacienteId }, orderBy: { fecha: 'desc' }, take: 500 })
}
