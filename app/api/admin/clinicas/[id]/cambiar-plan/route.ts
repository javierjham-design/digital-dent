import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const PLANES_VALIDOS = ['TRIAL', 'BASICO', 'PRO']
const CICLOS_VALIDOS = ['MENSUAL', 'ANUAL']

// POST /api/admin/clinicas/[id]/cambiar-plan
// Body: { plan: string, cicloFacturacion?: 'MENSUAL'|'ANUAL', precioAcordado?: number|null,
//         proximoCobro?: string|null, trialHasta?: string|null }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  if (!PLANES_VALIDOS.includes(body.plan)) {
    return NextResponse.json({ error: `Plan inválido. Use: ${PLANES_VALIDOS.join(', ')}` }, { status: 400 })
  }

  const data: Record<string, unknown> = { plan: body.plan }

  if (body.cicloFacturacion !== undefined) {
    if (!CICLOS_VALIDOS.includes(body.cicloFacturacion)) {
      return NextResponse.json({ error: 'cicloFacturacion debe ser MENSUAL o ANUAL' }, { status: 400 })
    }
    data.cicloFacturacion = body.cicloFacturacion
  }

  if (body.precioAcordado !== undefined) {
    if (body.precioAcordado === null) {
      data.precioAcordado = null
    } else {
      const p = Number(body.precioAcordado)
      if (!Number.isFinite(p) || p < 0) return NextResponse.json({ error: 'precioAcordado inválido' }, { status: 400 })
      data.precioAcordado = p
    }
  }

  if (body.proximoCobro !== undefined) {
    data.proximoCobro = body.proximoCobro ? new Date(body.proximoCobro) : null
  }

  if (body.trialHasta !== undefined) {
    data.trialHasta = body.trialHasta ? new Date(body.trialHasta) : null
  }

  // Si pasa a un plan pagado y no tiene proximoCobro definido, lo seteamos a +1 ciclo.
  if (body.plan !== 'TRIAL' && data.proximoCobro === undefined) {
    const actual = await prisma.clinica.findUnique({ where: { id }, select: { proximoCobro: true } })
    if (!actual?.proximoCobro) {
      const fecha = new Date()
      if ((data.cicloFacturacion ?? 'MENSUAL') === 'ANUAL') {
        fecha.setFullYear(fecha.getFullYear() + 1)
      } else {
        fecha.setMonth(fecha.getMonth() + 1)
      }
      data.proximoCobro = fecha
    }
  }

  const clinica = await prisma.clinica.update({ where: { id }, data })
  return NextResponse.json({ ok: true, clinica })
}
