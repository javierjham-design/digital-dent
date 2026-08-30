import * as XLSX from 'xlsx'
import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { buildXlsx, formatRUT, isoDate } from '@/lib/excel'
import { audit } from '@/lib/audit'
import { siguienteNumero } from '@/lib/correlativo'
import { validarDoc, formatDoc, getPais } from '@shared/constants/paises'
import { emitirEventoPaciente } from '@/lib/tubot-webhooks'
import type { PacienteDTO, PacientesPagina, PacientesRecallPagina } from '@shared/types'

// Database-per-tenant: cada función recibe el cliente de la base de la clínica
// (req.tenant). Ya no hay clinicaId — la base ES la clínica.

// País de operación de la clínica (define la validación del documento).
async function paisDe(db: TenantClient): Promise<string> {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { pais: true } })
  return c?.pais ?? 'CL'
}

// Valida y normaliza el documento según el país. Chile valida el RUT (dígito
// verificador) y lo formatea; los demás países usan validación flexible.
function normalizarDoc(pais: string, doc: unknown): string | null {
  const v = typeof doc === 'string' ? doc.trim() : ''
  if (!v) return null
  if (!validarDoc(pais, v)) throw badRequest(`${getPais(pais).doc.label} inválido. Revisa el formato, o marca "Otro documento".`)
  return formatDoc(pais, v)
}

function toDTO(p: {
  id: string; numero: number | null; rut: string | null; nombre: string; apellido: string
  telefono: string | null; email: string | null; prevision: string | null
  fechaNacimiento: Date | null; activo: boolean
  otroDocId?: string | null; nombreSocial?: string | null; sexo?: string | null; direccion?: string | null
  actividad?: string | null; apoderado?: string | null; rutApoderado?: string | null
  contactoEmergencia?: string | null; telefonoEmergencia?: string | null; observaciones?: string | null
}): PacienteDTO {
  return {
    id: p.id, numero: p.numero, rut: p.rut, otroDocId: p.otroDocId ?? null,
    nombre: p.nombre, apellido: p.apellido, nombreSocial: p.nombreSocial ?? null,
    telefono: p.telefono, email: p.email, prevision: p.prevision,
    fechaNacimiento: p.fechaNacimiento?.toISOString() ?? null,
    sexo: p.sexo ?? null, direccion: p.direccion ?? null,
    actividad: p.actividad ?? null, apoderado: p.apoderado ?? null, rutApoderado: p.rutApoderado ?? null,
    contactoEmergencia: p.contactoEmergencia ?? null, telefonoEmergencia: p.telefonoEmergencia ?? null,
    observaciones: p.observaciones ?? null,
    activo: p.activo,
  }
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Sólo los caracteres significativos de un RUT/documento: dígitos y el DV "k".
// Permite buscar por RUT sin puntos ni guión (ej. "12345678" encuentra "12.345.678-9").
const soloRut = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^0-9k]/g, '')

// ¿El paciente coincide con la búsqueda? Por nombre+apellido (insensible a
// acentos/mayúsculas) o por RUT. El RUT se compara sin puntos ni guión cuando la
// búsqueda trae dígitos, para no exigir el formato completo.
const coincide = (p: { nombre: string; apellido: string; rut: string | null }, needle: string, rutDigits: string) => {
  if (norm(`${p.nombre} ${p.apellido}`).includes(needle)) return true
  if (rutDigits.length >= 2) return soloRut(p.rut).includes(rutDigits)
  return (p.rut ?? '').toLowerCase().includes(needle)
}

// Solo los campos que necesita la lista (aligera el payload con miles de pacientes).
const LIST_SELECT = {
  id: true, numero: true, rut: true, nombre: true, apellido: true,
  telefono: true, email: true, prevision: true, fechaNacimiento: true, activo: true,
} as const

// Tope de resultados para no reventar el render (la búsqueda acota lo suficiente).
const LIST_LIMIT = 500

