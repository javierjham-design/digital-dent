// Catálogo de métricas y dimensiones de la capa semántica (etapa 3). Cada métrica
// tiene su definición de negocio FIJA (modelo, campo de fecha, agregación, filtros
// implícitos, dimensiones permitidas y permiso). El modelo emite una consulta
// estructurada que se valida contra este catálogo y se compila a Prisma; nunca SQL
// libre. Las definiciones acá son la fuente de verdad (documentadas en docs/ASISTENTE_IA.md).
import type { CtxHerramienta } from './tipos'

export type Agregacion = 'count' | 'sum' | 'avg'
export type TipoDimension = 'profesional' | 'box' | 'medioPago' | 'estado' | 'origen' | 'prestacion' | 'paciente' | 'tiempo'
export type Granularidad = 'dia' | 'semana' | 'mes'

export interface DimensionDef {
  clave: string
  etiqueta: string
  tipo: TipoDimension
  campo: string // campo escalar de la fila que identifica el grupo (para tiempo = campo de fecha)
  granularidad?: Granularidad
}

export type FilaCruda = Record<string, unknown>

export interface MetricaDef {
  clave: string
  etiqueta: string // descripción en lenguaje natural para el modelo
  modelo: 'cobro' | 'cita' | 'planTratamiento' | 'tratamiento' | 'lead' | 'movimientoCaja'
  campoFecha: string
  agregacion: Agregacion
  // Para sum/avg: campos a traer y función que calcula el valor por fila.
  selectValor?: string[]
  valor?: (fila: FilaCruda) => number
  where?: Record<string, unknown> // filtros implícitos siempre aplicados
  dimensiones: DimensionDef[]
  requiere?: { permiso?: string; modulo?: string }
  etiquetaValor: string
  tipoValor: 'dinero' | 'entero'
}

const neto = (f: FilaCruda) => Math.round(Number(f.precio ?? 0) * (1 - (Number(f.descuento ?? 0) || 0) / 100))

// Dimensiones de tiempo (reutilizables): el campo se completa con el campoFecha de la métrica.
const TIEMPO = (campo: string): DimensionDef[] => [
  { clave: 'mes', etiqueta: 'por mes', tipo: 'tiempo', campo, granularidad: 'mes' },
  { clave: 'semana', etiqueta: 'por semana', tipo: 'tiempo', campo, granularidad: 'semana' },
  { clave: 'dia', etiqueta: 'por día', tipo: 'tiempo', campo, granularidad: 'dia' },
]

