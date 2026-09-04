// Capa de sesiones del asistente: CRUD propio del usuario (nadie lee las ajenas),
// estado (herramientas visibles + uso), envío de un turno (delegado al
// orquestador) y export a Excel de un resultado. Rehidrata lo guardado para la UI.
import type { TenantClient } from '@/db/tenant'
import type { JwtPayload } from '@/services/auth.service'
import { notFound } from '@/lib/errors'
import { env } from '@/config/env'
import { CLINIC_TZ, todayYmd } from '@/lib/tz'
import { getClinicaModulos } from '@/middlewares/tenant'
import { buildXlsx, clp, isoDate, type ExcelColumn } from '@/lib/excel'
import type {
  EstadoAsistenteDTO, SesionAsistenteDTO, SesionAsistenteDetalleDTO, RespuestaTurnoDTO,
  ResultadoAsistenteDTO, ColumnaAsistenteDTO, MensajeAsistenteDTO,
} from '@shared/types'
import { MapaSeudonimos, desdeModelo, rehidratarFilas, type ColumnaIdentidad, type ResolverNombre, type Fila } from './seudonimo'
import { REGISTRO } from './herramientas'
import { herramientasVisibles } from './marco'
import { contadores } from './limites'
import { crearProveedor } from './proveedor'
import { ejecutarTurno, construirResolver, type ActorAsistente } from './orquestador'
import type { CtxHerramienta } from './tipos'

// ── Actor y contexto de permisos ─────────────────────────────────────────────

async function cargarPermisos(db: TenantClient, auth: JwtPayload): Promise<Record<string, boolean>> {
  if (auth.role === 'admin' || auth.isPlatformAdmin) return {} // el marco los deja pasar por esAdmin
  const u = await db.user.findUnique({
    where: { id: auth.sub },
    select: { puedeVerReportes: true, puedeGestionarLiquidaciones: true, puedeGestionarCajas: true, puedeGestionarCrm: true },
  })
  return {
    puedeVerReportes: !!u?.puedeVerReportes,
    puedeGestionarLiquidaciones: !!u?.puedeGestionarLiquidaciones,
    puedeGestionarCajas: !!u?.puedeGestionarCajas,
    puedeGestionarCrm: !!u?.puedeGestionarCrm,
  }
}

export async function construirActor(db: TenantClient, auth: JwtPayload): Promise<ActorAsistente> {
  const permisos = await cargarPermisos(db, auth)
  const modulos = auth.clinicaId ? await getClinicaModulos(auth.clinicaId) : []
  return { userId: auth.sub, role: auth.role, esPlatformAdmin: auth.isPlatformAdmin, permisos, modulos }
}

function ctxDeActor(db: TenantClient, actor: ActorAsistente): CtxHerramienta {
  return {
    db, userId: actor.userId, role: actor.role,
    esPlatformAdmin: actor.esPlatformAdmin, esAdminClinica: actor.role === 'admin',
    permisos: actor.permisos, modulos: actor.modulos, hoy: todayYmd(CLINIC_TZ), tz: CLINIC_TZ,
  }
}

// ── Estado ───────────────────────────────────────────────────────────────────

export async function estado(db: TenantClient, actor: ActorAsistente): Promise<EstadoAsistenteDTO> {
  const visibles = herramientasVisibles(REGISTRO, ctxDeActor(db, actor))
  const c = await contadores(db, actor.userId, CLINIC_TZ)
  return {
    habilitado: env.asistente.enabled,
    herramientas: visibles.map((h) => ({ nombre: h.nombre, descripcion: h.descripcion })),
    uso: { consultasHoy: c.usuarioHoy, limiteDia: env.asistente.limiteUsuarioDia },
  }
}

// ── CRUD de sesiones (siempre acotado al usuario dueño) ───────────────────────

const dto = (s: { id: string; titulo: string; createdAt: Date; updatedAt: Date }): SesionAsistenteDTO => ({
  id: s.id, titulo: s.titulo, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
})

export async function listarSesiones(db: TenantClient, userId: string): Promise<SesionAsistenteDTO[]> {
  const rows = await db.asistenteSesion.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { id: true, titulo: true, createdAt: true, updatedAt: true } })
  return rows.map(dto)
}

export async function crearSesion(db: TenantClient, userId: string): Promise<SesionAsistenteDTO> {
  const s = await db.asistenteSesion.create({ data: { userId }, select: { id: true, titulo: true, createdAt: true, updatedAt: true } })
  return dto(s)
}

// Verifica pertenencia: ni el admin de la clínica lee/borra sesiones ajenas (404).
async function sesionPropia(db: TenantClient, userId: string, sesionId: string): Promise<{ id: string; mapaCifrado: string | null }> {
  const s = await db.asistenteSesion.findFirst({ where: { id: sesionId, userId }, select: { id: true, mapaCifrado: true } })
  if (!s) throw notFound('Sesión no encontrada')
  return s
}

// Deriva las columnas de identidad (a rehidratar) desde el tipo 'paciente'.
function identidadDe(columnas: ColumnaAsistenteDTO[]): ColumnaIdentidad[] {
  return columnas.filter((c) => c.tipo === 'paciente').map((c) => ({ columna: c.clave, tipo: 'paciente' as const }))
}

