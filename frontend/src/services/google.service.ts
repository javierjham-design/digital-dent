import { api } from './api'

export interface GoogleCalendar { id: string; summary: string; primary?: boolean }

export const googleService = {
  // Devuelve la URL de autorización; el SPA navega a ella para iniciar el OAuth.
  conectar: () => api.get<{ authUrl: string }>('/google/connect'),
  // Lista los calendarios de la cuenta conectada (falla si no está conectada).
  calendarios: () => api.get<GoogleCalendar[]>('/google/calendars'),
  desconectar: () => api.post<{ ok: true }>('/google/disconnect', {}),
  sincronizar: (userId?: string) => api.post<{ summaries: unknown[] }>('/google/sync', userId ? { userId } : {}),
  reconciliarBloqueos: () => api.post<{ total: number; converted: number; skippedCount: number }>('/google/reconcile-bloqueos', {}),
}