export const CATALOGO: MetricaDef[] = [
  {
    clave: 'cobros_total', etiqueta: 'Monto total cobrado (pagos recibidos)', modelo: 'cobro',
    campoFecha: 'fechaPago', agregacion: 'sum', selectValor: ['monto'], valor: (f) => Number(f.monto ?? 0),
    where: { estado: 'PAGADO', anulado: false }, etiquetaValor: 'Monto', tipoValor: 'dinero',
    requiere: { permiso: 'puedeVerReportes' },
    dimensiones: [
      { clave: 'medio_pago', etiqueta: 'por medio de pago', tipo: 'medioPago', campo: 'medioPagoId' },
      { clave: 'paciente', etiqueta: 'por paciente', tipo: 'paciente', campo: 'pacienteId' },
      ...TIEMPO('fechaPago'),
    ],
  },
  {
    clave: 'cobros_cantidad', etiqueta: 'Cantidad de cobros pagados', modelo: 'cobro',
    campoFecha: 'fechaPago', agregacion: 'count', where: { estado: 'PAGADO', anulado: false },
    etiquetaValor: 'Cobros', tipoValor: 'entero', requiere: { permiso: 'puedeVerReportes' },
    dimensiones: [
      { clave: 'medio_pago', etiqueta: 'por medio de pago', tipo: 'medioPago', campo: 'medioPagoId' },
      { clave: 'paciente', etiqueta: 'por paciente', tipo: 'paciente', campo: 'pacienteId' },
      ...TIEMPO('fechaPago'),
    ],
  },
  {
    clave: 'citas_cantidad', etiqueta: 'Cantidad de citas', modelo: 'cita',
    campoFecha: 'fecha', agregacion: 'count', etiquetaValor: 'Citas', tipoValor: 'entero',
    dimensiones: [
      { clave: 'profesional', etiqueta: 'por profesional', tipo: 'profesional', campo: 'doctorId' },
      { clave: 'box', etiqueta: 'por box', tipo: 'box', campo: 'boxId' },
      { clave: 'estado', etiqueta: 'por estado', tipo: 'estado', campo: 'estado' },
      { clave: 'paciente', etiqueta: 'por paciente', tipo: 'paciente', campo: 'pacienteId' },
      ...TIEMPO('fecha'),
    ],
  },
  {
    clave: 'citas_canceladas', etiqueta: 'Cantidad de citas canceladas (inasistencias)', modelo: 'cita',
    campoFecha: 'fecha', agregacion: 'count', where: { estado: 'CANCELADA' },
    etiquetaValor: 'Canceladas', tipoValor: 'entero',
    dimensiones: [
      { clave: 'profesional', etiqueta: 'por profesional', tipo: 'profesional', campo: 'doctorId' },
      { clave: 'box', etiqueta: 'por box', tipo: 'box', campo: 'boxId' },
      { clave: 'paciente', etiqueta: 'por paciente', tipo: 'paciente', campo: 'pacienteId' },
      ...TIEMPO('fecha'),
    ],
  },
  {
    clave: 'planes_cantidad', etiqueta: 'Cantidad de planes de tratamiento', modelo: 'planTratamiento',
    campoFecha: 'createdAt', agregacion: 'count', etiquetaValor: 'Planes', tipoValor: 'entero',
    requiere: { permiso: 'puedeVerReportes' },
    dimensiones: [
      { clave: 'estado', etiqueta: 'por estado', tipo: 'estado', campo: 'estado' },
      { clave: 'profesional', etiqueta: 'por profesional titular', tipo: 'profesional', campo: 'doctorTitularId' },
      { clave: 'paciente', etiqueta: 'por paciente', tipo: 'paciente', campo: 'pacienteId' },
      ...TIEMPO('createdAt'),
    ],
  },
  {
    clave: 'tratamientos_ejecutados', etiqueta: 'Acciones ejecutadas (completadas)', modelo: 'tratamiento',
    campoFecha: 'fechaCompletado', agregacion: 'count', where: { estado: 'COMPLETADO' },
    etiquetaValor: 'Acciones', tipoValor: 'entero', requiere: { permiso: 'puedeVerReportes' },
    dimensiones: [
      { clave: 'profesional', etiqueta: 'por profesional', tipo: 'profesional', campo: 'doctorId' },
      { clave: 'prestacion', etiqueta: 'por prestación', tipo: 'prestacion', campo: 'prestacionId' },
      ...TIEMPO('fechaCompletado'),
    ],
  },
  {
    clave: 'tratamientos_monto', etiqueta: 'Monto de acciones ejecutadas (neto)', modelo: 'tratamiento',
    campoFecha: 'fechaCompletado', agregacion: 'sum', selectValor: ['precio', 'descuento'], valor: neto,
    where: { estado: 'COMPLETADO' }, etiquetaValor: 'Monto', tipoValor: 'dinero',
    requiere: { permiso: 'puedeVerReportes' },
    dimensiones: [
      { clave: 'profesional', etiqueta: 'por profesional', tipo: 'profesional', campo: 'doctorId' },
      { clave: 'prestacion', etiqueta: 'por prestación', tipo: 'prestacion', campo: 'prestacionId' },
      ...TIEMPO('fechaCompletado'),
    ],
  },
  {
    clave: 'leads_cantidad', etiqueta: 'Cantidad de leads del CRM', modelo: 'lead',
    campoFecha: 'createdAt', agregacion: 'count', etiquetaValor: 'Leads', tipoValor: 'entero',
    requiere: { modulo: 'crm', permiso: 'puedeGestionarCrm' },
    dimensiones: [
      { clave: 'estado', etiqueta: 'por estado', tipo: 'estado', campo: 'estado' },
      { clave: 'origen', etiqueta: 'por origen', tipo: 'origen', campo: 'origen' },
      ...TIEMPO('createdAt'),
    ],
  },
  {
    clave: 'caja_ingresos', etiqueta: 'Ingresos de caja', modelo: 'movimientoCaja',
    campoFecha: 'fecha', agregacion: 'sum', selectValor: ['monto'], valor: (f) => Number(f.monto ?? 0),
    where: { tipo: 'INGRESO', anulado: false }, etiquetaValor: 'Ingresos', tipoValor: 'dinero',
    requiere: { permiso: 'puedeGestionarCajas' },
    dimensiones: [...TIEMPO('fecha')],
  },
]

export function metricaPorClave(clave: string): MetricaDef | undefined {
  return CATALOGO.find((m) => m.clave === clave)
}

// Mismas reglas que permiso.ts/modulo.ts: admin de clínica y platform admin pasan
// el permiso; solo platform admin saltea el módulo.
export function puedeVerMetrica(m: MetricaDef, ctx: CtxHerramienta): boolean {
  if (m.requiere?.permiso) {
    const ok = ctx.esAdminClinica || ctx.esPlatformAdmin || ctx.permisos[m.requiere.permiso] === true
    if (!ok) return false
  }
  if (m.requiere?.modulo) {
    const ok = ctx.esPlatformAdmin || ctx.modulos.includes(m.requiere.modulo)
    if (!ok) return false
  }
  return true
}

export function metricasVisibles(ctx: CtxHerramienta): MetricaDef[] {
  return CATALOGO.filter((m) => puedeVerMetrica(m, ctx))
}
