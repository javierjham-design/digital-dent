import { api } from './api'

// Las respuestas clínicas son árboles de Prisma serializados; las tipamos de
// forma laxa acá y las pantallas (tandas siguientes) afinan según necesiten.
export const planesService = {
  listar: (pacienteId: string) => api.get<unknown[]>(`/planes-tratamiento?pacienteId=${pacienteId}`),
  obtener: (id: string) => api.get<unknown>(`/planes-tratamiento/${id}`),
  crear: (input: { pacienteId: string; nombre?: string; notas?: string; doctorTitularId?: string }) =>
    api.post<unknown>('/planes-tratamiento', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/planes-tratamiento/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/planes-tratamiento/${id}`),
  crearSeccion: (planId: string, input: Record<string, unknown>) => api.post<unknown>(`/planes-tratamiento/${planId}/secciones`, input),
}

export const seccionesService = {
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/secciones-plan/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/secciones-plan/${id}`),
}

export const tratamientosService = {
  crear: (input: Record<string, unknown>) => api.post<unknown[]>('/tratamientos', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/tratamientos/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/tratamientos/${id}`),
  // Evolucionar = marcar la acción como realizada + registrar la evolución en la
  // ficha clínica + (opcional) cambiar el profesional que la realiza.
  evolucionar: (id: string, input: { texto: string; profesionalId?: string; fecha?: string }) =>
    api.post<unknown>(`/tratamientos/${id}/evolucionar`, input),
}

export const evolucionesService = {
  listar: (pacienteId: string) => api.get<unknown[]>(`/evoluciones?pacienteId=${pacienteId}`),
  crear: (input: { pacienteId: string; tratamientoId?: string; texto: string; fecha?: string }) => api.post<unknown>('/evoluciones', input),
  actualizar: (id: string, texto: string) => api.patch<unknown>(`/evoluciones/${id}`, { texto }),
  eliminar: (id: string) => api.del<{ ok: true }>(`/evoluciones/${id}`),
}

export interface HistorialEntry {
  id: string; fecha: string; userNombre: string | null
  accion: string; entidad: string; entidadId: string | null; resumen: string; datosPrevios: string | null
}
export const historialService = {
  listar: (pacienteId: string) => api.get<HistorialEntry[]>(`/historial?pacienteId=${pacienteId}`),
}

export const odontogramaService = {
  upsertDiente: (input: { pacienteId?: string; fichaId?: string; numero: number; estado: string }) =>
    api.post<unknown>('/odontograma', input),
}

export const presupuestosService = {
  listar: (pacienteId?: string) => api.get<unknown[]>(`/presupuestos${pacienteId ? `?pacienteId=${pacienteId}` : ''}`),
  obtener: (id: string) => api.get<unknown>(`/presupuestos/${id}`),
  crear: (input: Record<string, unknown>) => api.post<unknown>('/presupuestos', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<unknown>(`/presupuestos/${id}`, patch),
}
