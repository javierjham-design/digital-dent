// Censo de filas de las tablas que importan. Va en el manifiesto de cada corrida
// y es lo que después permite verificar que una restauración quedó COMPLETA
// (mismo conteo restaurado que al momento del backup).
import { tenantClient } from '@/db/tenant'
import { control } from '@/db/control'

export type Censo = Record<string, number>

// Tablas del tenant cuyo conteo verificamos. Nombres EXACTOS de tabla en Postgres
// (los modelos Prisma sin @@map usan el nombre del modelo). Lista cerrada → seguro
// para interpolar en el SQL de count.
export const TABLAS_CENSO_TENANT = ['Paciente', 'Cita', 'Cobro', 'Tratamiento', 'PlanTratamiento', 'Liquidacion'] as const
const TABLA_VALIDA = /^[A-Za-z][A-Za-z0-9_]*$/

// Cuenta filas de `tablas` en una base que vive en el SERVIDOR DE TENANTS (sirve
// para las bases de clínica y para las bases efímeras de restore/ensayo). Usa SQL
// crudo para no depender de que el cliente Prisma tenga ese modelo (p. ej. contar
// "Clinica" en una base de control restaurada al servidor de tenants).
export async function censusEnServidorTenant(dbName: string, tablas: readonly string[]): Promise<Censo> {
  const db = tenantClient(dbName)
  const censo: Censo = {}
  for (const t of tablas) {
    if (!TABLA_VALIDA.test(t)) throw new Error(`Nombre de tabla inválido para el censo: ${t}`)
    const rows = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`)
    censo[t] = rows[0]?.n ?? 0
  }
  return censo
}

// Censo de la base de control VIVA (registro de clínicas).
export async function censusControlVivo(): Promise<Censo> {
  return { Clinica: await control.clinica.count() }
}

export interface CensoDiff { tabla: string; esperado: number; obtenido: number; ok: boolean }

// Compara un censo obtenido contra el esperado (del manifiesto). Todas las tablas
// del esperado deben calzar EXACTO.
export function compararCenso(esperado: Censo, obtenido: Censo): { ok: boolean; filas: CensoDiff[] } {
  const filas: CensoDiff[] = Object.keys(esperado).map((tabla) => {
    const e = esperado[tabla] ?? 0
    const o = obtenido[tabla] ?? 0
    return { tabla, esperado: e, obtenido: o, ok: e === o }
  })
  return { ok: filas.every((f) => f.ok), filas }
}
