// Compilador de la capa semántica: de una ConsultaMetricas VALIDADA contra el
// catálogo a datos reales, sobre tenantDb. No concatena SQL: trae filas acotadas
// con findMany (where = filtros implícitos + rango de fecha + filtros del usuario)
// y agrega en memoria. Así las dimensiones de tiempo (bucket en hora de la clínica)
// y el filtro sobre el valor agregado (HAVING, p.ej. "pacientes con 1 sola cita")
// se resuelven de forma uniforme y correcta en SQLite y Postgres.
import type { TenantClient } from '@/db/tenant'
import { todayYmd, addDaysYmd, weekdayOfYmd, rangoFechasUtc } from '@/lib/tz'
import { ErrorHerramienta, type Columna, type ResultadoHerramienta } from './tipos'
import { metricaPorClave, type DimensionDef, type Granularidad, type FilaCruda } from './catalogo'

const CAP_FILAS = 20_000 // tope de filas crudas a traer para agregar en memoria

export interface Filtro { campo: string; op: 'eq' | 'neq'; valor: string }
export interface Consulta {
  metrica: string
  dimensiones: string[]
  filtros: Filtro[]
  periodo: { desde: string; hasta: string }
  filtroValor?: { op: 'eq' | 'gte' | 'lte' | 'gt' | 'lt'; valor: number }
  orden: 'asc' | 'desc'
  limite: number
}

// Filtros permitidos del usuario: solo sobre dimensiones de estado/origen/profesional/box.
const TIPOS_FILTRABLES = new Set(['estado', 'origen', 'profesional', 'box'])

function bucketTiempo(fecha: Date, g: Granularidad, tz: string): string {
  const ymd = todayYmd(tz, fecha) // fecha civil del instante en la tz
  if (g === 'mes') return ymd.slice(0, 7)
  if (g === 'dia') return ymd
  // semana: lunes de esa semana (YYYY-MM-DD)
  const wd = weekdayOfYmd(ymd) // 0=domingo … 6=sábado
  return addDaysYmd(ymd, wd === 0 ? -6 : -(wd - 1))
}

export async function compilar(db: TenantClient, consulta: Consulta, tz: string): Promise<ResultadoHerramienta> {
  const metrica = metricaPorClave(consulta.metrica)
  if (!metrica) throw new ErrorHerramienta(`Métrica desconocida: "${consulta.metrica}".`)

  // Validar dimensiones y filtros contra el catálogo (mensaje corto que el modelo corrige).
  const dims: DimensionDef[] = []
  for (const clave of consulta.dimensiones) {
    const d = metrica.dimensiones.find((x) => x.clave === clave)
    if (!d) throw new ErrorHerramienta(`La dimensión "${clave}" no aplica a ${metrica.clave}. Disponibles: ${metrica.dimensiones.map((x) => x.clave).join(', ')}.`)
    dims.push(d)
  }
  for (const f of consulta.filtros) {
    const d = metrica.dimensiones.find((x) => x.clave === f.campo)
    if (!d || !TIPOS_FILTRABLES.has(d.tipo)) throw new ErrorHerramienta(`No se puede filtrar por "${f.campo}" en ${metrica.clave}.`)
  }

  // Where: filtros implícitos + rango de fecha (hora de la clínica) + filtros del usuario.
  const rango = rangoFechasUtc(consulta.periodo.desde, consulta.periodo.hasta, tz)
  const where: Record<string, unknown> = {
    ...(metrica.where ?? {}),
    [metrica.campoFecha]: { ...(rango.gte ? { gte: rango.gte } : {}), ...(rango.lte ? { lte: rango.lte } : {}) },
  }
  for (const f of consulta.filtros) {
    const d = metrica.dimensiones.find((x) => x.clave === f.campo)!
    where[d.campo] = f.op === 'neq' ? { not: f.valor } : f.valor
  }

  // Campos a traer: fecha + valor + campos de las dimensiones de agrupación.
  const select: Record<string, boolean> = { [metrica.campoFecha]: true }
  for (const c of metrica.selectValor ?? []) select[c] = true
  for (const d of dims) if (d.tipo !== 'tiempo') select[d.campo] = true

  const modelo = (db as unknown as Record<string, { findMany: (a: unknown) => Promise<FilaCruda[]> }>)[metrica.modelo]
  const filas: FilaCruda[] = await modelo.findMany({ where, select, take: CAP_FILAS })

  // Agregar en memoria por la clave compuesta de las dimensiones pedidas.
  interface Grupo { claves: Record<string, string | null>; valor: number; n: number }
  const grupos = new Map<string, Grupo>()
  for (const fila of filas) {
    const claves: Record<string, string | null> = {}
    for (const d of dims) {
      claves[d.clave] = d.tipo === 'tiempo'
        ? bucketTiempo(fila[metrica.campoFecha] as Date, d.granularidad!, tz)
        : (fila[d.campo] == null ? null : String(fila[d.campo]))
    }
    const key = dims.map((d) => claves[d.clave] ?? '∅').join('∥')
    const g = grupos.get(key) ?? { claves, valor: 0, n: 0 }
    g.n += 1
    g.valor += metrica.agregacion === 'count' ? 1 : (metrica.valor ? metrica.valor(fila) : 0)
    grupos.set(key, g)
  }

  let lista = [...grupos.values()].map((g) => ({
    claves: g.claves,
    valor: metrica.agregacion === 'avg' ? (g.n ? Math.round(g.valor / g.n) : 0) : g.valor,
  }))

  // HAVING sobre el valor agregado (p.ej. "pacientes con exactamente 1 cita").
  if (consulta.filtroValor) {
    const { op, valor } = consulta.filtroValor
    lista = lista.filter((r) => op === 'eq' ? r.valor === valor : op === 'gte' ? r.valor >= valor : op === 'lte' ? r.valor <= valor : op === 'gt' ? r.valor > valor : r.valor < valor)
  }

  lista.sort((a, b) => consulta.orden === 'asc' ? a.valor - b.valor : b.valor - a.valor)
  const totalGrupos = lista.length
  lista = lista.slice(0, Math.min(consulta.limite, 500))

  // Resolver etiquetas de dimensiones de identidad por nombre (profesional, box,
  // medio de pago, prestación). Paciente queda como id (el marco lo tokeniza).
  const resolvers = await construirResolvers(db, dims, lista.map((r) => r.claves))

  const columnas: Columna[] = [
    ...dims.map((d): Columna => ({ clave: d.clave, etiqueta: etiquetaDim(d), tipo: d.tipo === 'paciente' ? 'paciente' : 'texto' })),
    { clave: 'valor', etiqueta: metrica.etiquetaValor, tipo: metrica.tipoValor === 'dinero' ? 'dinero' : 'entero' },
  ]
  const filasOut = lista.map((r) => {
    const fila: Record<string, unknown> = {}
    for (const d of dims) {
      const raw = r.claves[d.clave]
      fila[d.clave] = d.tipo === 'paciente' ? raw : etiquetarCelda(d, raw, resolvers)
    }
    fila.valor = r.valor
    return fila
  })

  const totalGeneral = metrica.agregacion === 'count'
    ? filas.length
    : (metrica.agregacion === 'sum' ? lista.reduce((s, r) => s + r.valor, 0) : undefined)

  return {
    columnas,
    filas: filasOut,
    totalFilas: totalGrupos,
    resumen: {
      metrica: metrica.clave,
      ...(totalGeneral != null ? { total: totalGeneral } : {}),
      ...(filas.length >= CAP_FILAS ? { aviso: `datos acotados a ${CAP_FILAS} registros` } : {}),
    },
  }
}

