import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

// Registro público de una nueva clínica + usuario admin inicial.
// Copia el catálogo de aranceles de la clínica plantilla.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const {
    clinicaNombre, clinicaEmail, clinicaTelefono, clinicaDireccion, clinicaCiudad,
    adminNombre, adminEmail, adminPassword,
  } = body

  if (!clinicaNombre || !adminEmail || !adminPassword || !adminNombre) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }
  if (String(adminPassword).length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const emailExiste = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (emailExiste) return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })

  // Generar slug único
  const base = slugify(clinicaNombre) || 'clinica'
  let slug = base
  let i = 1
  while (await prisma.clinica.findUnique({ where: { slug } })) {
    i++
    slug = `${base}-${i}`
  }

  const hash = await bcrypt.hash(adminPassword, 10)

  // Copiar catálogo de la clínica plantilla (la inicial "digital-dent")
  const plantilla = await prisma.clinica.findUnique({ where: { slug: 'digital-dent' } })
  const prestacionesBase = plantilla
    ? await prisma.prestacion.findMany({ where: { clinicaId: plantilla.id } })
    : []

  const trialHasta = new Date()
  trialHasta.setDate(trialHasta.getDate() + 30)

  const clinica = await prisma.$transaction(async (tx) => {
    const c = await tx.clinica.create({
      data: {
        slug,
        nombre: clinicaNombre,
        email: clinicaEmail ?? '',
        telefono: clinicaTelefono ?? '',
        direccion: clinicaDireccion ?? '',
        ciudad: clinicaCiudad ?? 'Temuco',
        plan: 'TRIAL',
        trialHasta,
        activo: true,
      },
    })

    await tx.user.create({
      data: {
        clinicaId: c.id,
        name: adminNombre,
        email: adminEmail,
        password: hash,
        role: 'admin',
        activo: true,
      },
    })

    if (prestacionesBase.length > 0) {
      await tx.prestacion.createMany({
        data: prestacionesBase.map((p) => ({
          clinicaId: c.id,
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio: p.precio,
          duracion: p.duracion,
          categoria: p.categoria,
          activo: p.activo,
        })),
      })
    }

    return c
  })

  return NextResponse.json({
    ok: true,
    clinica: { id: clinica.id, slug: clinica.slug, nombre: clinica.nombre },
    prestacionesCopiadas: prestacionesBase.length,
  }, { status: 201 })
}
