import { api } from './api'

// Servicios del panel super-admin (las vistas se construyen en la tanda 3-5).
export const adminService = {
  stats: () => api.get<{ activas: number; enTrial: number; suspendidas: number; total: number; demosActivas: number; mrr: number }>('/admin/stats'),
  resumen: () => api.get<unknown>('/admin/suscripciones/resumen'),
  leads: () => api.get<{ leads: unknown[] }>('/admin/leads'),
  clinicas: () => api.get<unknown[]>('/admin/clinicas'),
  clinica: (id: string) => api.get<unknown>(`/admin/clinicas/${id}`),
  crearClinica: (input: Record<string, unknown>) => api.post<unknown>('/admin/clinicas', input),
  actualizarClinica: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/admin/clinicas/${id}`, patch),
  cambiarPlan: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/admin/clinicas/${id}/cambiar-plan`, input),
  estado: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/admin/clinicas/${id}/estado`, input),
  extenderTrial: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/admin/clinicas/${id}/extender-trial`, input),
  resetPassword: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/admin/clinicas/${id}/reset-admin-password`, input),
  pagos: (id: string) => api.get<{ pagos: unknown[] }>(`/admin/clinicas/${id}/pagos`),
  registrarPago: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/admin/clinicas/${id}/pagos`, input),
  eliminarPago: (id: string, pagoId: string) => api.del<{ ok: true }>(`/admin/clinicas/${id}/pagos/${pagoId}`),
  extras: (id: string) => api.get<{ extras: unknown[] }>(`/admin/clinicas/${id}/extras`),
  crearExtra: (id: string, input: Record<string, unknown>) => api.post<unknown>(`/admin/clinicas/${id}/extras`, input),
  actualizarExtra: (id: string, extraId: string, patch: Record<string, unknown>) => api.patch<unknown>(`/admin/clinicas/${id}/extras/${extraId}`, patch),
  eliminarExtra: (id: string, extraId: string) => api.del<{ ok: true }>(`/admin/clinicas/${id}/extras/${extraId}`),
  whatsapp: (id: string) => api.get<unknown>(`/admin/clinicas/${id}/whatsapp`),
  guardarWhatsapp: (id: string, input: Record<string, unknown>) => api.put<unknown>(`/admin/clinicas/${id}/whatsapp`, input),
  planes: () => api.get<{ planes: unknown[] }>('/admin/planes-suscripcion'),
  crearPlan: (input: Record<string, unknown>) => api.post<unknown>('/admin/planes-suscripcion', input),
  actualizarPlan: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/admin/planes-suscripcion/${id}`, patch),
  eliminarPlan: (id: string) => api.del<{ ok: true }>(`/admin/planes-suscripcion/${id}`),
}
