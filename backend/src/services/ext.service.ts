import { createHash, randomBytes } from 'node:crypto'
import { control } from '@/db/control'
import type { TenantClient } from '@/db/tenant'

// Acceso externo read-only (servidor MCP de Claude / integraciones). Cada clínica
// tiene su propia API key; se guarda HASHEADA en el control-plane y se muestra en
// claro sólo al generarla. El middleware resuelve la clínica por el hash.

export const hashApiKey = (raw: string) => createHash('sha256').update(raw.trim()).digest('hex')

export async function estadoApiKey(clinicaId: string) {
  const c = await control.clinica.findUnique({ where: { id: clinicaId }, select: { apiKeyHash: true } })
  return { hasApiKey: Boolean(c?.apiKeyHash) }
}

export async function rotarApiKey(clinicaId: string) {
  const apiKey = `clv_${randomBytes(24).toString('base64url')}`
  await control.clinica.update({ where: { id: clinicaId }, data: { apiKeyHash: hashApiKey(apiKey) } })
  return { apiKey } // sólo se muestra esta vez
}

export async function revocarApiKey(clinicaId: string) {
  await control.clinica.update({ where: { id: clinicaId }, data: { apiKeyHash: null } })
  return { ok: true as const }
}

// Estadísticas generales de la clínica para el MCP (agregados, sin PII).
export async function estadisticasPlataforma(db: TenantClient) {
  const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0)
  const finHoy = new Date(inicioHoy.getTime() + 24 * 3600_000)
  const en7 = new Date(inicioHoy.getTime() + 7 * 24 * 3600_000)
  const [pacientes, pacientesActivos, citasHoy, citasSemana, leadsEstado, leadsOrigen] = await Promise.all([
    db.paciente.count(),
    db.paciente.count({ where: { activo: true } }),
    db.cita.count({ where: { fecha: { gte: inicioHoy, lt: finHoy } } }),
    db.cita.count({ where: { fecha: { gte: inicioHoy, lt: en7 } } }),
    db.lead.groupBy({ by: ['estado'], _count: { _all: true } }),
    db.lead.groupBy({ by: ['origen'], _count: { _all: true } }),
  ])
  return {
    pacientes: { total: pacientes, activos: pacientesActivos },
    citas: { hoy: citasHoy, proximos7dias: citasSemana },
    leads: {
      total: leadsEstado.reduce((s, r) => s + r._count._all, 0),
      porEstado: Object.fromEntries(leadsEstado.map((r) => [r.estado, r._count._all])),
      porOrigen: Object.fromEntries(leadsOrigen.map((r) => [r.origen, r._count._all])),
    },
    generadoEn: new Date().toISOString(),
  }
}
