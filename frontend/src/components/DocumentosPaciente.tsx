import { useEffect, useRef, useState } from 'react'
import { documentosService, type DocumentoMeta } from '@/services/documentos.service'
import { EnviarCorreoModal } from '@/components/EnviarCorreoModal'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

const TIPOS: { v: string; l: string; diente?: boolean }[] = [
  { v: 'PERIAPICAL', l: 'Periapical', diente: true },
  { v: 'BITEWING_IZQ', l: 'Bitewing izquierda', diente: true },
  { v: 'BITEWING_DER', l: 'Bitewing derecha', diente: true },
  { v: 'PANORAMICA', l: 'Panorámica' },
  { v: 'TELERRADIOGRAFIA', l: 'Telerradiografía' },
  { v: 'CBCT', l: 'CBCT / Escáner 3D' },
  { v: 'FOTO', l: 'Foto clínica', diente: true },
  { v: 'INFORME', l: 'Informe (PDF)' },
  { v: 'OTRO', l: 'Otro documento' },
]
const label = (v: string) => TIPOS.find((t) => t.v === v)?.l ?? v
const esImagen = (mime: string) => mime.startsWith('image/')
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })

export function DocumentosPaciente({ pacienteId, pacienteNombre, pacienteEmail }: { pacienteId: string; pacienteNombre?: string; pacienteEmail?: string | null }) {
  const { user } = useAuth()
  const puedeEliminar = Boolean(user?.permisos?.puedeEliminar)
  const [enviar, setEnviar] = useState<DocumentoMeta | null>(null)
  const [items, setItems] = useState<DocumentoMeta[]>([])
  const [cargando, setCargando] = useState(true)
  const [tipo, setTipo] = useState('PERIAPICAL')
  const [dientes, setDientes] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const cfg = TIPOS.find((t) => t.v === tipo)!

  const cargar = () => documentosService.listar(pacienteId).then(setItems).catch(() => {}).finally(() => setCargando(false))
  useEffect(() => { cargar() }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function subir(file: File) {
    setSubiendo(true); setError('')
    try { await documentosService.subir(pacienteId, { tipo, dientes: dientes.trim() || undefined, descripcion: descripcion.trim() || undefined, file }); setDientes(''); setDescripcion(''); cargar() }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Error al subir') } finally { setSubiendo(false) }
  }
  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este archivo? Queda registrado en la auditoría.')) return
    try { await documentosService.eliminar(id); cargar() } catch (e) { setError(e instanceof ApiError ? e.message : 'Error') }
  }

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
        <p className="text-sm font-semibold text-slate-700 mb-2">Subir radiografía o documento</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="block"><span className="text-xs font-medium text-slate-500">Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inp}>
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </label>
          {cfg.diente && (
            <label className="block"><span className="text-xs font-medium text-slate-500">Pieza(s) que aparecen (FDI)</span>
              <input value={dientes} onChange={(e) => setDientes(e.target.value)} placeholder="Ej: 16, 17, 26" className={inp} />
            </label>
          )}
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" className={`${inp} sm:col-span-2 mt-0`} />
        </div>
        {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button onClick={() => fileRef.current?.click()} disabled={subiendo} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">{subiendo ? 'Subiendo…' : 'Elegir archivo y subir'}</button>
          <span className="text-xs text-slate-400">Imagen o PDF · hasta 20 MB</span>
          <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); if (e.target) e.target.value = '' }} />
        </div>
      </div>

      {cargando ? <p className="px-4 py-8 text-center text-slate-400 text-sm">Cargando…</p>
        : items.length === 0 ? <p className="px-4 py-8 text-center text-slate-400 text-sm">Sin radiografías ni documentos aún.</p>
        : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((d) => <Card key={d.id} d={d} puedeEliminar={puedeEliminar} onEliminar={() => eliminar(d.id)} onEnviar={() => setEnviar(d)} />)}
          </div>
        )}

      {enviar && (
        <EnviarCorreoModal
          tipo="DOCUMENTO" titulo="documento"
          asuntoDefault={`${label(enviar.tipo)}${enviar.dientes ? ` · pieza(s) ${enviar.dientes}` : ''}`}
          pacienteId={pacienteId} pacienteNombre={pacienteNombre} defaultEmail={pacienteEmail}
          generarPdf={async () => ({ base64: await documentosService.base64(enviar.id), nombre: enviar.nombre || `${label(enviar.tipo)}` })}
          onClose={() => setEnviar(null)} />
      )}
    </div>
  )
}

function Card({ d, puedeEliminar, onEliminar, onEnviar }: { d: DocumentoMeta; puedeEliminar: boolean; onEliminar: () => void; onEnviar: () => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button onClick={() => documentosService.abrir(d.id).catch(() => {})} className="block w-full aspect-square bg-slate-100" title="Abrir">
        {esImagen(d.mime) ? <Thumb id={d.id} /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-400"><span className="text-4xl">📄</span><span className="text-[10px] mt-1">PDF</span></div>}
      </button>
      <div className="p-2">
        <p className="text-xs font-semibold text-slate-700 truncate">{label(d.tipo)}</p>
        {d.dientes && <p className="text-[11px] text-cyan-700">Pieza(s): {d.dientes}</p>}
        {d.descripcion && <p className="text-[11px] text-slate-500 truncate" title={d.descripcion}>{d.descripcion}</p>}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-slate-400">{fecha(d.createdAt)}</span>
          <div className="flex items-center gap-2">
            <button onClick={onEnviar} className="text-[11px] text-cyan-700 hover:text-cyan-900" title="Enviar por correo">✉</button>
            {puedeEliminar && <button onClick={onEliminar} className="text-[11px] text-slate-400 hover:text-rose-600">Eliminar</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

// Miniatura de imagen (descarga autenticada → object URL).
function Thumb({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    documentosService.blobUrl(id).then((r) => { u = r.url; setUrl(r.url) }).catch(() => {})
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [id])
  return url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse bg-slate-200" />
}

const inp = 'w-full mt-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
