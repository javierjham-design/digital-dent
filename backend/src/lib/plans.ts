import { control } from '@/db/control'

// Defaults usados para seed inicial y como fallback si la consulta a DB falla.
// El catálogo "real" vive en la tabla PlanSuscripcion y se gestiona desde el
// super-admin (/digital-dent-super-admin/planes).
const DEFAULT_PLANS = [
  {
    id: 'TRIAL',
    nombre: 'Prueba',
    descripcion: 'Acceso completo por 30 días sin cobro.',
    precioMensual: 0,
    precioAnual: null as number | null,
    caracteristicas: [
      'Pacientes ilimitados',
      'Agenda completa',
      'Presupuestos y cobros',
      'Soporte por correo',
    ],
    destacado: false,
    orden: 0,
  },
  {
    id: 'BASICO',
    nombre: 'Básico',
    descripcion: 'Funcionalidades core para una clínica pequeña.',
    precioMensual: 19900,
    precioAnual: null as number | null,
    caracteristicas: [
      'Pacientes ilimitados',
      'Agenda y fichas clínicas',
      'Presupuestos, cobros y liquidaciones',
      'Hasta 10 GB de almacenamiento',
      'Soporte por correo',
    ],
    destacado: false,
    orden: 10,
  },
  {
    id: 'PRO',
    nombre: 'Pro',
    descripcion: 'Para clínicas con varios doctores y mayor volumen.',
    precioMensual: 39900,
    precioAnual: null as number | null,
    caracteristicas: [
      'Todo lo del plan Básico',
      'Módulo de archivos y radiografías',
      'Hasta 50 GB de almacenamiento',
      'Reportes avanzados',
      'Soporte prioritario',
    ],
    destacado: true,
    orden: 20,
  },
] as const

export type Plan = {
  id: string
  nombre: string
  descripcion: string | null
  precioMensual: number
  precioAnual: number | null
  caracteristicas: string[]
  destacado: boolean
  orden: number
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

function parseCaracteristicas(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function mapPlan(r: {
  id: string; nombre: string; descripcion: string | null
  precioMensual: number; precioAnual: number | null
  caracteristicas: string; destacado: boolean; orden: number
  activo: boolean; createdAt: Date; updatedAt: Date
}): Plan {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    precioMensual: r.precioMensual,
    precioAnual: r.precioAnual,
    caracteristicas: parseCaracteristicas(r.caracteristicas),
    destacado: r.destacado,
    orden: r.orden,
    activo: r.activo,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// Idempotente: crea los planes default si la tabla está vacía.
// Llamado on-demand desde lecturas para que la primera carga del super-admin
// no se quede vacía aunque nadie haya corrido un seed explícito.
export async function ensureDefaultPlans(): Promise<void> {
  const count = await control.planSuscripcion.count()
  if (count > 0) return
  await control.planSuscripcion.createMany({
    data: DEFAULT_PLANS.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precioMensual: p.precioMensual,
      precioAnual: p.precioAnual,
      caracteristicas: JSON.stringify(p.caracteristicas),
      destacado: p.destacado,
      orden: p.orden,
      activo: true,
    })),
    skipDuplicates: true,
  })
}

export async function getPlanes(opts: { soloActivos?: boolean } = {}): Promise<Plan[]> {
  await ensureDefaultPlans()
  const rows = await control.planSuscripcion.findMany({
    where: opts.soloActivos ? { activo: true } : undefined,
    orderBy: [{ orden: 'asc' }, { precioMensual: 'asc' }],
  })
  return rows.map(mapPlan)
}

export async function getPlan(id: string): Promise<Plan | null> {
  await ensureDefaultPlans()
  const r = await control.planSuscripcion.findUnique({ where: { id } })
  return r ? mapPlan(r) : null
}

// Helper para casos donde solo necesitamos precio (legacy, evitar en código nuevo).
export async function getPrecioMensual(planId: string): Promise<number> {
  const p = await getPlan(planId)
  return p?.precioMensual ?? 0
}

// Etiquetas y descripciones legacy (mantener para compatibilidad con UI vieja).
// El código nuevo debe leer del Plan directo.
export const PLAN_LABELS_FALLBACK: Record<string, string> = {
  TRIAL:   'Prueba',
  BASICO:  'Básico',
  PRO:     'Pro',
}
