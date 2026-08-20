import { api, tokenStore, ApiError } from './api'
import type { LiquidacionActivaDetalle, LiquidacionActivaResumen, LiquidacionAdjuntoMeta, MontoFijoPrestacionDTO } from '@shared/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'
const authHeader = (): Record<string, string> => { const t = tokenStore.get(); return t ? { Authorization: `Bearer ${t}` } : {} }

export const cobrosService = {
  listar: () => api.get<unknown[]>('/cobros'),
  porPaciente: (pacienteId: string) => api.get<unknown[]>(`/cobros?pacienteId=${pacienteId}`),
  obtener: (id: string) => api.get<unknown>(`/cobros/${id}`),
  crear: (input: Record<string, unknown>) => api.post<unknown>('/cobros', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/cobros/${id}`, patch),
  anular: (id: string, motivo: string) => api.post<unknown>(`/cobros/${id}/anular`, { motivo }),
  eliminar: (id: string) => api.del<{ ok: true }>(`/cobros/${id}`),
  derivarAbono: (input: { fromPlanId: string; toPlanId: string; monto?: number }) => api.post<unknown>('/cobros/derivar-abono', input),
  linkPago: (input: { pacienteId: string; items: Record<string, unknown>[] }) =>
    api.post<{ estado: 'ok'; url: string; cobroId: string; numero: number; expiraEn?: string; reusado?: boolean }>('/cobros/link-pago', input),
}

export interface ReporteMetodo { metodo: string; monto: number; cantidad: number }
export interface ReportePagoItem { id: string; numero: number; monto: number; fechaPago: string | null; paciente: string; metodo: string; recibidoPor: string; cajaNumero: number | null }
export interface ReportePagos { desde: string | null; hasta: string | null; total: number; cantidad: number; porMetodo: ReporteMetodo[]; items: ReportePagoItem[] }
export interface ReporteProfesional { profesionalId: string; nombre: string; total: number; cantidad: number; porMetodo: ReporteMetodo[] }
export interface ReporteProfesionales { desde: string | null; hasta: string | null; total: number; cantidad: number; porMetodo: ReporteMetodo[]; profesionales: ReporteProfesional[] }
const rangoQS = (desde?: string, hasta?: string) => { const p = new URLSearchParams(); if (desde) p.set('desde', desde); if (hasta) p.set('hasta', hasta); const s = p.toString(); return s ? `?${s}` : '' }

export interface OperadorCaja { userId: string; nombre: string | null; cajaId: string | null; tieneAbierta: boolean }

export const cajasService = {
  listar: () => api.get<unknown[]>('/cajas'),
  resumen: () => api.get<unknown[]>('/cajas/resumen'),
  gestion: () => api.get<unknown[]>('/cajas/gestion'),
  operadores: () => api.get<OperadorCaja[]>('/cajas/operadores'),
  abrirParaUsuario: (userId: string, saldoApertura?: number) => api.post<unknown>('/cajas/abrir-para-usuario', { userId, saldoApertura }),
  reportePagos: (desde?: string, hasta?: string) => api.get<ReportePagos>(`/cajas/reporte-pagos${rangoQS(desde, hasta)}`),
  reporteProfesionales: (desde?: string, hasta?: string) => api.get<ReporteProfesionales>(`/cajas/reporte-profesionales${rangoQS(desde, hasta)}`),
  obtener: (id: string) => api.get<unknown>(`/cajas/${id}`),
  crear: (input: Record<string, unknown>) => api.post<unknown>('/cajas', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/cajas/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/cajas/${id}`),
  saldoSugerido: (id: string) => api.get<{ saldoSugerido: number }>(`/cajas/${id}/abrir`),
  abrir: (id: string, saldoApertura?: number) => api.post<unknown>(`/cajas/${id}/abrir`, { saldoApertura }),
  cerrar: (id: string, input: { saldoReal: number; efectivoRetirado?: number; efectivoDejado?: number; observaciones?: string }) => api.post<unknown>(`/cajas/${id}/cerrar`, input),
  sesiones: (id: string) => api.get<unknown[]>(`/cajas/${id}/sesiones`),
  sesion: (id: string, sesionId: string) => api.get<unknown>(`/cajas/${id}/sesiones/${sesionId}`),
  movimientos: (id: string, from?: string, to?: string) =>
    api.get<unknown[]>(`/cajas/${id}/movimientos${from && to ? `?from=${from}&to=${to}` : ''}`),
  crearMovimiento: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/cajas/${id}/movimientos`, input),
  anularMovimiento: (id: string, movId: string, motivo: string) => api.post<unknown>(`/cajas/${id}/movimientos/${movId}/anular`, { motivo }),
}

export interface FinalizarTodasResultado {
  fechaCorte: string
  finalizadas: { doctorId: string; doctor: string; acciones: number; totalLiquidado: number }[]
  omitidas: { doctorId: string; doctor: string; motivo: string }[]
}

export const liquidacionesService = {
  // Activas (saldo corriente)
  activas: () => api.get<LiquidacionActivaResumen[]>('/liquidaciones-activas'),
  activa: (doctorId: string) => api.get<LiquidacionActivaDetalle>(`/liquidaciones-activas/${doctorId}`),
  finalizar: (doctorId: string, fechaCorte: string) => api.post<unknown>(`/liquidaciones-activas/${doctorId}/finalizar`, { fechaCorte }),
  finalizarTodas: (fechaCorte: string) => api.post<FinalizarTodasResultado>('/liquidaciones-activas/finalizar-todas', { fechaCorte }),
  // Finalizadas (snapshots)
  listar: () => api.get<unknown[]>('/liquidaciones'),
  obtener: (id: string) => api.get<unknown>(`/liquidaciones/${id}`),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/liquidaciones/${id}`, patch),
  // Adjuntos (factura / comprobante): multipart al subir, blob al descargar.
  adjuntos: (id: string) => api.get<LiquidacionAdjuntoMeta[]>(`/liquidaciones/${id}/adjuntos`),
  eliminarAdjunto: (id: string, adjId: string) => api.del<{ ok: true }>(`/liquidaciones/${id}/adjuntos/${adjId}`),
  async subirAdjunto(id: string, tipo: 'FACTURA' | 'COMPROBANTE', file: File): Promise<LiquidacionAdjuntoMeta> {
    const fd = new FormData(); fd.append('tipo', tipo); fd.append('file', file)
    const res = await fetch(`${BASE}/liquidaciones/${id}/adjuntos`, { method: 'POST', headers: authHeader(), body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'No se pudo subir el archivo')
    return data as LiquidacionAdjuntoMeta
  },
  async abrirAdjunto(id: string, adjId: string): Promise<void> {
    const url = (await this.adjuntoBlob(id, adjId)).url
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
  // Devuelve el archivo como blob (para vista previa / rasterizado de PDF).
  async adjuntoBlob(id: string, adjId: string): Promise<{ url: string; mime: string; blob: Blob }> {
    const res = await fetch(`${BASE}/liquidaciones/${id}/adjuntos/${adjId}`, { headers: authHeader() })
    if (!res.ok) throw new ApiError(res.status, 'No se pudo cargar el archivo')
    const blob = await res.blob()
    return { url: URL.createObjectURL(blob), mime: blob.type, blob }
  },
}

export const contratosService = {
  listar: () => api.get<unknown[]>('/contratos'),
  crear: (input: Record<string, unknown>) => api.post<unknown>('/contratos', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/contratos/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/contratos/${id}`),
}

// Montos fijos por prestación (override del contrato base, por profesional).
export const montosFijosService = {
  listar: (doctorId: string) => api.get<MontoFijoPrestacionDTO[]>(`/montos-fijos/${doctorId}`),
  crear: (input: { doctorId: string; prestacionId: string; montoFijo: number }) => api.post<MontoFijoPrestacionDTO>('/montos-fijos', input),
  eliminar: (id: string) => api.del<{ ok: true }>(`/montos-fijos/${id}`),
}