export async function listarPacientes(db: TenantClient, q?: string): Promise<PacienteDTO[]> {
  const needle = q && q.trim().length >= 2 ? norm(q.trim()) : null

  // Con búsqueda: recorremos TODOS los activos y filtramos insensible a acentos/
  // mayúsculas. (Antes filtraba sobre un tope de 500 → no encontraba apellidos
  // alfabéticamente posteriores.) A esta escala (miles) es instantáneo.
  if (needle) {
    const rutDigits = soloRut(q)
    const todos = await db.paciente.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: LIST_SELECT })
    return todos
      .filter((p) => coincide(p, needle, rutDigits))
      .slice(0, LIST_LIMIT)
      .map(toDTO)
  }

  // Sin búsqueda: listado base acotado (para navegar; el buscador encuentra el resto).
  const pacientes = await db.paciente.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, take: LIST_LIMIT, select: LIST_SELECT })
  return pacientes.map(toDTO)
}

const PAGE_SIZES = [25, 50, 100]

// Listado PAGINADO para la sección /pacientes. Devuelve la página pedida + el total
// (para construir el paginador). La búsqueda filtra sobre TODOS los activos.
export async function listarPacientesPaginado(
  db: TenantClient,
  opts: { q?: string; page?: number; pageSize?: number; inactivos?: boolean },
): Promise<PacientesPagina> {
  const pageSize = PAGE_SIZES.includes(Number(opts.pageSize)) ? Number(opts.pageSize) : 25
  const page = Math.max(1, Number(opts.page) || 1)
  const needle = opts.q && opts.q.trim().length >= 2 ? norm(opts.q.trim()) : null
  // Por defecto solo activos; con inactivos=true, solo los dados de baja (para reactivarlos).
  const activoFiltro = opts.inactivos ? false : true

  if (needle) {
    // Búsqueda: traemos todos (del estado pedido), filtramos (insensible a acentos/
    // mayúsculas) y paginamos en memoria. A esta escala (miles) es instantáneo.
    const rutDigits = soloRut(opts.q)
    const todos = await db.paciente.findMany({ where: { activo: activoFiltro }, orderBy: { nombre: 'asc' }, select: LIST_SELECT })
    const filtrados = todos.filter((p) => coincide(p, needle, rutDigits))
    const start = (page - 1) * pageSize
    return { items: filtrados.slice(start, start + pageSize).map(toDTO), total: filtrados.length, page, pageSize }
  }

  // Sin búsqueda: paginación en la base (count + skip/take).
  const [total, pacientes] = await Promise.all([
    db.paciente.count({ where: { activo: activoFiltro } }),
    db.paciente.findMany({
      where: { activo: activoFiltro }, orderBy: { nombre: 'asc' },
      skip: (page - 1) * pageSize, take: pageSize, select: LIST_SELECT,
    }),
  ])
  return { items: pacientes.map(toDTO), total, page, pageSize }
}

// Pacientes con citas PASADAS (asistieron o tuvieron hora) pero SIN próxima cita
// agendada, para gestionarlos (recall / reactivación). Una cita cancelada no
// cuenta ni como pasada ni como futura. Ordena por última cita (más reciente primero).
export async function pacientesSinProximaCita(
  db: TenantClient,
  opts: { q?: string; page?: number; pageSize?: number },
): Promise<PacientesRecallPagina> {
  const pageSize = PAGE_SIZES.includes(Number(opts.pageSize)) ? Number(opts.pageSize) : 25
  const page = Math.max(1, Number(opts.page) || 1)
  const now = new Date()
  const NO_CUENTA = ['CANCELADA']

  // Pacientes con alguna cita FUTURA activa → se excluyen (ya tienen próxima hora).
  const futuras = await db.cita.findMany({
    where: { fecha: { gte: now }, estado: { notIn: NO_CUENTA } },
    select: { pacienteId: true }, distinct: ['pacienteId'],
  })
  const conFutura = new Set(futuras.map((c) => c.pacienteId))

  // Pacientes con citas PASADAS (no canceladas): última cita + conteo.
  const pasadas = await db.cita.groupBy({
    by: ['pacienteId'],
    where: { fecha: { lt: now }, estado: { notIn: NO_CUENTA } },
    _max: { fecha: true }, _count: { _all: true },
  })
  // Quiénes asistieron alguna vez (al menos una cita ATENDIDA en el pasado).
  const atendidas = await db.cita.findMany({
    where: { fecha: { lt: now }, estado: 'ATENDIDA' },
    select: { pacienteId: true }, distinct: ['pacienteId'],
  })
  const asistieron = new Set(atendidas.map((c) => c.pacienteId))

  const candidatos = pasadas.filter((p) => !conFutura.has(p.pacienteId))
  if (candidatos.length === 0) return { items: [], total: 0, page, pageSize }

  const pacientes = await db.paciente.findMany({
    where: { id: { in: candidatos.map((p) => p.pacienteId) }, activo: true }, select: LIST_SELECT,
  })
  const mapPac = new Map(pacientes.map((p) => [p.id, p]))

  let items = candidatos
    .filter((p) => mapPac.has(p.pacienteId))
    .map((p) => ({ pac: mapPac.get(p.pacienteId)!, ultimaCita: p._max.fecha ?? now, totalCitas: p._count._all, asistio: asistieron.has(p.pacienteId) }))

  if (opts.q && opts.q.trim().length >= 2) {
    const needle = norm(opts.q.trim())
    const rutDigits = soloRut(opts.q)
    items = items.filter((it) => coincide(it.pac, needle, rutDigits))
  }

  items.sort((a, b) => +new Date(b.ultimaCita) - +new Date(a.ultimaCita))

  const total = items.length
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize).map((it) => ({
      paciente: toDTO(it.pac), ultimaCita: new Date(it.ultimaCita).toISOString(), totalCitas: it.totalCitas, asistio: it.asistio,
    })),
    total, page, pageSize,
  }
}

