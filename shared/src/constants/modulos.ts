// Módulos "asignables" por clínica desde el super-admin (entitlements). Los
// demás módulos (agenda, pacientes, cobros, presupuestos, prestaciones,
// liquidaciones, consentimientos, documentos…) son base y están siempre activos.

export interface ModuloDef { code: string; nombre: string; descripcion: string }

// Módulos base (no-área). Separados de las áreas porque MODULOS_DEFAULT debe
// seguir siendo EXACTAMENTE estos tres: una clínica nueva NO nace con las tres
// áreas — recibe solo la de su vertical (se agrega explícitamente al crearla).
const MODULOS_BASE: ModuloDef[] = [
  { code: 'crm', nombre: 'CRM (leads, Meta y Claude/MCP)', descripcion: 'Captación de leads, píxeles de Meta, formularios web y acceso MCP para Claude.' },
  { code: 'agendamiento_online', nombre: 'Agendamiento online', descripcion: 'Links públicos para que los pacientes reserven su hora.' },
  { code: 'whatsapp', nombre: 'WhatsApp (recordatorios)', descripcion: 'Confirmaciones y recordatorios de citas por WhatsApp.' },
]

// Áreas clínicas contratables (ver shared/constants/areas.ts para la semántica).
const MODULOS_AREAS: ModuloDef[] = [
  { code: 'area_dental', nombre: 'Área dental', descripcion: 'Catálogo y fichas del área dental (odontograma).' },
  { code: 'area_estetica', nombre: 'Área estética facial', descripcion: 'Catálogo y fichas del área de estética facial (mapa de zonas).' },
  { code: 'area_medico', nombre: 'Área médica', descripcion: 'Catálogo y fichas del área médica.' },
]

export const MODULOS: ModuloDef[] = [...MODULOS_BASE, ...MODULOS_AREAS]

export const MODULOS_CODES = MODULOS.map((m) => m.code)
// Default de una clínica nueva: los módulos base, SIN áreas (el área inicial la
// aporta el vertical al crearla). Mismo literal que el default del schema de
// control ("crm,agendamiento_online,whatsapp"): las clínicas existentes no cambian.
export const MODULOS_DEFAULT = MODULOS_BASE.map((m) => m.code).join(',')

export function parseModulos(csv?: string | null): string[] {
  return (csv ?? '').split(',').map((s) => s.trim()).filter((c) => MODULOS_CODES.includes(c))
}
export function tieneModulo(csvOArray: string | string[] | null | undefined, code: string): boolean {
  const arr = Array.isArray(csvOArray) ? csvOArray : parseModulos(csvOArray)
  return arr.includes(code)
}
