import { z } from 'zod'
import { resumenCrm } from '@/services/crm.service'
import type { Herramienta } from '../tipos'
import { ymd, rangoUtc } from './comun'

// 9) embudo_crm(desde, hasta): embudo de leads por estado en el rango (reusa
// resumenCrm). Exige módulo CRM y permiso de gestionar CRM.
export const embudoCrm: Herramienta<{ desde: string; hasta: string }> = {
  nombre: 'embudo_crm',
  descripcion: 'Embudo de leads del CRM en el rango: cantidad por estado, total, leads sin gestionar y reingresos.',
  parametros: z.object({ desde: ymd, hasta: ymd }),
  requiere: { modulo: 'crm', permiso: 'puedeGestionarCrm' },
  identidad: [],
  async ejecutar(ctx, { desde, hasta }) {
    const r = await resumenCrm(ctx.db, rangoUtc(desde, hasta, ctx.tz))
    const filas = Object.entries(r.estados).map(([estado, leads]) => ({ estado, leads })).sort((a, b) => Number(b.leads) - Number(a.leads))
    return {
      columnas: [
        { clave: 'estado', etiqueta: 'Estado', tipo: 'texto' },
        { clave: 'leads', etiqueta: 'Leads', tipo: 'entero' },
      ],
      filas,
      totalFilas: filas.length,
      resumen: { total: r.total, sinGestionar: r.sinGestionar, reingresos: r.reingresos },
    }
  },
}
