// Título profesional (para mostrar delante del nombre en toda la plataforma).
export const TITULOS_PROFESIONAL = ['', 'Dr.', 'Dra.', 'Prof.'] as const

export function normalizarTitulo(v: unknown): string {
  return typeof v === 'string' && (TITULOS_PROFESIONAL as readonly string[]).includes(v) ? v : ''
}

// Devuelve el nombre con su título delante (ej. "Dra. Ana Pérez"). Si no hay
// título, devuelve el nombre tal cual.
export function conTitulo(titulo?: string | null, nombre?: string | null): string {
  const t = (titulo ?? '').trim()
  const n = (nombre ?? '').trim()
  return t && n ? `${t} ${n}` : n
}
