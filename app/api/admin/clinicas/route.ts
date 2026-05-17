import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const DEFAULT_ADMIN_USERNAME = 'Administrador'
const DEFAULT_ADMIN_PASSWORD = 'ADMIN22'

// Slugs que NO se pueden usar como nombre de clínica porque colisionan con
// subdominios reservados de la plataforma (mantén sincronizado con proxy.ts).
export const RESERVED_SLUGS = new Set([
  'super-admin', 'www', 'admin', 'api', 'app', 'mail',
  'login', 'auth', 'panel', 'dashboard', 'support', 'soporte',
  'help', 'ayuda', 'blog', 'docs', 'status', 'cdn', 'assets', 'static',
])

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

// POST: super-admin crea una clínica. Auto-genera usuario "Administrador" / "ADMIN22".
// El admin debe cambiar la contraseña en su primer login.
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const {
    clinicaNombre, clinicaEmail, clinicaTelefono, clinicaDireccion, clinicaCiudad,
    plan, trialDias, slug: slugDeseado,
  } = body

  if (!clinicaNombre) {
    return NextResponse.json({ error: 'Falta el nombre de la clínica' }, { status: 400 })
  }

  // Slug: si el super-admin lo eligió manualmente úsalo; sino generamos uno.
  const base = (slugDeseado ? slugify(slugDeseado) : slugify(clinicaNombre)) || 'clinica'

  if (RESERVED_SLUGS.has(base)) {
    return NextResponse.json({
      error: `El código "${base}" está reservado por la plataforma. Elige otro (no puede ser: ${Array.from(RESERVED_SLUGS).join(', ')}).`,
    }, { status: 400 })
  }

  let slug = base
  let i = 1
  while (await prisma.clinica.findUnique({ where: { slug } })) {
    i++
    slug = `${base}-${i}`
  }

  // Copia catálogo de plantilla (clínica "digital-dent")
  const plantilla = await prisma.clinica.findUnique({ where: { slug: 'digital-dent' } })
  const prestacionesBase = plantilla
    ? await prisma.prestacion.findMany({ where: { clinicaId: plantilla.id } })
    : []

  const planFinal = plan && ['TRIAL', 'BASICO', 'PRO'].includes(plan) ? plan : 'TRIAL'
  let trialHasta: Date | null = null
  if (planFinal === 'TRIAL') {
    const dias = Number(trialDias) > 0 ? Number(trialDias) : 30
    trialHasta = new Date()
    trialHasta.setDate(trialHasta.getDate() + dias)
  }

  const hash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10)

  const clinica = await prisma.$transaction(async (tx) => {
    const c = await tx.clinica.create({
      data: {
        slug,
        nombre: clinicaNombre,
        email: clinicaEmail ?? '',
        telefono: clinicaTelefono ?? '',
        direccion: clinicaDireccion ?? '',
        ciudad: clinicaCiudad ?? 'Temuco',
        plan: planFinal,
        trialHasta,
        activo: true,
      },
    })

    await tx.user.create({
      data: {
        clinicaId: c.id,
        name: 'Administrador',
        username: DEFAULT_ADMIN_USERNAME,
        email: null,
        password: hash,
        role: 'admin',
        activo: true,
        passwordChangedAt: null, // forzará cambio en primer login
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
    credenciales: {
      url_subdominio: `${clinica.slug}.{PLATFORM_DOMAIN}`,
      url_fallback: `/c/${clinica.slug}/login`,
      usuario: DEFAULT_ADMIN_USERNAME,
      contrasena: DEFAULT_ADMIN_PASSWORD,
      nota: 'La contraseña debe ser cambiada en el primer login.',
    },
    prestacionesCopiadas: prestacionesBase.length,
  }, { status: 201 })
}