export async function obtenerSesion(db: TenantClient, userId: string, sesionId: string): Promise<SesionAsistenteDetalleDTO> {
  const s = await db.asistenteSesion.findFirst({ where: { id: sesionId, userId }, select: { id: true, titulo: true, createdAt: true, updatedAt: true, mapaCifrado: true } })
  if (!s) throw notFound('Sesión no encontrada')
  const mapa = MapaSeudonimos.cargar(s.mapaCifrado)
  const resolver = await construirResolver(db, mapa)
  const [mensajesRaw, resultadosRaw] = await Promise.all([
    db.asistenteMensaje.findMany({ where: { sesionId }, orderBy: { createdAt: 'asc' }, select: { id: true, rol: true, contenido: true, createdAt: true } }),
    db.asistenteResultado.findMany({ where: { sesionId }, orderBy: { createdAt: 'asc' }, select: { id: true, herramienta: true, parametros: true, columnas: true, filas: true, totalFilas: true } }),
  ])
  const mensajes: MensajeAsistenteDTO[] = mensajesRaw.map((m) => ({
    id: m.id, rol: m.rol === 'assistant' ? 'assistant' : 'user',
    contenido: desdeModelo(m.contenido, mapa, resolver), createdAt: m.createdAt.toISOString(),
  }))
  const resultados: ResultadoAsistenteDTO[] = resultadosRaw.map((r) => hidratarResultado(r, mapa, resolver))
  return { id: s.id, titulo: s.titulo, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(), mensajes, resultados }
}

export async function eliminarSesion(db: TenantClient, userId: string, sesionId: string): Promise<void> {
  await sesionPropia(db, userId, sesionId)
  // Se borran mensajes y resultados (dato del paciente seudonimizado); la
  // auditoría se conserva (no tiene contenido, sostiene los contadores de costo).
  await db.asistenteResultado.deleteMany({ where: { sesionId } })
  await db.asistenteMensaje.deleteMany({ where: { sesionId } })
  await db.asistenteSesion.delete({ where: { id: sesionId } })
}

// ── Envío de un turno ─────────────────────────────────────────────────────────

export async function enviarMensaje(db: TenantClient, auth: JwtPayload, sesionId: string, texto: string): Promise<RespuestaTurnoDTO> {
  await sesionPropia(db, auth.sub, sesionId)
  const actor = await construirActor(db, auth)
  const r = await ejecutarTurno({ db, actor, sesionId, texto, proveedor: crearProveedor() })
  return {
    mensaje: { id: r.mensajeId, rol: 'assistant', contenido: r.contenido, createdAt: r.createdAt.toISOString() },
    resultados: r.resultados.map((res) => ({ id: res.id, herramienta: res.herramienta, parametros: res.parametros, columnas: res.columnas as ColumnaAsistenteDTO[], filas: res.filas, totalFilas: res.totalFilas })),
    cifrasNoVerificadas: r.cifrasNoVerificadas,
  }
}

// ── Export a Excel de un resultado ────────────────────────────────────────────

function hidratarResultado(
  r: { id: string; herramienta: string; parametros: string; columnas: string; filas: string; totalFilas: number },
  mapa: MapaSeudonimos, resolver: ResolverNombre,
): ResultadoAsistenteDTO {
  const columnas = JSON.parse(r.columnas) as ColumnaAsistenteDTO[]
  const filas = rehidratarFilas(JSON.parse(r.filas) as Fila[], identidadDe(columnas), mapa, resolver)
  return { id: r.id, herramienta: r.herramienta, parametros: JSON.parse(r.parametros), columnas, filas, totalFilas: r.totalFilas }
}

function celdaExcel(tipo: ColumnaAsistenteDTO['tipo'], v: unknown): string | number | null {
  if (v == null) return null
  if (tipo === 'dinero' || tipo === 'entero') return typeof v === 'number' ? clp(v) : Number(v) || 0
  if (tipo === 'fecha') return isoDate(typeof v === 'string' || v instanceof Date ? v : null)
  return typeof v === 'number' ? v : String(v)
}

export async function xlsxResultado(db: TenantClient, userId: string, resultadoId: string): Promise<{ buffer: Buffer; filenameBase: string }> {
  const r = await db.asistenteResultado.findUnique({ where: { id: resultadoId }, select: { id: true, sesionId: true, herramienta: true, parametros: true, columnas: true, filas: true, totalFilas: true } })
  if (!r) throw notFound('Resultado no encontrado')
  const s = await db.asistenteSesion.findFirst({ where: { id: r.sesionId, userId }, select: { mapaCifrado: true } })
  if (!s) throw notFound('Resultado no encontrado')
  const mapa = MapaSeudonimos.cargar(s.mapaCifrado)
  const resolver = await construirResolver(db, mapa)
  const hidratado = hidratarResultado(r, mapa, resolver)
  const cols: ExcelColumn<Record<string, unknown>>[] = hidratado.columnas.map((c) => ({ header: c.etiqueta, value: (fila) => celdaExcel(c.tipo, fila[c.clave]) }))
  const buffer = buildXlsx(hidratado.filas, cols, r.herramienta.slice(0, 31))
  return { buffer, filenameBase: `asistente-${r.herramienta}` }
}
