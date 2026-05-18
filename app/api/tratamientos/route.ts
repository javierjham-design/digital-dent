import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    pacienteId, prestacionId, piezas, zona, precio, notas, cara,
    planId, seccionId, descuento,
  } = body

  // Verificar paciente y prestación de la clínica
  const paciente = await prisma.paciente.findFirst({ where: { id: pacienteId, clinicaId: u.clinicaId }, select: { id: true } })
  if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
  const prestacion = await prisma.prestacion.findFirst({
    where: { id: prestacionId, clinicaId: u.clinicaId },
    select: { id: true, precio: true },
  })
  if (!prestacion) return NextResponse.json({ error: 'Prestación no encontrada' }, { status: 404 })

  // Validaciones de permisos: si el usuario no puede modificar precio, fuerza el precio del catálogo.
  // Si no puede aplicar descuento, fuerza descuento = 0.
  const fullUser = await prisma.user.findUnique({
    where: { id: u.id },
    select: { puedeModificarPrecio: true, puedeAplicarDescuento: true, role: true },
  })
  const puedePrecio = fullUser?.puedeModificarPrecio || fullUser?.role === 'admin'
  const puedeDescuento = fullUser?.puedeAplicarDescuento || fullUser?.role === 'admin'

  const precioFinal = puedePrecio ? Number(precio) : prestacion.precio
  const descuentoFinal = puedeDescuento && typeof descuento === 'number' ? Math.max(0, Math.min(100, descuento)) : 0

  // Validar plan/sección si vienen
  if (planId) {
    const plan = await prisma.planTratamiento.findFirst({ where: { id: planId, clinicaId: u.clinicaId } })
    if (!plan) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 })
  }
  if (seccionId) {
    const seccion = await prisma.seccionPlan.findFirst({
      where: { id: seccionId, plan: { clinicaId: u.clinicaId } },
    })
    if (!seccion) return NextResponse.json({ error: 'Sección no encontrada' }, { status: 404 })
  }

  let ficha = await prisma.fichaClinica.findUnique({ where: { pacienteId } })
  if (!ficha) {
    ficha = await prisma.fichaClinica.create({ data: { pacienteId, clinicaId: u.clinicaId } })
  }

  const baseData = {
    clinicaId: u.clinicaId,
    fichaId: ficha.id,
    prestacionId,
    planId: planId || null,
    seccionId: seccionId || null,
    precio: precioFinal,
    descuento: descuentoFinal,
    notas: notas || null,
    estado: 'PLANIFICADO' as const,
  }

  if (piezas && Array.isArray(piezas) && piezas.length > 0) {
    const tratamientos = await Promise.all(
      piezas.map((pieza: number) =>
        prisma.tratamiento.create({
          data: { ...baseData, diente: pieza, cara: cara || null },
          include: { prestacion: true },
        })
      )
    )
    return NextResponse.json(tratamientos, { status: 201 })
  }

  const tratamiento = await prisma.tratamiento.create({
    data: { ...baseData, diente: null, cara: zona || cara || null },
    include: { prestacion: true },
  })
  return NextResponse.json([tratamiento], { status: 201 })
}
