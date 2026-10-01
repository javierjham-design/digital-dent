import { z } from 'zod'
import { citasDatos } from '@/services/reportes.service'
import type { Herramienta } from '../tipos'
import { ymd } from './comun'

// 8) ocupacion_agenda(desde, hasta): citas por profesional (total, atendidas,
// inasistencias, canceladas) y horas perdidas por inasistencia. "Inasistencia" =
// cita en estado NO_ASISTIO (el paciente no llegó); se distingue de CANCELADA. El
// desglose por box queda para la capa semántica (etapa 3).
export const ocupacionAgenda: Herramienta<{ desde: string; hasta: string }> = {
  nombre: 'ocupacion_agenda',
  descripcion: 'Ocupación de la agenda en el rango: citas por profesional (total, atendidas, inasistencias, canceladas) y horas perdidas por inasistencia (el paciente no llegó).',
  parametros: z.object({ desde: ymd, hasta: ymd }),
  identidad: [],
  async ejecutar(ctx, { desde, hasta }) {
    const citas = await citasDatos(ctx.db, { desde, hasta })
    const porDoctor = new Map<string, { total: number; atendidas: number; inasistencias: number; canceladas: number; minutosPerdidos: number }>()
    let total = 0, atendidas = 0, inasistencias = 0, canceladas = 0, minutosPerdidos = 0
    for (const c of citas) {
      total += 1
      const nombre = c.doctor?.name ?? 'Sin profesional'
      const acc = porDoctor.get(nombre) ?? { total: 0, atendidas: 0, inasistencias: 0, canceladas: 0, minutosPerdidos: 0 }
      acc.total += 1
      if (c.estado === 'ATENDIDA') { acc.atendidas += 1; atendidas += 1 }
      else if (c.estado === 'NO_ASISTIO') { acc.inasistencias += 1; inasistencias += 1; acc.minutosPerdidos += c.duracion; minutosPerdidos += c.duracion }
      else if (c.estado === 'CANCELADA') { acc.canceladas += 1; canceladas += 1 }
      porDoctor.set(nombre, acc)
    }
    const filas = [...porDoctor.entries()].map(([profesional, v]) => ({
      profesional, total: v.total, atendidas: v.atendidas, inasistencias: v.inasistencias, canceladas: v.canceladas, horasPerdidas: Math.round((v.minutosPerdidos / 60) * 10) / 10,
    })).sort((a, b) => b.total - a.total)
    return {
      columnas: [
        { clave: 'profesional', etiqueta: 'Profesional', tipo: 'texto' },
        { clave: 'total', etiqueta: 'Citas', tipo: 'entero' },
        { clave: 'atendidas', etiqueta: 'Atendidas', tipo: 'entero' },
        { clave: 'inasistencias', etiqueta: 'Inasistencias', tipo: 'entero' },
        { clave: 'canceladas', etiqueta: 'Canceladas', tipo: 'entero' },
        { clave: 'horasPerdidas', etiqueta: 'Horas perdidas', tipo: 'texto' },
      ],
      filas,
      totalFilas: filas.length,
      resumen: { total, atendidas, inasistencias, canceladas, horasPerdidas: Math.round((minutosPerdidos / 60) * 10) / 10 },
    }
  },
}
