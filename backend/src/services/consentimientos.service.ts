import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { audit } from '@/lib/audit'
import { actorName, type JwtPayload } from '@/services/auth.service'
import { getPais } from '@shared/constants/paises'
import { CONSENTIMIENTOS_DEFAULT } from '@/data/consentimientos-default'
import { DOCUMENTOS_DEFAULT } from '@/data/documentos-clinicos-default'

// ── Utilidades ────────────────────────────────────────────────────────────────
const TZ = 'America/Santiago'
const fmtFecha = (d?: Date | null) => (d ? d.toLocaleDateString('es-CL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) : '')
const fmtFechaHora = (d: Date) => d.toLocaleString('es-CL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
const esc = (s: string) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function edadTexto(fn?: Date | null): string {
  if (!fn) return ''
  const now = new Date()
  let e = now.getFullYear() - fn.getFullYear()
  const m = now.getMonth() - fn.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < fn.getDate())) e--
  return `${e} años`
}

// Datos del paciente que necesita el motor de variables.
type PacienteVars = {
  id: string; numero: number | null; nombre: string; apellido: string; rut: string | null; otroDocId: string | null
  fechaNacimiento: Date | null; telefono: string | null; email: string | null; direccion: string | null
  apoderado: string | null; rutApoderado: string | null; sexo: string | null
}
const PAC_SELECT = {
  id: true, numero: true, nombre: true, apellido: true, rut: true, otroDocId: true, fechaNacimiento: true,
  telefono: true, email: true, direccion: true, apoderado: true, rutApoderado: true, sexo: true,
} as const

// Slots de firma (se rellenan al firmar). Se mantienen como spans con clase.
const FIRMA_SLOTS: Record<string, string> = {
  FIRMA_PACIENTE_O_REPRESENTANTE: '<span class="cl-firma-box" data-slot="paciente"></span>',
  FIRMA_PROFESIONAL: '<span class="cl-firma-box" data-slot="profesional"></span>',
  FIRMA_INTERPRETE_APOYO: '<span class="cl-firma-box" data-slot="interprete"></span>',
  FECHA_HORA_FIRMA_PACIENTE: '<span class="cl-fechafirma" data-slot="paciente"></span>',
  FECHA_HORA_FIRMA_PROFESIONAL: '<span class="cl-fechafirma" data-slot="profesional"></span>',
}
const BLANK = '<span class="cl-blank"></span>'

// Nombres de variables auto-completadas (para distinguir de las manuales).
const AUTO_KEYS = new Set([
  'PACIENTE_NOMBRE_COMPLETO', 'PACIENTE_RUT', 'PACIENTE_FECHA_NACIMIENTO', 'PACIENTE_EDAD', 'PACIENTE_SEXO',
  'PACIENTE_DIRECCION', 'PACIENTE_TELEFONO_CORREO', 'FICHA_CLINICA_N', 'REPRESENTANTE_NOMBRE',
  'REPRESENTANTE_RUT_VINCULO', 'FECHA_HORA', 'PROFESIONAL_NOMBRE', 'PROFESIONAL_RUT_REGISTRO',
  'NOMBRE_FIRMA_PACIENTE_O_REPRESENTANTE', 'RUT_FIRMA_PACIENTE_O_REPRESENTANTE',
])
// Variables que NO se ofrecen como input (metadata de firma electrónica / intérprete).
const NO_INPUT = new Set([
  'PLATAFORMA_FIRMA', 'ID_TRANSACCION', 'METODO_AUTENTICACION', 'SELLO_TIEMPO',
  'FIRMA_INTERPRETE_APOYO', 'NOMBRE_INTERPRETE_APOYO', 'RUT_INTERPRETE_APOYO', 'IDIOMA_O_TIPO_APOYO',
])
const humaniza = (name: string) => { const s = name.toLowerCase().replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1) }

