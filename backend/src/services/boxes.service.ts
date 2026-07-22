import type { TenantClient } from '@/db/tenant'
import { badRequest, notFound } from '@/lib/errors'

// Boxes / salas de atención (opcionales y configurables). Si la clínica no crea
// ninguno, la agenda funciona igual (citas "sin box"). No son obligatorios.

export async function listarBoxes(db: TenantClient, soloActivos = false) {
  return db.box.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  })
}

export async function crearBox(db: TenantClient, body: Record<string, unknown>) {
  const nombre = String(body.nombre ?? '').trim()
  if (!nombre) throw badRequest('Falta el nombre del box/sala.')
  const ultimo = await db.box.findFirst({ orderBy: { orden: 'desc' }, select: { orden: true } })
  return db.box.create({
    data: {
      nombre,
      tipo: body.tipo ? String(body.tipo).trim() : null,
      activo: body.activo === undefined ? true : Boolean(body.activo),
      orden: (ultimo?.orden ?? 0) + 1,
    },
  })
}

export async function actualizarBox(db: TenantClient, id: string, body: Record<string, unknown>) {
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) {
    const n = String(body.nombre).trim()
    if (!n) throw badRequest('El nombre no puede quedar vacío.')
    data.nombre = n
  }
  if (body.tipo !== undefined) data.tipo = body.tipo ? String(body.tipo).trim() : null
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  if (body.orden !== undefined) data.orden = Number(body.orden)
  const existe = await db.box.findUnique({ where: { id }, select: { id: true } })
  if (!existe) throw notFound('Box no encontrado.')
  return db.box.update({ where: { id }, data })
}

// Soft-delete: se desactiva para no romper las citas históricas que lo referencian.
export async function eliminarBox(db: TenantClient, id: string) {
  const existe = await db.box.findUnique({ where: { id }, select: { id: true } })
  if (!existe) throw notFound('Box no encontrado.')
  await db.box.update({ where: { id }, data: { activo: false } })
}
