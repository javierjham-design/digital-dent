import { prisma } from '@/lib/prisma'

// Auditoría de acciones sensibles del super-admin. Versión backend: recibe
// ip/userAgent ya extraídos (el controller los saca del request de Express).
// Best-effort: nunca rompe la operación primaria.

export type AdminAction =
  | 'CREAR_CLINICA' | 'CAMBIAR_PLAN' | 'CAMBIAR_ESTADO' | 'EXTENDER_TRIAL'
  | 'RESET_PASSWORD' | 'REGISTRAR_PAGO' | 'ELIMINAR_PAGO'
  | 'CREAR_PLAN_SUSCRIPCION' | 'EDITAR_PLAN_SUSCRIPCION' | 'ELIMINAR_PLAN_SUSCRIPCION'
  | 'CREAR_EXTRA' | 'EDITAR_EXTRA' | 'ELIMINAR_EXTRA' | 'CONFIGURAR_WHATSAPP'

export type AdminTargetType = 'CLINICA' | 'USUARIO' | 'PAGO' | 'PLAN_SUSCRIPCION' | 'EXTRA_SUSCRIPCION'

export async function auditAdmin(args: {
  actorId: string
  actorEmail: string
  action: AdminAction
  targetType: AdminTargetType
  targetId?: string | null
  details?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}): Promise<void> {
  try {
    await prisma.auditLogAdmin.create({
      data: {
        actorId: args.actorId,
        actorEmail: args.actorEmail,
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId ?? null,
        details: args.details ? JSON.stringify(args.details).slice(0, 4000) : null,
        ip: args.ip ?? null,
        userAgent: args.userAgent?.slice(0, 500) ?? null,
      },
    })
  } catch (e) {
    console.error('[audit-admin] failed to persist:', e)
  }
}
