// Marco de ejecución de herramientas. La herramienta declara qué hace y qué
// necesita; el marco (no la herramienta) valida parámetros, verifica permisos,
// resuelve tokens de identidad a ids, ejecuta con timeout, acota filas, las
// seudonimiza y mide el tiempo. Así las defensas son transversales y no dependen
// de que cada herramienta las repita.
import { z } from 'zod'
import { env } from '@/config/env'
import { seudonimizarFilas, type MapaSeudonimos, type EntradaMapa } from './seudonimo'
import { ErrorHerramienta, type CtxHerramienta, type Herramienta, type ResultadoEjecutado } from './tipos'

const TIMEOUT_HERRAMIENTA_MS = 15_000

// JSON Schema (draft para la API) a partir del esquema zod de la herramienta.
export function jsonSchemaDe(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>
  delete js.$schema
  if (js.type !== 'object') return { type: 'object', properties: {}, ...js }
  return js
}

// ¿El usuario puede VER (y por lo tanto usar) esta herramienta? Mismas reglas que
// middlewares/permiso.ts (admin de clínica y platform admin pasan permisos) y
// modulo.ts (solo platform admin saltea el módulo).
export function puedeUsar(h: Herramienta, ctx: CtxHerramienta): boolean {
  if (h.puedeVer) {
    if (!h.puedeVer(ctx)) return false
  } else if (h.requiere?.permiso) {
    const ok = ctx.esAdminClinica || ctx.esPlatformAdmin || ctx.permisos[h.requiere.permiso] === true
    if (!ok) return false
  }
  if (h.requiere?.modulo) {
    const ok = ctx.esPlatformAdmin || ctx.modulos.includes(h.requiere.modulo)
    if (!ok) return false
  }
  return true
}

export function herramientasVisibles(registro: Herramienta[], ctx: CtxHerramienta): Herramienta[] {
  return registro.filter((h) => puedeUsar(h, ctx))
}

function conTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new ErrorHerramienta(msg)), ms)),
  ])
}

// Ejecuta una herramienta de forma segura. Lanza ErrorHerramienta (mensaje corto)
// ante parámetro inválido, permiso faltante, token desconocido, timeout o fallo.
export async function ejecutarHerramienta(
  h: Herramienta,
  ctx: CtxHerramienta,
  inputRaw: unknown,
  mapa: MapaSeudonimos,
): Promise<ResultadoEjecutado> {
  const t0 = Date.now()

  // 1) Permiso (defensa en profundidad: el modelo no debería ver una herramienta
  //    que no puede usar, pero igual se verifica al ejecutar).
  if (!puedeUsar(h, ctx)) throw new ErrorHerramienta('No tienes permiso para usar esta herramienta.')

  // 2) Validación de parámetros con zod. Fuera de esquema = error, sin consultar.
  const parsed = h.parametros.safeParse(inputRaw ?? {})
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `${i.path.join('.') || 'parámetro'}: ${i.message}`).join('; ')
    throw new ErrorHerramienta(`Parámetros inválidos: ${detalle}`.slice(0, 300))
  }
  const params = parsed.data as Record<string, unknown>

  // 3) Resolución de tokens de identidad a ids reales (token desconocido = error).
  for (const tp of h.tokensParametro ?? []) {
    const v = params[tp.campo]
    if (typeof v !== 'string' || !v) continue
    const e: EntradaMapa | undefined = mapa.entrada(v)
    if (!e || e.tipo !== tp.tipo) throw new ErrorHerramienta(`Referencia desconocida en "${tp.campo}".`)
    params[tp.campo] = e.id
  }

  // 4) Ejecución con timeout por herramienta.
  let res
  try {
    res = await conTimeout(h.ejecutar(ctx, params), TIMEOUT_HERRAMIENTA_MS, 'La consulta tardó demasiado.')
  } catch (err) {
    if (err instanceof ErrorHerramienta) throw err
    // No se filtra el detalle del error al modelo ni al usuario.
    throw new ErrorHerramienta('No se pudo completar la consulta.')
  }

  // 5) Acotar filas guardadas y 6) seudonimizar columnas de identidad.
  const totalFilas = res.totalFilas ?? res.filas.length
  const acotadas = res.filas.slice(0, env.asistente.maxFilasResultado)
  const filas = seudonimizarFilas(acotadas, h.identidad, mapa)

  return {
    herramienta: h.nombre,
    parametros: params,
    columnas: res.columnas,
    filas,
    totalFilas,
    resumen: res.resumen,
    identidad: h.identidad,
    ms: Date.now() - t0,
  }
}
