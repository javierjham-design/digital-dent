import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'
import { audit } from '@/lib/audit'
import type { JwtPayload } from '@/services/auth.service'

// Radiografías y documentos del paciente (bytes en la base de la clínica).
const TIPOS = ['PERIAPICAL', 'BITEWING_IZQ', 'BITEWING_DER', 'PANORAMICA', 'TELERRADIOGRAFIA', 'CBCT', 'FOTO', 'INFORME', 'OTRO']
// Whitelist de formatos concretos: `image/*` dejaba pasar SVG, que ejecuta scripts al
// servirse inline desde el origin de la API (XSS almacenado con la cookie de sesión).
const MIMES_PERMITIDOS = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/heic', 'image/heif', 'application/pdf'])
const mimeOk = (m: string) => MIMES_PERMITIDOS.has(m.toLowerCase())
// Para servir: un documento legacy con mime fuera de la whitelist (p.ej. SVG subido
// antes del endurecimiento) va como descarga, nunca inline.
export const esMimeSeguroInline = (m: string) => MIMES_PERMITIDOS.has((m ?? '').toLowerCase())
const META = { id: true, tipo: true, dientes: true, descripcion: true, nombre: true, mime: true, size: true, subidoPorNombre: true, createdAt: true } as const

export async function listarDocumentos(db: TenantClient, pacienteId: string) {
  return db.documentoPaciente.findMany({ where: { pacienteId }, orderBy: { createdAt: 'desc' }, select: META })
}

export async function subirDocumento(
  db: TenantClient, actor: JwtPayload, pacienteId: string,
  input: { tipo: string; dientes?: string; descripcion?: string; nombre: string; mime: string; buffer: Buffer },
) {
  const p = await db.paciente.findUnique({ where: { id: pacienteId }, select: { id: true } })
  if (!p) throw notFound('Paciente no encontrado')
  if (!mimeOk(input.mime)) throw badRequest('Solo se aceptan imágenes (radiografías/fotos) o PDF.')
  const tipo = TIPOS.includes(input.tipo) ? input.tipo : 'OTRO'
  const doc = await db.documentoPaciente.create({
    data: {
      pacienteId, tipo,
      dientes: input.dientes?.trim() || null, descripcion: input.descripcion?.trim() || null,
      nombre: input.nombre.slice(0, 200), mime: input.mime, size: input.buffer.length, data: input.buffer,
      subidoPorId: actor.sub, subidoPorNombre: actor.name ?? actor.email ?? null,
    },
    select: META,
  })
  await audit(db, actor.sub, { accion: 'CREAR', entidad: 'DocumentoPaciente', entidadId: doc.id, pacienteId, resumen: `Subió ${tipo} · ${input.nombre}` })
  return doc
}

export async function descargarDocumento(db: TenantClient, id: string) {
  const d = await db.documentoPaciente.findUnique({ where: { id } })
  if (!d) throw notFound('Documento no encontrado')
  return d
}

export async function eliminarDocumento(db: TenantClient, actor: JwtPayload, id: string) {
  const d = await db.documentoPaciente.findUnique({ where: { id }, select: { id: true, tipo: true, nombre: true, pacienteId: true } })
  if (!d) throw notFound('Documento no encontrado')
  await db.documentoPaciente.delete({ where: { id } })
  await audit(db, actor.sub, { accion: 'ELIMINAR', entidad: 'DocumentoPaciente', entidadId: id, pacienteId: d.pacienteId, resumen: `Eliminó ${d.tipo} · ${d.nombre}` })
  return { ok: true as const }
}