export async function obtenerPaciente(db: TenantClient, id: string): Promise<PacienteDTO> {
  const p = await db.paciente.findUnique({ where: { id } })
  if (!p) throw notFound('Paciente no encontrado')
  return toDTO(p)
}

// Registro legal de accesos a la ficha (queda en el Historial del paciente).
// Best-effort y con throttle: no duplica si el mismo usuario accedió en el último
// minuto (evita registrar cada re-carga de la página como una visita distinta).
export async function registrarAccesoFicha(db: TenantClient, actorId: string, pacienteId: string): Promise<void> {
  try {
    const desde = new Date(Date.now() - 60_000)
    const reciente = await db.auditLog.findFirst({
      where: { pacienteId, userId: actorId, accion: 'ACCESO', fecha: { gte: desde } },
      select: { id: true },
    })
    if (reciente) return
    await audit(db, actorId, { accion: 'ACCESO', entidad: 'FichaClinica', pacienteId, resumen: 'Accedió a la ficha del paciente' })
  } catch { /* best-effort: nunca rompe la carga de la ficha */ }
}

export interface CrearPacienteInput {
  nombre: string; apellido: string; rut?: string | null; otroDocId?: string | null
  telefono?: string | null; email?: string | null; prevision?: string | null
}

export async function crearPaciente(db: TenantClient, input: CrearPacienteInput): Promise<PacienteDTO> {
  if (!input.nombre?.trim() || !input.apellido?.trim()) throw badRequest('Nombre y apellido son obligatorios')
  const rut = normalizarDoc(await paisDe(db), input.rut)
  if (rut) {
    const dup = await db.paciente.findFirst({ where: { rut }, select: { id: true } })
    if (dup) throw badRequest('Ya existe un paciente con ese RUT en la clínica')
  }
  // La ficha clínica se numera desde 1000 (correlativo). El número se genera dentro
  // de la transacción (advisory lock) para que dos altas simultáneas no choquen con
  // el @unique de Paciente.numero.
  const p = await db.$transaction(async (tx) => {
    const numero = await siguienteNumero(tx, 'paciente')
    return tx.paciente.create({
      data: {
        numero,
        nombre: input.nombre.trim(),
        apellido: input.apellido.trim(),
        rut,
        otroDocId: typeof input.otroDocId === 'string' && input.otroDocId.trim() ? input.otroDocId.trim() : null,
        telefono: input.telefono || null,
        email: input.email || null,
        prevision: input.prevision || null,
        activo: true,
      },
    })
  })
  // Reconstruye el vínculo con el embudo del CRM: si esta ficha coincide (teléfono/RUT) con un
  // único lead sin vincular, se asocia solo; si hay varios, queda para el aviso de la ficha.
  // Best-effort (el helper no lanza): no bloquea el alta del paciente. Import dinámico por ciclo.
  const { autolinkLeadAlCrearPaciente } = await import('@/services/crm.service')
  await autolinkLeadAlCrearPaciente(db, { id: p.id, telefono: p.telefono, rut: p.rut })
  return toDTO(p)
}

