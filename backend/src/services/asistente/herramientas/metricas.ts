import { z } from 'zod'
import { ErrorHerramienta, type Herramienta } from '../tipos'
import { metricaPorClave, puedeVerMetrica } from '../catalogo'
import { compilar, type Consulta } from '../compilador'
import { ymd } from './comun'

const consultaSchema = z.object({
  metrica: z.string().min(1),
  dimensiones: z.array(z.string()).max(3).default([]),
  filtros: z.array(z.object({ campo: z.string(), op: z.enum(['eq', 'neq']), valor: z.string() })).max(5).default([]),
  periodo: z.object({ desde: ymd, hasta: ymd }),
  filtroValor: z.object({ op: z.enum(['eq', 'gte', 'lte', 'gt', 'lt']), valor: z.number() }).optional(),
  orden: z.enum(['asc', 'desc']).default('desc'),
  limite: z.number().int().min(1).max(500).default(100),
})

// Capa semántica (etapa 3): responde preguntas no cubiertas por las herramientas
// curadas, dentro de un espacio acotado. El modelo elige métrica/dimensiones/
// filtros/período (vocabulario en el prompt de sistema); el backend valida contra
// el catálogo y compila a Prisma. El permiso se evalúa POR MÉTRICA.
export const consultarMetricas: Herramienta<Consulta> = {
  nombre: 'consultar_metricas',
  descripcion: 'Consulta métricas agregadas de la clínica (conteos y montos) agrupadas por dimensiones y acotadas por un período (desde/hasta). Úsalo para preguntas que las otras herramientas no cubren. Las métricas y dimensiones disponibles están listadas en el prompt del sistema. Para "exactamente N" / "al menos N" usá filtroValor (por ejemplo, pacientes con exactamente 1 cita: métrica citas_cantidad, dimensión paciente, filtroValor {op:"eq",valor:1}).',
  parametros: consultaSchema,
  identidad: [], // si se agrupa por paciente, la columna va con tipo 'paciente' y el marco la tokeniza
  async ejecutar(ctx, params) {
    const m = metricaPorClave(params.metrica)
    if (!m) throw new ErrorHerramienta(`Métrica desconocida: "${params.metrica}".`)
    if (!puedeVerMetrica(m, ctx)) throw new ErrorHerramienta('No tenés permiso para consultar esa métrica.')
    return compilar(ctx.db, params, ctx.tz)
  },
}