// Variables manuales (clínicas) de una plantilla → se llenan en pantalla al generar.
export function variablesManuales(html: string): { name: string; label: string }[] {
  const vistos = new Set<string>()
  const res: { name: string; label: string }[] = []
  const re = /\{\{([A-Z0-9_]+)\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const name = m[1]
    if (vistos.has(name)) continue
    vistos.add(name)
    if (AUTO_KEYS.has(name) || name in FIRMA_SLOTS || NO_INPUT.has(name)) continue
    res.push({ name, label: humaniza(name) })
  }
  return res
}

// Etiquetas de campos requeridos (para el aviso de datos faltantes).
const CAMPO_LABEL: Record<string, string> = {
  nombre: 'nombre y apellido', fechaNacimiento: 'fecha de nacimiento', telefono: 'teléfono',
  email: 'email', direccion: 'dirección', apoderado: 'representante / apoderado', sexo: 'sexo',
}

function autoVars(p: PacienteVars, prof: { nombre: string; rut: string }): Record<string, string> {
  const nombre = `${p.nombre} ${p.apellido}`.trim()
  const doc = p.rut || p.otroDocId || ''
  const firmaNombre = p.apoderado || nombre
  const firmaDoc = p.apoderado ? (p.rutApoderado || '') : doc
  return {
    PACIENTE_NOMBRE_COMPLETO: nombre,
    PACIENTE_RUT: doc,
    PACIENTE_FECHA_NACIMIENTO: fmtFecha(p.fechaNacimiento),
    PACIENTE_EDAD: edadTexto(p.fechaNacimiento),
    PACIENTE_SEXO: p.sexo || '',
    PACIENTE_DIRECCION: p.direccion || '',
    PACIENTE_TELEFONO_CORREO: [p.telefono, p.email].filter(Boolean).join(' / '),
    FICHA_CLINICA_N: p.numero != null ? String(p.numero) : '',
    REPRESENTANTE_NOMBRE: p.apoderado || '',
    REPRESENTANTE_RUT_VINCULO: p.rutApoderado || '',
    FECHA_HORA: fmtFechaHora(new Date()),
    PROFESIONAL_NOMBRE: prof.nombre,
    PROFESIONAL_RUT_REGISTRO: prof.rut,
    NOMBRE_FIRMA_PACIENTE_O_REPRESENTANTE: firmaNombre,
    RUT_FIRMA_PACIENTE_O_REPRESENTANTE: firmaDoc,
  }
}

// Renderiza la plantilla: auto-completa datos, deja slots de firma y pone en
// blanco (línea) las variables manuales sin valor.
function render(html: string, p: PacienteVars, prof: { nombre: string; rut: string }, extra: Record<string, string>): string {
  const auto = autoVars(p, prof)
  // Los datos rellenados (del paciente o manuales) van en cursiva para distinguirlos del texto base.
  const dato = (v: string) => `<em class="cl-dato">${esc(v)}</em>`
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_m, name: string) => {
    if (name in auto) return auto[name] ? dato(auto[name]) : ''
    if (name in FIRMA_SLOTS) return FIRMA_SLOTS[name]
    const v = extra[name]
    return v && v.trim() ? dato(v.trim()) : BLANK
  })
}

// Devuelve qué campos requeridos le faltan al paciente (con etiqueta amigable).
export function camposFaltantes(p: PacienteVars, requeridos: string[], pais: string): string[] {
  const falta: string[] = []
  for (const c of requeridos) {
    let ok = false
    if (c === 'nombre') ok = Boolean(p.nombre && p.apellido)
    else if (c === 'rut') ok = Boolean(p.rut || p.otroDocId)
    else if (c === 'fechaNacimiento') ok = Boolean(p.fechaNacimiento)
    else ok = Boolean((p as unknown as Record<string, unknown>)[c])
    if (!ok) falta.push(c === 'rut' ? getPais(pais).doc.label : (CAMPO_LABEL[c] ?? c))
  }
  return falta
}

const parseReq = (csv: string) => csv.split(',').map((s) => s.trim()).filter(Boolean)
async function paisDe(db: TenantClient): Promise<string> {
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { pais: true } })
  return c?.pais ?? 'CL'
}

// ── Plantillas (Administración) ───────────────────────────────────────────────

// Precarga las plantillas base de Digital Dent la primera vez (si la clínica no
// tiene ninguna). Quedan editables.
export async function seedPlantillasSiFaltan(db: TenantClient) {
  const n = await db.plantillaConsentimiento.count({ where: { categoria: 'CONSENTIMIENTO' } })
  if (n > 0) return
  await db.plantillaConsentimiento.createMany({
    data: CONSENTIMIENTOS_DEFAULT.map((t) => ({
      categoria: 'CONSENTIMIENTO', codigo: t.codigo, titulo: t.titulo, contenidoHtml: t.html,
      camposRequeridos: t.camposRequeridos.join(','), orden: t.orden, activo: true,
    })),
  })
}

