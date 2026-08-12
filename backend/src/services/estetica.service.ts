// Área estética facial: catálogo de zonas (equivalente del diente), estado por
// zona de cada ficha (equivalente del odontograma) y el dibujo libre (capa 2).
//
// CAPA 1 (zonas clínicas) y CAPA 2 (dibujo) conviven en el mismo lienzo pero NO
// comparten almacenamiento ni lógica: la goma borra trazos y JAMÁS zonas o
// tratamientos; un trazo nunca genera prestaciones; borrar un plan/tratamiento no
// borra trazos, y viceversa (DibujoFacial no tiene FK a plan/tratamiento).
import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { ZONAS_FACIALES_NUCLEO } from '@shared/constants/zonas-faciales'

// Catálogo CONGELADO (revisión profesional 2026-08-11): la ÚNICA fuente es
// shared/constants/zonas-faciales.ts (29 códigos). Se puede AGREGAR zonas nuevas sin
// problema; renombrar/fusionar las existentes obliga a migrar datos (el código queda
// grabado en cada tratamiento). El seed es lazy: una base ya sembrada NO se re-siembra
// (una demo vieja conserva su lista; para ver la nueva, base/demo nueva).
const ZONAS_SEED = ZONAS_FACIALES_NUCLEO.map(({ codigo, nombreClinico, nombreVisible, grupo, orden }) =>
  ({ codigo, nombreClinico, nombreVisible, grupo, orden }))

// Lista el catálogo de zonas del tenant. Auto-completa: siembra lo que FALTE del
// catálogo (por código), no solo la primera vez. Así, si el catálogo cambia (se
// agrega/renombra una zona, ej. LABIOS), las bases YA sembradas reciben las nuevas
// al abrir el mapa, sin depender de recrear la base. skipDuplicates evita choques de
// carrera contra el @unique de codigo. Las zonas viejas que ya no están en el catálogo
// quedan en la base pero el frontend no las dibuja (filtra por el catálogo).
export async function listarZonas(db: TenantClient) {
  const existentes = await db.zonaFacial.findMany({ select: { codigo: true } })
  const codigos = new Set(existentes.map((z) => z.codigo))
  const faltantes = ZONAS_SEED.filter((z) => !codigos.has(z.codigo))
  if (faltantes.length > 0) {
    // `faltantes` ya excluye lo existente; el try/catch cubre una carrera rara (otra
    // request sembrando a la vez → choque con @unique). No usamos skipDuplicates
    // porque no existe en SQLite (tests). En prod (Postgres) el catch no se activa.
    try { await db.zonaFacial.createMany({ data: faltantes }) } catch { /* ya sembradas */ }
  }
  return db.zonaFacial.findMany({ orderBy: [{ orden: 'asc' }, { codigo: 'asc' }] })
}

async function fichaDePaciente(db: TenantClient, pacienteId: string) {
  const paciente = await db.paciente.findUnique({ where: { id: pacienteId }, select: { id: true, sexo: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  let ficha = await db.fichaClinica.findUnique({ where: { pacienteId }, select: { id: true } })
  if (!ficha) ficha = await db.fichaClinica.create({ data: { pacienteId }, select: { id: true } })
  return { ficha, paciente }
}

// Estado por zona de la ficha (espejo del odontograma).
export async function zonasDeFicha(db: TenantClient, pacienteId: string) {
  const { ficha } = await fichaDePaciente(db, pacienteId)
  return db.zonaFicha.findMany({ where: { fichaId: ficha.id }, include: { zona: { select: { codigo: true, nombreClinico: true, nombreVisible: true, grupo: true } } } })
}

export async function upsertZonaFicha(db: TenantClient, body: { pacienteId: string; zonaId: string; estado?: string; color?: string | null; notas?: string | null }) {
  const zona = await db.zonaFacial.findUnique({ where: { id: body.zonaId }, select: { id: true } })
  if (!zona) throw notFound('Zona facial no encontrada')
  const { ficha } = await fichaDePaciente(db, body.pacienteId)
  const estado = (body.estado ?? 'SANO').trim().toUpperCase()
  return db.zonaFicha.upsert({
    where: { fichaId_zonaId: { fichaId: ficha.id, zonaId: body.zonaId } },
    create: { fichaId: ficha.id, zonaId: body.zonaId, estado, color: body.color ?? null, notas: body.notas ?? null },
    update: { estado, ...(body.color !== undefined ? { color: body.color } : {}), ...(body.notas !== undefined ? { notas: body.notas } : {}) },
    include: { zona: { select: { codigo: true, nombreVisible: true } } },
  })
}

// ── Dibujo libre (capa 2) ────────────────────────────────────────────────────

const HERRAMIENTAS = new Set(['lapiz', 'circulo', 'linea'])
const MAX_TRAZOS_BYTES = 512 * 1024 // vectorial y editable; nunca imagen rasterizada

interface Trazo { herramienta: string; color?: string; grosor?: number; puntos: { x: number; y: number }[] }

function validarTrazos(raw: unknown): Trazo[] {
  if (!Array.isArray(raw)) throw badRequest('trazos debe ser un arreglo de trazos vectoriales')
  for (const t of raw as Trazo[]) {
    if (!t || typeof t !== 'object' || !HERRAMIENTAS.has(t.herramienta)) throw badRequest('Trazo inválido: herramienta desconocida')
    if (!Array.isArray(t.puntos) || t.puntos.length === 0) throw badRequest('Trazo inválido: sin puntos')
    for (const p of t.puntos) {
      if (typeof p?.x !== 'number' || typeof p?.y !== 'number') throw badRequest('Trazo inválido: punto sin coordenadas')
    }
  }
  const json = JSON.stringify(raw)
  if (json.length > MAX_TRAZOS_BYTES) throw badRequest('El dibujo es demasiado grande')
  return raw as Trazo[]
}

// Devuelve el dibujo de la ficha. Sin fila: trazos vacíos y género derivado del
// sexo del paciente (el toggle de la UI persiste la elección creando la fila).
export async function obtenerDibujo(db: TenantClient, pacienteId: string) {
  const { ficha, paciente } = await fichaDePaciente(db, pacienteId)
  const row = await db.dibujoFacial.findUnique({ where: { fichaId: ficha.id } })
  if (row) return { genero: row.genero, trazos: JSON.parse(row.trazos) as Trazo[], updatedAt: row.updatedAt.toISOString() }
  const genero = (paciente.sexo ?? '').toLowerCase().startsWith('m') ? 'M' : 'F'
  return { genero, trazos: [] as Trazo[], updatedAt: null }
}

export async function guardarDibujo(db: TenantClient, pacienteId: string, body: { genero?: string; trazos?: unknown }) {
  const { ficha } = await fichaDePaciente(db, pacienteId)
  const data: Record<string, unknown> = {}
  if (body.genero !== undefined) {
    const g = String(body.genero).trim().toUpperCase()
    if (g !== 'F' && g !== 'M') throw badRequest('genero debe ser F o M')
    data.genero = g
  }
  if (body.trazos !== undefined) data.trazos = JSON.stringify(validarTrazos(body.trazos))
  const row = await db.dibujoFacial.upsert({
    where: { fichaId: ficha.id },
    create: { fichaId: ficha.id, genero: (data.genero as string) ?? 'F', trazos: (data.trazos as string) ?? '[]' },
    update: data,
  })
  return { genero: row.genero, trazos: JSON.parse(row.trazos) as Trazo[], updatedAt: row.updatedAt.toISOString() }
}
