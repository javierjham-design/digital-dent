import { z } from 'zod'
import { morososDatos, movimientosCajaDatos } from '@/services/reportes.service'
import { ErrorHerramienta, type Herramienta } from '../tipos'
import { ymd, rangoUtc, haceMeses } from './comun'

// 5) pacientes_inactivos_con_saldo(mesesSinVenir, saldoMinimo): pacientes con saldo
// pendiente (misma definición de "moroso": cobros PENDIENTE) que no vienen hace N
// meses. La inactividad se mide contra la última cita REALIZADA.
export const pacientesInactivosConSaldo: Herramienta<{ mesesSinVenir: number; saldoMinimo: number }> = {
  nombre: 'pacientes_inactivos_con_saldo',
  descripcion: 'Pacientes con saldo pendiente (cobros no pagados) que no asisten hace al menos N meses. Útil para recupero. Devuelve paciente, saldo y última visita.',
  parametros: z.object({
    mesesSinVenir: z.number().int().min(0).max(120).default(6),
    saldoMinimo: z.number().int().min(0).default(0),
  }),
  requiere: { permiso: 'puedeVerReportes' },
  identidad: [{ columna: 'paciente', tipo: 'paciente' }],
  async ejecutar(ctx, { mesesSinVenir, saldoMinimo }) {
    const morosos = (await morososDatos(ctx.db, 0)).filter((m) => m.montoTotal >= saldoMinimo)
    const corte = haceMeses(mesesSinVenir)
    const ultimas = new Map<string, Date>()
    if (morosos.length) {
      const citas = await ctx.db.cita.findMany({
        where: { pacienteId: { in: morosos.map((m) => m.paciente.id) }, estado: 'REALIZADA' },
        select: { pacienteId: true, fecha: true },
        orderBy: { fecha: 'desc' },
      })
      for (const c of citas) if (!ultimas.has(c.pacienteId)) ultimas.set(c.pacienteId, c.fecha)
    }
    const rows = morosos.filter((m) => {
      const u = ultimas.get(m.paciente.id)
      return !u || u < corte
    })
    return {
      columnas: [
        { clave: 'paciente', etiqueta: 'Paciente', tipo: 'paciente' },
        { clave: 'saldo', etiqueta: 'Saldo adeudado', tipo: 'dinero' },
        { clave: 'cobrosPendientes', etiqueta: 'Cobros pendientes', tipo: 'entero' },
        { clave: 'ultimaVisita', etiqueta: 'Última visita', tipo: 'fecha' },
      ],
      filas: rows.map((m) => ({ paciente: m.paciente.id, saldo: m.montoTotal, cobrosPendientes: m.cobrosCount, ultimaVisita: ultimas.get(m.paciente.id) ?? null })),
      totalFilas: rows.length,
      resumen: { pacientes: rows.length, montoTotal: rows.reduce((s, r) => s + r.montoTotal, 0) },
    }
  },
}

