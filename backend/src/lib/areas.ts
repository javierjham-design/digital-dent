// Áreas clínicas efectivas: un área está disponible para un actor solo si la
// CLÍNICA la contrató (módulo area_* en el control-plane) Y el USUARIO la tiene
// habilitada (flags en User). Este módulo es el único punto que resuelve esa
// intersección y el guard correspondiente.
import type { TenantClient } from '@/db/tenant'
import { getClinicaModulos } from '@/middlewares/tenant'
import { areasDeModulos, FLAG_POR_AREA, AREA_LABELS, type AreaClinica } from '@shared/constants/areas'
import { forbidden } from '@/lib/errors'
import { log } from '@/lib/logger'
import { captureError } from '@/lib/observability'

// Áreas contratadas por la clínica. Fallback RUIDOSO (no silencioso): una clínica
// sin NINGÚN módulo de área es una fila anterior al módulo de áreas — el backfill
// de la puesta en producción asigna area_dental explícito a las existentes. Si
// esto aparece en los logs, falta ese backfill: se trata como DENTAL para no
// romper la operación, pero se avisa fuerte.
export async function areasDeClinica(clinicaId: string): Promise<AreaClinica[]> {
  const modulos = await getClinicaModulos(clinicaId)
  const areas = areasDeModulos(modulos)
  if (areas.length > 0) return areas
  log.error('areas: clínica sin ningún módulo de área (falta backfill area_dental) — fallback DENTAL', { clinicaId })
  captureError(new Error(`Clínica ${clinicaId} sin módulos de área (fallback DENTAL)`), { route: 'areasDeClinica' })
  return ['DENTAL']
}

export interface ActorArea { sub: string; role: string; clinicaId: string | null }

// Áreas efectivas del actor (clínica ∩ usuario). El admin de la clínica tiene
// todas las que la clínica contrató (mismo criterio que los permisos puede*).
export async function areasDisponibles(db: TenantClient, actor: ActorArea): Promise<AreaClinica[]> {
  if (!actor.clinicaId) return []
  const deClinica = await areasDeClinica(actor.clinicaId)
  if (actor.role === 'admin') return deClinica
  const u = await db.user.findUnique({
    where: { id: actor.sub },
    select: { areaDental: true, areaEstetica: true, areaMedico: true },
  })
  if (!u) return []
  return deClinica.filter((a) => u[FLAG_POR_AREA[a]])
}

// Guard: el actor no puede operar en un área que la clínica no contrató o que él
// no tiene habilitada (análogo a requireModulo+requirePermiso, pero por dato del
// body — el área se deriva de la prestación — así que vive en el service).
export async function assertAreaDisponible(db: TenantClient, actor: ActorArea, area: AreaClinica): Promise<void> {
  const areas = await areasDisponibles(db, actor)
  if (!areas.includes(area)) {
    throw forbidden(`No tienes habilitada el área ${AREA_LABELS[area] ?? area} (o la clínica no la contrató).`)
  }
}
