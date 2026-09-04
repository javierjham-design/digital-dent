import { z } from 'zod'
import { citasDatos } from '@/services/reportes.service'
import type { Herramienta } from '../tipos'
import { ymd } from './comun'

// 8) ocupacion_agenda(desde, hasta): citas por estado y por profesional, con las
// horas perdidas por inasistencia. "Inasistencia" = cita CANCELADA (la agenda no
// modela un estado no-show aparte; documentado en docs/ASISTENTE_IA.md). El
// desglose por box queda para la capa semántica (etapa 3).
export const ocupacionAgenda: Herramienta<{ desde: string; hasta: string }> = {
  nombre: 'ocupacion_agenda',
  descripcion: 'Ocupación de la agenda en el rango: citas por profesional (total, realizadas, canceladas) y horas perdidas por cancelación.',
  parametros: z.object({ desde: ymd, hasta: ymd }),
  identidad: [],
  async ejecutar(ctx, { desde, hasta }) {
    const citas = await citasDatos(ctx.db, { desde, hasta })
    const porDoctor = new Map<string, { total: number; realizadas: number; canceladas: number; minutosPerdidos: number }>()
    let total = 0
    let realizadas = 0
    let canceladas = 0
    let minutosPerdidos = 0
    for (const c of citas) {
      total += 1
      const nombre = c.doctor?.name ?? 'Sin profesional'
      const acc = porDoctor.get(nombre) ?? { total: 0, realizadas: 0, canceladas: 0, minutosPerdidos: 0 }
      acc.total += 1
      if (c.estado === 'REALIZADA') { acc.realizadas += 1; realizadas += 1 }
      if (c.estado === 'CANCELADA') { acc.canceladas += 1; canceladas += 1; acc.minutosPerdidos += c.duracion; minutosPerdidos += c.duracion }
      porDoctor.set(nombre, acc)
    }
    const filas = [...porDoctor.entries()].map(([profesional, v]) => ({
      profesional, total: v.total, realizadas: v.realizadas, canceladas: v.canceladas, horasPerdidas: Math.round((v.minutosPerdidos / 60) * 10) / 10,
    })).sort((a, b) => b.total - a.total)
    return {
      columnas: [
        { clave: 'profesional', etiqueta: 'Profesional', tipo: 'texto' },
        { clave: 'total', etiqueta: 'Citas', tipo: 'entero' },
        { clave: 'realizadas', etiqueta: 'Realizadas', tipo: 'entero' },
        { clave: 'canceladas', etiqueta: 'Canceladas', tipo: 'entero' },
        { clave: 'horasPerdidas', etiqueta: 'Horas perdidas', tipo: 'texto' },
      ],
      filas,
      totalFilas: filas.length,
      resumen: { total, realizadas, canceladas, horasPerdidas: Math.round((minutosPerdidos / 60) * 10) / 10 },
    }
  },
}
