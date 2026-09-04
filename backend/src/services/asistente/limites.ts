// Límites de costo duros, calculados desde AsistenteAuditoria en hora de la
// clínica: por usuario/día, por clínica/día y tope mensual en USD por clínica.
// Se chequean ANTES de llamar al proveedor.
import type { TenantClient } from '@/db/tenant'
import { env } from '@/config/env'
import { rangoFechasUtc, todayYmd, CLINIC_TZ } from '@/lib/tz'

export interface Contadores { usuarioHoy: number; clinicaHoy: number; clinicaMesUsd: number }

function whereRango(r: { gte?: Date; lte?: Date }) {
  return { ...(r.gte ? { gte: r.gte } : {}), ...(r.lte ? { lte: r.lte } : {}) }
}

// Las filas con estado 'limite' son rechazos: no consumieron proveedor y no
// cuentan para el límite de consultas (sí se guardan para auditoría).
export async function contadores(db: TenantClient, userId: string, tz: string = CLINIC_TZ): Promise<Contadores> {
  const hoy = todayYmd(tz)
  const rangoHoy = rangoFechasUtc(hoy, hoy, tz)
  const rangoMes = rangoFechasUtc(`${hoy.slice(0, 7)}-01`, hoy, tz)
  const [usuarioHoy, clinicaHoy, agg] = await Promise.all([
    db.asistenteAuditoria.count({ where: { userId, estado: { not: 'limite' }, createdAt: whereRango(rangoHoy) } }),
    db.asistenteAuditoria.count({ where: { estado: { not: 'limite' }, createdAt: whereRango(rangoHoy) } }),
    db.asistenteAuditoria.aggregate({ _sum: { costoUsd: true }, where: { createdAt: whereRango(rangoMes) } }),
  ])
  return { usuarioHoy, clinicaHoy, clinicaMesUsd: agg._sum.costoUsd ?? 0 }
}

// Devuelve el mensaje del límite superado, o null si hay cupo.
export function limiteSuperado(c: Contadores): string | null {
  if (c.usuarioHoy >= env.asistente.limiteUsuarioDia) return 'Alcanzaste tu límite diario de consultas al asistente.'
  if (c.clinicaHoy >= env.asistente.limiteClinicaDia) return 'La clínica alcanzó su límite diario de consultas al asistente.'
  if (c.clinicaMesUsd >= env.asistente.limiteClinicaMesUsd) return 'La clínica alcanzó su tope mensual de uso del asistente.'
  return null
}