// Precarga las plantillas base de recetas/certificados/indicaciones la primera vez.
export async function seedDocumentosSiFaltan(db: TenantClient) {
  const n = await db.plantillaConsentimiento.count({ where: { categoria: { not: 'CONSENTIMIENTO' } } })
  if (n > 0) return
  await db.plantillaConsentimiento.createMany({
    data: DOCUMENTOS_DEFAULT.map((t) => ({
      categoria: t.categoria, codigo: t.codigo, titulo: t.titulo, contenidoHtml: t.html,
      camposRequeridos: t.camposRequeridos.join(','), orden: 100 + t.orden, activo: true,
    })),
  })
}

// categoria: 'CONSENTIMIENTO' (por defecto) o 'DOCUMENTO' (recetas/certificados/
// indicaciones/otros = todo lo que NO es consentimiento).
export async function listarPlantillas(db: TenantClient, soloActivas = false, grupo: 'CONSENTIMIENTO' | 'DOCUMENTO' = 'CONSENTIMIENTO') {
  if (grupo === 'CONSENTIMIENTO') await seedPlantillasSiFaltan(db)
  else await seedDocumentosSiFaltan(db)
  return db.plantillaConsentimiento.findMany({
    where: {
      ...(soloActivas ? { activo: true } : {}),
      ...(grupo === 'CONSENTIMIENTO' ? { categoria: 'CONSENTIMIENTO' } : { categoria: { not: 'CONSENTIMIENTO' } }),
    },
    orderBy: { orden: 'asc' },
  })
}
export async function obtenerPlantilla(db: TenantClient, id: string) {
  const p = await db.plantillaConsentimiento.findUnique({ where: { id } })
  if (!p) throw notFound('Plantilla no encontrada')
  return p
}
export async function crearPlantilla(db: TenantClient, body: Record<string, unknown>) {
  const titulo = String(body.titulo ?? '').trim()
  if (!titulo) throw badRequest('Falta el título')
  const ultimo = await db.plantillaConsentimiento.findFirst({ orderBy: { orden: 'desc' }, select: { orden: true } })
  const categoria = CATEGORIAS.includes(String(body.categoria)) ? String(body.categoria) : 'CONSENTIMIENTO'
  return db.plantillaConsentimiento.create({
    data: {
      categoria,
      codigo: String(body.codigo ?? '').trim() || 'CI',
      titulo, contenidoHtml: String(body.contenidoHtml ?? ''),
      camposRequeridos: Array.isArray(body.camposRequeridos) ? body.camposRequeridos.join(',') : String(body.camposRequeridos ?? 'nombre,rut,fechaNacimiento'),
      activo: body.activo === undefined ? true : Boolean(body.activo),
      orden: (ultimo?.orden ?? 0) + 1,
    },
  })
}
const CATEGORIAS = ['CONSENTIMIENTO', 'RECETA', 'CERTIFICADO', 'INDICACION', 'OTRO']
export async function actualizarPlantilla(db: TenantClient, id: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (body.categoria !== undefined && CATEGORIAS.includes(String(body.categoria))) data.categoria = String(body.categoria)
  if (body.titulo !== undefined) data.titulo = String(body.titulo).trim()
  if (body.codigo !== undefined) data.codigo = String(body.codigo).trim()
  if (body.contenidoHtml !== undefined) data.contenidoHtml = String(body.contenidoHtml)
  if (body.camposRequeridos !== undefined) data.camposRequeridos = Array.isArray(body.camposRequeridos) ? body.camposRequeridos.join(',') : String(body.camposRequeridos)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  if (body.orden !== undefined) data.orden = Number(body.orden)
  if (body.contenidoHtml !== undefined) data.version = { increment: 1 }
  const existe = await db.plantillaConsentimiento.findUnique({ where: { id }, select: { id: true } })
  if (!existe) throw notFound('Plantilla no encontrada')
  return db.plantillaConsentimiento.update({ where: { id }, data })
}
export async function eliminarPlantilla(db: TenantClient, id: string) {
  const existe = await db.plantillaConsentimiento.findUnique({ where: { id }, select: { id: true } })
  if (!existe) throw notFound('Plantilla no encontrada')
  await db.plantillaConsentimiento.delete({ where: { id } })
}

