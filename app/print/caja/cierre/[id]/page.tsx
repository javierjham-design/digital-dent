export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { PrintCierreClient } from './print-cierre-client'

export default async function PrintCierrePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')
  const { id } = await params

  const sesion = await prisma.sesionCaja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      caja: { select: { id: true, nombre: true, descripcion: true } },
    },
  })
  if (!sesion) notFound()

  // Movimientos: por relación sesionCajaId OR huérfanos dentro de la ventana
  // de la sesión. Esto cubre sesiones cerradas antes del back-fill automático.
  const hasta = sesion.cerradaAt ?? new Date()
  const movimientos = await prisma.movimientoCaja.findMany({
    where: {
      cajaId: sesion.cajaId,
      OR: [
        { sesionCajaId: sesion.id },
        { sesionCajaId: null, fecha: { gte: sesion.abiertaAt, lte: hasta } },
      ],
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      cobro: {
        select: {
          id: true, numero: true,
          medioPago: { select: { nombre: true } },
          paciente: { select: { nombre: true, apellido: true, rut: true } },
        },
      },
    },
    orderBy: { fecha: 'asc' },
  })

  const clinica = await prisma.clinica.findUnique({
    where: { id: u.clinicaId },
    select: { nombre: true, direccion: true, ciudad: true, telefono: true, email: true, rut: true, logoUrl: true },
  })

  // Agregaciones
  const movsActivos = movimientos.filter(m => !m.anulado)
  const ingresos = movsActivos.filter(m => m.tipo === 'INGRESO')
  const egresos  = movsActivos.filter(m => m.tipo === 'EGRESO')

  const ingresosPorMedio = new Map<string, number>()
  for (const m of ingresos) {
    const k = m.cobro?.medioPago?.nombre ?? (m.categoria === 'COBRO' ? 'Sin medio' : (m.categoria ?? 'Otro'))
    ingresosPorMedio.set(k, (ingresosPorMedio.get(k) ?? 0) + m.monto)
  }
  const egresosPorCategoria = new Map<string, number>()
  for (const m of egresos) {
    const k = m.categoria ?? 'OTRO'
    egresosPorCategoria.set(k, (egresosPorCategoria.get(k) ?? 0) + m.monto)
  }

  // Si la sesión no tiene totales persistidos (caso raro de sesión abierta o
  // cierres pre-fix), recalculamos desde los movimientos para mostrar valores
  // consistentes en el reporte.
  const ingresosCalc = ingresos.reduce((s, m) => s + m.monto, 0)
  const egresosCalc  = egresos.reduce((s, m) => s + m.monto, 0)
  const saldoEsperadoCalc = sesion.saldoApertura + ingresosCalc - egresosCalc

  return (
    <PrintCierreClient
      clinica={clinica}
      sesion={{
        id: sesion.id,
        estado: sesion.estado,
        abiertaAt: sesion.abiertaAt.toISOString(),
        cerradaAt: sesion.cerradaAt?.toISOString() ?? null,
        abiertaPorNombre: sesion.abiertaPorNombre,
        cerradaPorNombre: sesion.cerradaPorNombre,
        saldoApertura: sesion.saldoApertura,
        saldoEsperado: sesion.saldoEsperado ?? saldoEsperadoCalc,
        saldoReal: sesion.saldoReal,
        diferencia: sesion.diferencia,
        totalIngresos: sesion.totalIngresos ?? ingresosCalc,
        totalEgresos: sesion.totalEgresos ?? egresosCalc,
        observaciones: sesion.observaciones,
        caja: sesion.caja,
      }}
      ingresosPorMedio={Array.from(ingresosPorMedio.entries()).map(([k, v]) => ({ label: k, monto: v }))}
      egresosPorCategoria={Array.from(egresosPorCategoria.entries()).map(([k, v]) => ({ label: k, monto: v }))}
      movimientos={movimientos.map(m => ({
        id: m.id,
        tipo: m.tipo,
        monto: m.monto,
        descripcion: m.descripcion,
        categoria: m.categoria,
        fecha: m.fecha.toISOString(),
        anulado: m.anulado,
        motivoAnulacion: m.motivoAnulacion,
        cobroNumero: m.cobro?.numero ?? null,
        userNombre: m.user.name ?? m.user.email,
      }))}
    />
  )
}