function etiquetaDim(d: DimensionDef): string {
  const base: Record<string, string> = { profesional: 'Profesional', box: 'Box', medioPago: 'Medio de pago', estado: 'Estado', origen: 'Origen', prestacion: 'Prestación', paciente: 'Paciente' }
  if (d.tipo === 'tiempo') return d.granularidad === 'mes' ? 'Mes' : d.granularidad === 'semana' ? 'Semana' : 'Día'
  return base[d.tipo] ?? d.clave
}

interface Resolvers { profesional: Map<string, string>; box: Map<string, string>; medioPago: Map<string, string>; prestacion: Map<string, string> }

async function construirResolvers(db: TenantClient, dims: DimensionDef[], clavesLista: Record<string, string | null>[]): Promise<Resolvers> {
  const r: Resolvers = { profesional: new Map(), box: new Map(), medioPago: new Map(), prestacion: new Map() }
  const idsDe = (tipo: string) => {
    const dim = dims.find((d) => d.tipo === tipo)
    if (!dim) return []
    const set = new Set<string>()
    for (const c of clavesLista) { const v = c[dim.clave]; if (v) set.add(v) }
    return [...set]
  }
  const prof = idsDe('profesional'); const box = idsDe('box'); const mp = idsDe('medioPago'); const pr = idsDe('prestacion')
  const [us, bx, mps, prs] = await Promise.all([
    prof.length ? db.user.findMany({ where: { id: { in: prof } }, select: { id: true, name: true } }) : Promise.resolve([]),
    box.length ? db.box.findMany({ where: { id: { in: box } }, select: { id: true, nombre: true } }) : Promise.resolve([]),
    mp.length ? db.medioPago.findMany({ where: { id: { in: mp } }, select: { id: true, nombre: true } }) : Promise.resolve([]),
    pr.length ? db.prestacion.findMany({ where: { id: { in: pr } }, select: { id: true, nombre: true } }) : Promise.resolve([]),
  ])
  for (const u of us) r.profesional.set(u.id, u.name ?? 'Profesional')
  for (const b of bx) r.box.set(b.id, b.nombre)
  for (const m of mps) r.medioPago.set(m.id, m.nombre)
  for (const p of prs) r.prestacion.set(p.id, p.nombre)
  return r
}

function etiquetarCelda(d: DimensionDef, raw: string | null, r: Resolvers): string {
  if (raw == null) return d.tipo === 'profesional' ? 'Sin profesional' : d.tipo === 'box' ? 'Sin box' : d.tipo === 'medioPago' ? 'Sin medio' : '—'
  switch (d.tipo) {
    case 'profesional': return r.profesional.get(raw) ?? 'Profesional'
    case 'box': return r.box.get(raw) ?? 'Box'
    case 'medioPago': return r.medioPago.get(raw) ?? raw
    case 'prestacion': return r.prestacion.get(raw) ?? 'Prestación'
    default: return raw // estado, origen, tiempo
  }
}