// ── Generación / firma (ficha del paciente) ───────────────────────────────────

// Roles con agenda = "profesionales". Deben coincidir con usuarios.service.
const ROLES_CON_AGENDA = ['doctor', 'medico']

// El responsable clínico del consentimiento SIEMPRE es un profesional con agenda,
// NUNCA el usuario administrativo que opera la generación. Se resuelve por id.
async function profResponsable(db: TenantClient, responsableId: string): Promise<{ id: string; nombre: string; rut: string }> {
  if (!responsableId) throw badRequest('Debes seleccionar el profesional responsable del consentimiento.')
  const u = await db.user.findUnique({ where: { id: responsableId }, select: { id: true, name: true, rut: true, role: true, activo: true } })
  if (!u) throw notFound('Profesional responsable no encontrado.')
  if (!u.activo || !ROLES_CON_AGENDA.includes(u.role)) {
    throw badRequest('El responsable debe ser un profesional con agenda (doctor o médico) activo.')
  }
  return { id: u.id, nombre: u.name ?? '', rut: u.rut ?? '' }
}

// Valida que el plan de tratamiento pertenezca al paciente. Devuelve su nombre.
async function planDe(db: TenantClient, pacienteId: string, planId: string): Promise<{ id: string; nombre: string }> {
  if (!planId) throw badRequest('Debes asociar el consentimiento a un plan de tratamiento.')
  const p = await db.planTratamiento.findUnique({ where: { id: planId }, select: { id: true, pacienteId: true, nombre: true } })
  if (!p || p.pacienteId !== pacienteId) throw badRequest('El plan de tratamiento no corresponde a este paciente.')
  return { id: p.id, nombre: p.nombre }
}

// Vista previa + validación de datos faltantes (no crea nada). El profesional
// responsable es opcional en la vista previa (puede aún no estar elegido).
export async function previsualizar(db: TenantClient, _actor: JwtPayload, pacienteId: string, plantillaId: string, responsableId: string | undefined, extra: Record<string, string> = {}) {
  const [paciente, plantilla, pais] = await Promise.all([
    db.paciente.findUnique({ where: { id: pacienteId }, select: PAC_SELECT }),
    db.plantillaConsentimiento.findUnique({ where: { id: plantillaId } }),
    paisDe(db),
  ])
  if (!paciente) throw notFound('Paciente no encontrado')
  if (!plantilla) throw notFound('Plantilla no encontrada')
  const prof = responsableId ? await profResponsable(db, responsableId) : { nombre: '', rut: '' }
  const faltantes = camposFaltantes(paciente, parseReq(plantilla.camposRequeridos), pais)
  const html = render(plantilla.contenidoHtml, paciente, prof, extra)
  const manuales = variablesManuales(plantilla.contenidoHtml)
  return { faltantes, html, titulo: plantilla.titulo, codigo: plantilla.codigo, manuales }
}

export async function generar(db: TenantClient, actor: JwtPayload, pacienteId: string, plantillaId: string, responsableId: string, planId: string, extra: Record<string, string> = {}) {
  const plantilla = await db.plantillaConsentimiento.findUnique({ where: { id: plantillaId } })
  if (!plantilla) throw notFound('Plantilla no encontrada')
  // Sólo los CONSENTIMIENTOS exigen asociarse a un plan de tratamiento; recetas,
  // certificados e indicaciones NO lo requieren (pero pueden asociarse si se envía).
  const esConsentimiento = plantilla.categoria === 'CONSENTIMIENTO'
  const [paciente, pais, prof, plan] = await Promise.all([
    db.paciente.findUnique({ where: { id: pacienteId }, select: PAC_SELECT }),
    paisDe(db),
    profResponsable(db, responsableId),
    (esConsentimiento || planId) ? planDe(db, pacienteId, planId) : Promise.resolve(null),
  ])
  if (!paciente) throw notFound('Paciente no encontrado')
  const faltantes = camposFaltantes(paciente, parseReq(plantilla.camposRequeridos), pais)
  if (faltantes.length > 0) throw badRequest(`Faltan datos del paciente para generar el documento: ${faltantes.join(', ')}. Complétalos en la ficha.`)

  const html = render(plantilla.contenidoHtml, paciente, prof, extra)
  const c = await db.consentimiento.create({
    data: {
      pacienteId, plantillaId, categoria: plantilla.categoria, codigo: plantilla.codigo, titulo: plantilla.titulo, contenidoHtml: html,
      estado: 'BORRADOR',
      generadoPorId: actor.sub, generadoPorNombre: actorName(actor),
      responsableId: prof.id, responsableNombre: prof.nombre,
      planId: plan?.id ?? null,
    },
  })
  await audit(db, actor.sub, { accion: 'CREAR', entidad: 'Consentimiento', entidadId: c.id, pacienteId, resumen: `Generó documento "${plantilla.titulo}" (${plantilla.categoria}, responsable: ${prof.nombre})` })
  return c
}