const PACIENTE_FIELDS = [
  'rut', 'otroDocId', 'nombre', 'apellido', 'nombreSocial', 'fechaNacimiento', 'genero', 'sexo',
  'nacionalidad', 'migrante', 'puebloOriginario', 'telefono', 'telefonoFijo', 'email', 'direccion',
  'ciudad', 'comuna', 'prevision', 'actividad', 'empleador', 'apoderado', 'rutApoderado', 'referencia',
  'tipoPaciente', 'numeroInterno', 'alergias', 'antecedentes', 'observaciones',
  'contactoEmergencia', 'telefonoEmergencia', 'activo',
]

export async function actualizarPaciente(db: TenantClient, id: string, body: Record<string, unknown>): Promise<PacienteDTO> {
  const existe = await db.paciente.findUnique({ where: { id }, select: { id: true } })
  if (!existe) throw notFound('Paciente no encontrado')
  const pais = ('rut' in body) ? await paisDe(db) : 'CL'
  const data: Record<string, unknown> = {}
  for (const k of PACIENTE_FIELDS) {
    if (!(k in body)) continue
    const v = body[k]
    if (k === 'fechaNacimiento') data[k] = v ? new Date(String(v)) : null
    else if (k === 'rut') data[k] = normalizarDoc(pais, v) // valida según el país y normaliza
    else if (k === 'activo') data[k] = Boolean(v)
    else if (typeof v === 'string') data[k] = v.trim() || null
    else data[k] = v
  }
  // Si se asigna un RUT distinto, evitar duplicados con otro paciente.
  if (typeof data.rut === 'string') {
    const dup = await db.paciente.findFirst({ where: { rut: data.rut, NOT: { id } }, select: { id: true } })
    if (dup) throw badRequest('Ya existe otro paciente con ese RUT en la clínica')
  }
  const p = await db.paciente.update({ where: { id }, data })
  void emitirEventoPaciente(db, p.id)
  return toDTO(p)
}

