import type { ZodType } from 'zod'
import type { TenantClient } from '@/db/tenant'
import type { ColumnaIdentidad, TipoEntidad } from './seudonimo'

// Tipo de columna que la UI usa para renderizar (dinero con $, fecha chilena,
// 'paciente' = celda rehidratada a nombre).
export type TipoColumna = 'texto' | 'entero' | 'dinero' | 'fecha' | 'paciente' | 'porcentaje'
export interface Columna { clave: string; etiqueta: string; tipo: TipoColumna }

export type Fila = Record<string, unknown>

// Lo que devuelve una herramienta. `filas` no lleva identificadores en claro:
// las columnas de identidad traen el id (que el marco convierte en token).
export interface ResultadoHerramienta {
  columnas: Columna[]
  filas: Fila[]
  totalFilas: number
  resumen?: Record<string, number | string>
}

// Contexto de ejecución de un turno, construido una vez por el orquestador.
export interface CtxHerramienta {
  db: TenantClient
  userId: string
  role: string
  esPlatformAdmin: boolean
  esAdminClinica: boolean
  permisos: Record<string, boolean>
  modulos: string[]
  hoy: string // YYYY-MM-DD en hora de la clínica
  tz: string
}

export interface RequisitosHerramienta {
  permiso?: string // campo User.puede*
  modulo?: string // código de módulo de la clínica
}

// Parámetro que llega como token de identidad y el marco resuelve a id antes de
// ejecutar (token desconocido = error, sin consultar).
export interface TokenParametro { campo: string; tipo: TipoEntidad }

// P por defecto `any`: las herramientas concretas fijan su tipo de parámetros;
// el registro es heterogéneo (el marco valida con zod en runtime).
export interface Herramienta<P = any> {
  nombre: string
  descripcion: string
  parametros: ZodType<P>
  requiere?: RequisitosHerramienta
  // Predicado de visibilidad que sobreescribe `requiere` para el listado (p.ej.
  // producción por profesional: visible a gestor de liquidaciones o a un doctor).
  puedeVer?: (ctx: CtxHerramienta) => boolean
  tokensParametro?: TokenParametro[]
  identidad: ColumnaIdentidad[]
  ejecutar(ctx: CtxHerramienta, params: P): Promise<ResultadoHerramienta>
}

// Resultado ya post-procesado por el marco (seudonimizado, acotado, medido).
export interface ResultadoEjecutado {
  herramienta: string
  parametros: unknown
  columnas: Columna[]
  filas: Fila[]
  totalFilas: number
  resumen?: Record<string, number | string>
  identidad: ColumnaIdentidad[]
  ms: number
}

// Error de herramienta: mensaje corto y sin stack; el orquestador lo manda al
// modelo como tool_result con is_error. Nunca expone internals al usuario.
export class ErrorHerramienta extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErrorHerramienta'
  }
}
