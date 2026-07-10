import { api, tokenStore, ApiError } from './api'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'
const authHeader = (): Record<string, string> => { const t = tokenStore.get(); return t ? { Authorization: `Bearer ${t}` } : {} }

export interface DocumentoMeta {
  id: string; tipo: string; dientes: string | null; descripcion: string | null
  nombre: string; mime: string; size: number; subidoPorNombre: string | null; createdAt: string
}

export const documentosService = {
  listar: (pacienteId: string) => api.get<DocumentoMeta[]>(`/pacientes/${pacienteId}/documentos`),
  eliminar: (id: string) => api.del<{ ok: true }>(`/documentos/${id}`),

  async subir(pacienteId: string, input: { tipo: string; dientes?: string; descripcion?: string; file: File }): Promise<DocumentoMeta> {
    const fd = new FormData()
    fd.append('tipo', input.tipo)
    if (input.dientes) fd.append('dientes', input.dientes)
    if (input.descripcion) fd.append('descripcion', input.descripcion)
    fd.append('file', input.file)
    const res = await fetch(`${BASE}/pacientes/${pacienteId}/documentos`, { method: 'POST', headers: authHeader(), body: fd })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'No se pudo subir el archivo')
    return data as DocumentoMeta
  },

  // URL de objeto (blob) para vista previa/apertura de un documento autenticado.
  async blobUrl(id: string): Promise<{ url: string; mime: string }> {
    const res = await fetch(`${BASE}/documentos/${id}`, { headers: authHeader() })
    if (!res.ok) throw new ApiError(res.status, 'No se pudo cargar el archivo')
    const blob = await res.blob()
    return { url: URL.createObjectURL(blob), mime: blob.type }
  },
  async abrir(id: string): Promise<void> {
    const { url } = await this.blobUrl(id)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
  // Descarga el archivo y lo devuelve en base64 (sin prefijo data:) para adjuntarlo a un correo.
  async base64(id: string): Promise<string> {
    const res = await fetch(`${BASE}/documentos/${id}`, { headers: authHeader() })
    if (!res.ok) throw new ApiError(res.status, 'No se pudo cargar el archivo')
    const blob = await res.blob()
    const dataUri: string = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(new Error('lectura'))
      fr.readAsDataURL(blob)
    })
    return dataUri.replace(/^data:.*;base64,/, '')
  },
}