// Ficha clínica (flags + odontograma).
export async function obtenerFicha(db: TenantClient, pacienteId: string) {
  const paciente = await db.paciente.findUnique({ where: { id: pacienteId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  const ficha = await db.fichaClinica.findUnique({
    where: { pacienteId },
    include: { odontograma: { select: { numero: true, cara: true, estado: true } } },
  })
  if (!ficha) return { ficha: null, odontograma: [] }
  const { odontograma, ...flags } = ficha
  return { ficha: flags, odontograma }
}

const FICHA_FLAGS = ['grupoSanguineo', 'fumador', 'embarazada', 'diabetico', 'hipertenso', 'cardiopatia', 'anticoagulantes', 'medicamentos', 'notasClinicas', 'alertasMedicas', 'enfermedadesNotas', 'motivoAtencion', 'impresionMedica', 'resumenDiagnostico']

export async function guardarFicha(db: TenantClient, pacienteId: string, body: Record<string, unknown>) {
  const paciente = await db.paciente.findUnique({ where: { id: pacienteId }, select: { id: true } })
  if (!paciente) throw notFound('Paciente no encontrado')
  const data: Record<string, unknown> = {}
  for (const k of FICHA_FLAGS) {
    if (!(k in body)) continue
    const v = body[k]
    if (['fumador', 'embarazada', 'diabetico', 'hipertenso', 'cardiopatia', 'anticoagulantes'].includes(k)) data[k] = Boolean(v)
    else data[k] = v ? String(v) : null
  }
  return db.fichaClinica.upsert({ where: { pacienteId }, update: data, create: { pacienteId, ...data } })
}

async function assertPaciente(db: TenantClient, pacienteId: string) {
  const p = await db.paciente.findUnique({ where: { id: pacienteId }, select: { id: true } })
  if (!p) throw notFound('Paciente no encontrado')
}

// ── Comentarios administrativos ───────────────────────────────────────────────
export async function listarComentarios(db: TenantClient, pacienteId: string) {
  await assertPaciente(db, pacienteId)
  return db.comentarioAdministrativo.findMany({ where: { pacienteId }, orderBy: { createdAt: 'desc' } })
}

export async function crearComentario(db: TenantClient, pacienteId: string, autor: { id: string; nombre: string }, texto: string) {
  await assertPaciente(db, pacienteId)
  if (!texto?.trim()) throw badRequest('Texto requerido')
  return db.comentarioAdministrativo.create({
    data: { pacienteId, autorNombre: autor.nombre, autorId: autor.id, texto: texto.trim() },
  })
}

// ── Mensajes (historial de comunicaciones) ────────────────────────────────────
export async function listarMensajes(db: TenantClient, pacienteId: string) {
  await assertPaciente(db, pacienteId)
  return db.mensajePaciente.findMany({ where: { pacienteId }, orderBy: { createdAt: 'desc' }, take: 200 })
}

export async function crearMensaje(db: TenantClient, pacienteId: string, body: Record<string, unknown>) {
  await assertPaciente(db, pacienteId)
  if (!body.tipo || !body.categoria) throw badRequest('tipo y categoria son requeridos')
  return db.mensajePaciente.create({
    data: {
      pacienteId, citaId: body.citaId ? String(body.citaId) : null,
      tipo: String(body.tipo), categoria: String(body.categoria),
      asunto: body.asunto ? String(body.asunto) : null, cuerpo: body.cuerpo ? String(body.cuerpo) : null,
      enviadoA: body.enviadoA ? String(body.enviadoA) : null, estado: body.estado ? String(body.estado) : 'ENVIADO',
    },
  })
}

// ── Resumen de KPIs del paciente ───────────────────────────────────────────────
export async function resumenPaciente(db: TenantClient, id: string) {
  const paciente = await db.paciente.findUnique({
    where: { id },
    include: {
      fichaClinica: { select: { tratamientos: { select: { estado: true, precio: true } } } },
      cobros: { select: { monto: true, estado: true } },
      presupuestos: { select: { estado: true, vigencia: true } },
    },
  })
  if (!paciente) throw notFound('Paciente no encontrado')
  const tratamientos = paciente.fichaClinica?.tratamientos ?? []
  const activos = tratamientos.filter((t) => t.estado === 'PLANIFICADO' || t.estado === 'EN_PROGRESO').length
  const finalizados = tratamientos.filter((t) => t.estado === 'COMPLETADO').length
  const expirados = paciente.presupuestos.filter((p) => p.vigencia && new Date(p.vigencia) < new Date() && p.estado !== 'APROBADO').length
  const realizado = tratamientos.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + t.precio, 0)
  const abonado = paciente.cobros.filter((c) => c.estado === 'PAGADO').reduce((s, c) => s + c.monto, 0)
  return { tratamientosCount: tratamientos.length, activos, finalizados, expirados, realizado, abonado, saldo: Math.max(realizado - abonado, 0) }
}

// ── Export / Template / Import (XLSX) ──────────────────────────────────────────
export async function exportarPacientes(db: TenantClient): Promise<Buffer> {
  const pacientes = await db.paciente.findMany({ orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }] })
  return buildXlsx(pacientes, [
    { header: 'Nombres', width: 18, value: (p) => p.nombre },
    { header: 'Apellidos', width: 22, value: (p) => p.apellido },
    { header: 'Telefono', width: 18, value: (p) => p.telefono ?? '' },
    { header: 'Dirección', width: 32, value: (p) => p.direccion ?? '' },
    { header: 'Correo Electrónico', width: 28, value: (p) => p.email ?? '' },
    { header: 'RUT', width: 14, value: (p) => formatRUT(p.rut) },
    { header: 'Fecha de Nacimiento', width: 20, value: (p) => isoDate(p.fechaNacimiento) },
    { header: 'Previsión', width: 14, value: (p) => p.prevision ?? '' },
    { header: 'Género', width: 12, value: (p) => p.genero ?? '' },
    { header: 'Activo', width: 8, value: (p) => (p.activo ? 'Sí' : 'No') },
    { header: 'Creado', width: 12, value: (p) => isoDate(p.createdAt) },
  ], 'Pacientes')
}

export function plantillaPacientes(): Buffer {
  const ejemplo = [{
    nombre: 'Juan', apellido: 'Pérez González', telefono: '+56 9 1234 5678',
    direccion: 'Av. Alemania 123, Temuco', email: 'juan.perez@example.cl', rut: '12.345.678-9', nacimiento: '1990-05-15',
  }]
  return buildXlsx(ejemplo, [
    { header: 'Nombres', width: 18, value: (r) => r.nombre },
    { header: 'Apellidos', width: 22, value: (r) => r.apellido },
    { header: 'Telefono', width: 18, value: (r) => r.telefono },
    { header: 'Dirección', width: 32, value: (r) => r.direccion },
    { header: 'Correo Electrónico', width: 28, value: (r) => r.email },
    { header: 'RUT', width: 14, value: (r) => r.rut },
    { header: 'Fecha de Nacimiento', width: 20, value: (r) => r.nacimiento },
  ], 'Pacientes')
}

