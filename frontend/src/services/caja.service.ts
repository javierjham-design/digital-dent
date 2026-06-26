import { api, tokenStore, ApiError } from './api'
import type { LiquidacionActivaDetalle, LiquidacionActivaResumen, LiquidacionAdjuntoMeta } from '@shared/types'

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
}

export const cajasService = {
  listar: () => api.get<unknown[]>('/cajas'),
  resumen: () => api.get<unknown[]>('/cajas/resumen'),
  obtener: (id: string) => api.get<unknown>(`/cajas/${id}`),
  crear: (input: Record<string, unknown>) => api.post<unknown>('/cajas', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/cajas/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/cajas/${id}`),
  saldoSugerido: (id: string) => api.get<{ saldoSugerido: number }>(`/cajas/${id}/abrir`),
  abrir: (id: string, saldoApertura?: number) => api.post<unknown>(`/cajas/${id}/abrir`, { saldoApertura }),
  cerrar: (id: string, saldoReal: number, observaciones?: string) => api.post<unknown>(`/cajas/${id}/cerrar`, { saldoReal, observaciones }),
  sesiones: (id: string) => api.get<unknown[]>(`/cajas/${id}/sesiones`),
  sesion: (id: string, sesionId: string) => api.get<unknown>(`/cajas/${id}/sesiones/${sesionId}`),
  movimientos: (id: string, from?: string, to?: string) =>
    api.get<unknown[]>(`/cajas/${id}/movimientos${from && to ? `?from=${from}&to=${to}` : ''}`),
  crearMovimiento: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/cajas/${id}/movimientos`, input),
  anularMovimiento: (id: string, movId: string, motivo: string) => api.post<unknown>(`/cajas/${id}/movimientos/${movId}/anular`, { motivo }),
}

export const liquidacionesService = {
  // Activas (saldo corriente)
  activas: () => api.get<LiquidacionActivaResumen[]>('/liquidaciones-activas'),
  activa: (doctorId: string) => api.get<LiquidacionActivaDetalle>(`/liquidaciones-activas/${doctorId}`),
  finalizar: (doctorId: string) => api.post<unknown>(`/liquidaciones-activas/${doctorId}/finalizar`),
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