// Firma el consentimiento (digital = imagen en pantalla; manual = línea para
// firmar en papel). Deja el snapshot final e inmutable.
export async function firmar(db: TenantClient, actor: JwtPayload, id: string, body: { tipo?: string; imagen?: string }) {
  const c = await db.consentimiento.findUnique({ where: { id } })
  if (!c) throw notFound('Consentimiento no encontrado')
  if (c.estado === 'FIRMADO') throw badRequest('Este consentimiento ya está firmado.')
  const tipo = body.tipo === 'DIGITAL' ? 'DIGITAL' : 'MANUAL'
  const ahora = new Date()

  let html = c.contenidoHtml
  const boxPac = '<span class="cl-firma-box" data-slot="paciente"></span>'
  let img: string | null = null
  if (tipo === 'DIGITAL') {
    img = (body.imagen ?? '').trim()
    if (!/^data:image\//.test(img)) throw badRequest('Firma digital inválida.')
    html = html.replace(boxPac, `<span class="cl-firma-box firmada" data-slot="paciente"><img class="cl-firma-img" src="${img}"/></span>`)
  } else {
    html = html.replace(boxPac, '<span class="cl-firma-linea" data-slot="paciente"></span>')
  }
  html = html.replace('<span class="cl-fechafirma" data-slot="paciente"></span>', `<span class="cl-fechafirma" data-slot="paciente">${fmtFechaHora(ahora)}</span>`)
  html = html.replace('<span class="cl-firma-box" data-slot="profesional"></span>', '<span class="cl-firma-linea" data-slot="profesional"></span>')

  const actualizado = await db.consentimiento.update({
    where: { id },
    data: {
      contenidoHtml: html, estado: 'FIRMADO', firmaTipo: tipo, firmaPacienteImg: img,
      firmadoAt: ahora,
    },
  })
  await audit(db, actor.sub, { accion: 'EDITAR', entidad: 'Consentimiento', entidadId: id, pacienteId: c.pacienteId, resumen: `Firmó consentimiento "${c.titulo}" (${tipo === 'DIGITAL' ? 'firma digital' : 'firma manual'})` })
  return actualizado
}

export async function listarPorPaciente(db: TenantClient, pacienteId: string, grupo?: 'CONSENTIMIENTO' | 'DOCUMENTO') {
  return db.consentimiento.findMany({
    where: {
      pacienteId,
      ...(grupo === 'CONSENTIMIENTO' ? { categoria: 'CONSENTIMIENTO' } : grupo === 'DOCUMENTO' ? { categoria: { not: 'CONSENTIMIENTO' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, categoria: true, codigo: true, titulo: true, estado: true, firmaTipo: true, firmadoAt: true, generadoPorNombre: true, responsableNombre: true, planId: true, createdAt: true },
  })
}
export async function obtenerConsentimiento(db: TenantClient, id: string) {
  const c = await db.consentimiento.findUnique({ where: { id } })
  if (!c) throw notFound('Consentimiento no encontrado')
  return c
}

// Eliminar: SOLO administrador (se controla en la ruta) + queda auditado.
export async function eliminarConsentimiento(db: TenantClient, actor: JwtPayload, id: string) {
  const c = await db.consentimiento.findUnique({ where: { id }, select: { id: true, titulo: true, estado: true, pacienteId: true } })
  if (!c) throw notFound('Consentimiento no encontrado')
  await db.consentimiento.delete({ where: { id } })
  await audit(db, actor.sub, { accion: 'ELIMINAR', entidad: 'Consentimiento', entidadId: id, pacienteId: c.pacienteId, resumen: `Eliminó consentimiento "${c.titulo}" (${c.estado})` })
  return { ok: true as const }
}