type Row = Record<string, unknown>
function pickString(row: Row, keys: string[]): string {
  for (const k of keys) { const v = row[k]; if (v == null) continue; const s = String(v).trim(); if (s) return s }
  return ''
}
function normalizeRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return ''
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`
}
function parseFecha(raw: unknown): Date | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const p = XLSX.SSF.parse_date_code(raw)
    if (p) return new Date(Date.UTC(p.y, p.m - 1, p.d))
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) return new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()))
  const s = String(raw).trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
  if (dmy) { let y = +dmy[3]; if (y < 100) y += y < 50 ? 2000 : 1900; return new Date(Date.UTC(y, +dmy[2] - 1, +dmy[1])) }
  const fb = new Date(s)
  return isNaN(fb.getTime()) ? null : fb
}

export async function importarPacientes(db: TenantClient, fileBuffer: Buffer) {
  let rows: Row[]
  try {
    const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true })
    const sheetName = wb.SheetNames[0]
    if (!sheetName) throw new Error('Archivo sin hojas')
    rows = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { defval: '', raw: true })
  } catch (e) {
    throw badRequest(`No se pudo leer el archivo: ${e instanceof Error ? e.message : e}`)
  }

  const errores: { fila: number; motivo: string }[] = []
  const validos: { rut: string | null; nombre: string; apellido: string; telefono: string | null; email: string | null; direccion: string | null; fechaNacimiento: Date | null }[] = []
  const rutsEnArchivo = new Set<string>()

  rows.forEach((row, idx) => {
    const fila = idx + 2
    const nombre = pickString(row, ['Nombres', 'Nombre', 'nombre', 'nombres'])
    const apellido = pickString(row, ['Apellidos', 'Apellido', 'apellido', 'apellidos'])
    const rutRaw = pickString(row, ['RUT', 'Rut', 'rut'])
    const telefono = pickString(row, ['Telefono', 'Teléfono', 'telefono', 'teléfono'])
    const direccion = pickString(row, ['Dirección', 'Direccion', 'direccion', 'dirección'])
    const email = pickString(row, ['Correo Electrónico', 'Correo Electronico', 'Email', 'Correo', 'email', 'correo'])
    const fechaRaw = row['Fecha de Nacimiento'] ?? row['Fecha Nacimiento'] ?? row['fecha de nacimiento'] ?? row['fechaNacimiento']

    if (!nombre && !apellido && !rutRaw && !telefono && !email) return
    if (!nombre) { errores.push({ fila, motivo: 'Falta Nombres' }); return }
    if (!apellido) { errores.push({ fila, motivo: 'Falta Apellidos' }); return }

    let rut: string | null = null
    if (rutRaw) {
      const norm = normalizeRut(rutRaw)
      if (!norm) { errores.push({ fila, motivo: `RUT inválido: ${rutRaw}` }); return }
      if (rutsEnArchivo.has(norm)) { errores.push({ fila, motivo: `RUT duplicado en el archivo: ${norm}` }); return }
      rutsEnArchivo.add(norm)
      rut = norm
    }
    validos.push({ rut, nombre, apellido, telefono: telefono || null, email: email || null, direccion: direccion || null, fechaNacimiento: parseFecha(fechaRaw) })
  })

  let duplicadosEnDB = 0
  const rutsConsulta = validos.map((v) => v.rut).filter((r): r is string => r !== null)
  if (rutsConsulta.length > 0) {
    const existentes = await db.paciente.findMany({ where: { rut: { in: rutsConsulta } }, select: { rut: true } })
    const setExistentes = new Set(existentes.map((e) => e.rut).filter((r): r is string => r !== null))
    if (setExistentes.size > 0) {
      const filtrados = validos.filter((v) => { if (v.rut && setExistentes.has(v.rut)) { duplicadosEnDB++; return false } return true })
      validos.length = 0
      validos.push(...filtrados)
    }
  }

  let creados = 0
  if (validos.length > 0) {
    const result = await db.paciente.createMany({ data: validos, skipDuplicates: true })
    creados = result.count
  }
  return { total: rows.length, creados, duplicados: duplicadosEnDB, sinRut: validos.filter((v) => v.rut === null).length, errores }
}
