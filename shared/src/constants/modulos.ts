// Módulos "asignables" por clínica desde el super-admin (entitlements). Los
// demás módulos (agenda, pacientes, cobros, presupuestos, prestaciones,
// liquidaciones, consentimientos, documentos…) son base y están siempre activos.

export interface ModuloDef { code: string; nombre: string; descripcion: string }

export const MODULOS: ModuloDef[] = [
  { code: 'crm', nombre: 'CRM (leads, Meta y Claude/MCP)', descripcion: 'Captación de leads, píxeles de Meta, formularios web y acceso MCP para Claude.' },
  { code: 'agendamiento_online', nombre: 'Agendamiento online', descripcion: 'Links públicos para que los pacientes reserven su hora.' },
  { code: 'whatsapp', nombre: 'WhatsApp (recordatorios)', descripcion: 'Confirmaciones y recordatorios de citas por WhatsApp.' },
]

export const MODULOS_CODES = MODULOS.map((m) => m.code)
// Por defecto TODOS activos (preserva el comportamiento actual de las clínicas).
export const MODULOS_DEFAULT = MODULOS_CODES.join(',')

export function parseModulos(csv?: string | null): string[] {
  return (csv ?? '').split(',').map((s) => s.trim()).filter((c) => MODULOS_CODES.includes(c))
}
export function tieneModulo(csvOArray: string | string[] | null | undefined, code: string): boolean {
  const arr = Array.isArray(csvOArray) ? csvOArray : parseModulos(csvOArray)
  return arr.includes(code)
}
