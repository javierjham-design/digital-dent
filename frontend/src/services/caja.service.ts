import { api } from './api'

export const cobrosService = {
  listar: () => api.get<unknown[]>('/cobros'),
  obtener: (id: string) => api.get<unknown>(`/cobros/${id}`),
  crear: (input: Record<string, unknown>) => api.post<unknown>('/cobros', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/cobros/${id}`, patch),
  anular: (id: string, motivo: string) => api.post<unknown>(`/cobros/${id}/anular`, { motivo }),
  eliminar: (id: string) => api.del<{ ok: true }>(`/cobros/${id}`),
}

export const cajasService = {
  listar: () => api.get<unknown[]>('/cajas'),
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
  listar: () => api.get<unknown[]>('/liquidaciones'),
  obtener: (id: string) => api.get<unknown>(`/liquidaciones/${id}`),
  crear: (input: { doctorId: string; periodo: string }) => api.post<unknown>('/liquidaciones', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/liquidaciones/${id}`, patch),
}

export const contratosService = {
  listar: () => api.get<unknown[]>('/contratos'),
  crear: (input: Record<string, unknown>) => api.post<unknown>('/contratos', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/contratos/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/contratos/${id}`),
}
