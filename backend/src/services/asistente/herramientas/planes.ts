import { z } from 'zod'
import { totalesDePlan } from '@/services/tratamientos.service'
import type { Herramienta } from '../tipos'
import { ymd, rangoUtc } from './comun'

// Carga planes ACTIVOS creados en el rango, con lo necesario para totalesDePlan.
async function planesActivosConTotales(ctx: { db: import('@/db/tenant').TenantClient; tz: string }, desde: string, hasta: string) {
  const r = rangoUtc(desde, hasta, ctx.tz)
  const planes = await ctx.db.planTratamiento.findMany({
    where: { estado: 'ACTIVO', createdAt: { ...(r.gte ? { gte: r.gte } : {}), ...(r.lte ? { lte: r.lte } : {}) } },
    select: {
      id: true, nombre: true, pacienteId: true, createdAt: true,
      tratamientos: { select: { estado: true, precio: true, descuento: true, cobroItems: { select: { monto: true, cobro: { select: { estado: true } } } } } },
    },
  })
  const abonos = planes.length
    ? await ctx.db.cobroItem.findMany({ where: { planId: { in: planes.map((p) => p.id) }, tratamientoId: null, cobro: { estado: 'PAGADO', anulado: false } }, select: { planId: true, monto: true } })
    : []
  const abonoMap = new Map<string, number>()
  for (const it of abonos) if (it.planId) abonoMap.set(it.planId, (abonoMap.get(it.planId) ?? 0) + it.monto)
  return planes.map((p) => ({ p, totales: totalesDePlan(p.tratamientos, abonoMap.get(p.id) ?? 0) }))
}

// 3) planes_sin_pago: planes aprobados (estado ACTIVO) sin ningún abono (abonado 0)
// y con monto > 0, en el rango.
export const planesSinPago: Herramienta<{ desde: string; hasta: string }> = {
  nombre: 'planes_sin_pago',
  descripcion: 'Planes de tratamiento aprobados (activos) creados en el rango que no registran ningún pago. Devuelve paciente, plan y monto.',
  parametros: z.object({ desde: ymd, hasta: ymd }),
  requiere: { permiso: 'puedeVerReportes' },
  identidad: [{ columna: 'paciente', tipo: 'paciente' }],
  async ejecutar(ctx, { desde, hasta }) {
    const conTotales = await planesActivosConTotales(ctx, desde, hasta)
    const rows = conTotales.filter(({ totales }) => totales.total > 0 && totales.abonado === 0)
    return {
      columnas: [
        { clave: 'paciente', etiqueta: 'Paciente', tipo: 'paciente' },
        { clave: 'plan', etiqueta: 'Plan', tipo: 'texto' },
        { clave: 'total', etiqueta: 'Monto', tipo: 'dinero' },
        { clave: 'creado', etiqueta: 'Creado', tipo: 'fecha' },
      ],
      filas: rows.map(({ p, totales }) => ({ paciente: p.pacienteId, plan: p.nombre, total: totales.total, creado: p.createdAt })),
      totalFilas: rows.length,
      resumen: { planes: rows.length, montoTotal: rows.reduce((s, r) => s + r.totales.total, 0) },
    }
  },
}

// 4) planes_sin_ejecucion: planes aprobados sin ninguna acción ejecutada (COMPLETADA).
export const planesSinEjecucion: Herramienta<{ desde: string; hasta: string }> = {
  nombre: 'planes_sin_ejecucion',
  descripcion: 'Planes de tratamiento aprobados (activos) creados en el rango sin ninguna acción ejecutada. Devuelve paciente, plan y monto.',
  parametros: z.object({ desde: ymd, hasta: ymd }),
  requiere: { permiso: 'puedeVerReportes' },
  identidad: [{ columna: 'paciente', tipo: 'paciente' }],
  async ejecutar(ctx, { desde, hasta }) {
    const conTotales = await planesActivosConTotales(ctx, desde, hasta)
    const rows = conTotales.filter(({ totales }) => totales.total > 0 && !totales.tieneEjecucion)
    return {
      columnas: [
        { clave: 'paciente', etiqueta: 'Paciente', tipo: 'paciente' },
        { clave: 'plan', etiqueta: 'Plan', tipo: 'texto' },
        { clave: 'total', etiqueta: 'Monto', tipo: 'dinero' },
        { clave: 'creado', etiqueta: 'Creado', tipo: 'fecha' },
      ],
      filas: rows.map(({ p, totales }) => ({ paciente: p.pacienteId, plan: p.nombre, total: totales.total, creado: p.createdAt })),
      totalFilas: rows.length,
      resumen: { planes: rows.length, montoTotal: rows.reduce((s, r) => s + r.totales.total, 0) },
    }
  },
}
