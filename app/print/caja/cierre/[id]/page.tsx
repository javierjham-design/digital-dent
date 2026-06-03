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
          id: true, numero: true, monto: true, montoNeto: true, comisionMonto: true,
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

  // Agregaciones (sólo movimientos no anulados).
  const movsActivos = movimientos.filter(m => !m.anulado)
  const ingresos = movsActivos.filter(m => m.tipo === 'INGRESO')
  const egresos  = movsActivos.filter(m => m.tipo === 'EGRESO')

  // Resumen por medio de pago: cobros agrupados por medio + ingresos manuales
  // como "Ajuste". Cada entrada tiene cantidad de movimientos para auditoría.
  const porMedio = new Map<string, { monto: number; cantidad: number }>()
  for (const m of ingresos) {
    const k = m.cobroId
      ? (m.cobro?.medioPago?.nombre ?? 'Sin medio')
      : (m.categoria === 'COBRO' ? 'Sin medio' : (m.categoria ?? 'Ajuste'))
    const cur = porMedio.get(k) ?? { monto: 0, cantidad: 0 }
    porMedio.set(k, { monto: cur.monto + m.monto, cantidad: cur.cantidad + 1 })
  }
  const porCategoria = new Map<string, { monto: number; cantidad: number }>()
  for (const m of egresos) {
    const k = m.categoria ?? 'OTRO'
    const cur = porCategoria.get(k) ?? { monto: 0, cantidad: 0 }
    porCategoria.set(k, { monto: cur.monto + m.monto, cantidad: cur.cantidad + 1 })
  }

  // Subtotales adicionales para el reporte: bruto cobros vs neto a caja.
  const cobrosBruto = ingresos
    .filter(m => m.cobroId)
    .reduce((s, m) => s + (m.cobro?.monto ?? m.monto), 0)
  const cobrosComision = ingresos
    .filter(m => m.cobroId)
    .reduce((s, m) => s + (m.cobro?.comisionMonto ?? 0), 0)
  const ingresosManuales = ingresos
    .filter(m => !m.cobroId)
    .reduce((s, m) => s + m.monto, 0)

  // Si la sesión no tiene totales persistidos (sesión abierta o cierres
  // pre-fix), recalculamos para mantener consistencia visual.
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
      ingresosPorMedio={Array.from(porMedio.entries()).map(([label, v]) => ({ label, monto: v.monto, cantidad: v.cantidad }))}
      egresosPorCategoria={Array.from(porCategoria.entries()).map(([label, v]) => ({ label, monto: v.monto, cantidad: v.cantidad }))}
      desgloseCobros={{ bruto: cobrosBruto, comision: cobrosComision, ingresosManuales }}
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
        cobroBruto: m.cobro?.monto ?? null,
        cobroComision: m.cobro?.comisionMonto ?? null,
        medioPagoNombre: m.cobro?.medioPago?.nombre ?? null,
        userNombre: m.user.name ?? m.user.email,
      }))}
    />
  )
}
