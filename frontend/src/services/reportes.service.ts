import { tokenStore, ApiError } from './api'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export type ReporteTipo = 'pacientes' | 'citas' | 'cobros' | 'tratamientos' | 'liquidaciones' | 'caja' | 'morosos'

// Descarga un reporte XLSX autenticado: fetch con Bearer → blob → descarga.
// (No se puede navegar directo porque el token va en el header, no en cookie.)
export async function descargarReporte(tipo: ReporteTipo, params: Record<string, string> = {}): Promise<void> {
  const qs = new URLSearchParams(params).toString()
  const token = tokenStore.get()
  const res = await fetch(`${BASE}/reportes/${tipo}${qs ? `?${qs}` : ''}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Error ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
