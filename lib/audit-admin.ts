import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

// Acciones sensibles del super-admin que requieren auditoría.
export type AdminAction =
  | 'CREAR_CLINICA'
  | 'CAMBIAR_PLAN'
  | 'CAMBIAR_ESTADO'
  | 'EXTENDER_TRIAL'
  | 'RESET_PASSWORD'
  | 'REGISTRAR_PAGO'
  | 'ELIMINAR_PAGO'
  | 'CREAR_PLAN_SUSCRIPCION'
  | 'EDITAR_PLAN_SUSCRIPCION'
  | 'ELIMINAR_PLAN_SUSCRIPCION'

export type AdminTargetType = 'CLINICA' | 'USUARIO' | 'PAGO' | 'PLAN_SUSCRIPCION'

/**
 * Persiste una entrada en la bitácora del super-admin.
 *
 * Best-effort: si la escritura falla (problema de DB, schema desactualizado,
 * etc.) NO debe romper la operación primaria. Solo logueamos el error a
 * stderr para que aparezca en Railway logs.
 */
export async function auditAdmin(args: {
  actorId: string
  actorEmail: string
  action: AdminAction
  targetType: AdminTargetType
  targetId?: string | null
  details?: Record<string, unknown>
  req?: NextRequest
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
        ip: args.req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? args.req?.headers.get('x-real-ip')
          ?? null,
        userAgent: args.req?.headers.get('user-agent')?.slice(0, 500) ?? null,
      },
    })
  } catch (e) {
    console.error('[audit-admin] failed to persist:', e)
  }
}