// 6) produccion_por_profesional(desde, hasta, profesionalId?): producción (neto de
// acciones COMPLETADAS con fechaCompletado en el rango) y pagado, agrupado por
// profesional. Exige puedeGestionarLiquidaciones salvo que se pida la propia.
export const produccionPorProfesional: Herramienta<{ desde: string; hasta: string; profesionalId?: string }> = {
  nombre: 'produccion_por_profesional',
  descripcion: 'Producción por profesional en el rango: neto de acciones ejecutadas y monto pagado, por doctor. Sin profesionalId muestra a todos (requiere gestionar liquidaciones); con tu propio id muestra la tuya.',
  parametros: z.object({ desde: ymd, hasta: ymd, profesionalId: z.string().optional() }),
  puedeVer: (ctx) => ctx.esAdminClinica || ctx.esPlatformAdmin || ctx.permisos.puedeGestionarLiquidaciones === true || ctx.role === 'doctor',
  identidad: [], // los profesionales van con nombre (personal, no dato de salud)
  async ejecutar(ctx, { desde, hasta, profesionalId }) {
    const esGestor = ctx.esAdminClinica || ctx.esPlatformAdmin || ctx.permisos.puedeGestionarLiquidaciones === true
    let doctorFiltro: string | undefined
    if (profesionalId) {
      if (profesionalId !== ctx.userId && !esGestor) throw new ErrorHerramienta('Solo puedes consultar tu propia producción.')
      doctorFiltro = profesionalId
    } else if (!esGestor) {
      doctorFiltro = ctx.userId // sin permiso de gestión: solo la propia
    }
    const r = rangoUtc(desde, hasta, ctx.tz)
    const trats = await ctx.db.tratamiento.findMany({
      where: {
        estado: 'COMPLETADO',
        fechaCompletado: { ...(r.gte ? { gte: r.gte } : {}), ...(r.lte ? { lte: r.lte } : {}) },
        ...(doctorFiltro ? { doctorId: doctorFiltro } : {}),
      },
      select: { doctorId: true, precio: true, descuento: true, cobroItems: { select: { monto: true, cobro: { select: { estado: true } } } } },
    })
    const porDoctor = new Map<string, { produccion: number; pagado: number; acciones: number }>()
    for (const t of trats) {
      const key = t.doctorId ?? 'sin-doctor'
      const acc = porDoctor.get(key) ?? { produccion: 0, pagado: 0, acciones: 0 }
      acc.produccion += Math.round(t.precio * (1 - (t.descuento || 0) / 100))
      acc.acciones += 1
      for (const it of t.cobroItems) if (it.cobro.estado === 'PAGADO') acc.pagado += it.monto
      porDoctor.set(key, acc)
    }
    const ids = [...porDoctor.keys()].filter((k) => k !== 'sin-doctor')
    const docs = ids.length ? await ctx.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
    const nombre = new Map(docs.map((d) => [d.id, d.name ?? 'Profesional']))
    const filas = [...porDoctor.entries()].map(([id, v]) => ({ profesional: id === 'sin-doctor' ? 'Sin profesional' : (nombre.get(id) ?? 'Profesional'), acciones: v.acciones, produccion: v.produccion, pagado: v.pagado }))
      .sort((a, b) => b.produccion - a.produccion)
    return {
      columnas: [
        { clave: 'profesional', etiqueta: 'Profesional', tipo: 'texto' },
        { clave: 'acciones', etiqueta: 'Acciones', tipo: 'entero' },
        { clave: 'produccion', etiqueta: 'Producción', tipo: 'dinero' },
        { clave: 'pagado', etiqueta: 'Pagado', tipo: 'dinero' },
      ],
      filas,
      totalFilas: filas.length,
      resumen: { produccionTotal: filas.reduce((s, r2) => s + r2.produccion, 0), acciones: trats.length },
    }
  },
}

// 7) cuadre_caja(desde, hasta): ingresos/egresos y desglose por medio de pago, a
// partir de los movimientos de caja del rango (misma fuente que reporteCaja).
export const cuadreCaja: Herramienta<{ desde: string; hasta: string }> = {
  nombre: 'cuadre_caja',
  descripcion: 'Cuadre de caja del rango: ingresos y egresos, y el detalle de ingresos por medio de pago.',
  parametros: z.object({ desde: ymd, hasta: ymd }),
  requiere: { permiso: 'puedeGestionarCajas' },
  identidad: [],
  async ejecutar(ctx, { desde, hasta }) {
    const movs = await movimientosCajaDatos(ctx.db, { desde, hasta })
    let ingresos = 0
    let egresos = 0
    const porMedio = new Map<string, { monto: number; cantidad: number }>()
    for (const m of movs) {
      if (m.anulado) continue
      if (m.tipo === 'INGRESO') {
        ingresos += m.monto
        const medio = m.cobro?.medioPago?.nombre ?? m.cobro?.metodoPago ?? 'Sin medio'
        const acc = porMedio.get(medio) ?? { monto: 0, cantidad: 0 }
        acc.monto += m.monto
        acc.cantidad += 1
        porMedio.set(medio, acc)
      } else if (m.tipo === 'EGRESO') {
        egresos += m.monto
      }
    }
    const filas = [...porMedio.entries()].map(([medioPago, v]) => ({ medioPago, ingresos: v.monto, cantidad: v.cantidad })).sort((a, b) => b.ingresos - a.ingresos)
    return {
      columnas: [
        { clave: 'medioPago', etiqueta: 'Medio de pago', tipo: 'texto' },
        { clave: 'ingresos', etiqueta: 'Ingresos', tipo: 'dinero' },
        { clave: 'cantidad', etiqueta: 'Movimientos', tipo: 'entero' },
      ],
      filas,
      totalFilas: filas.length,
      resumen: { ingresos, egresos, neto: ingresos - egresos },
    }
  },
}
