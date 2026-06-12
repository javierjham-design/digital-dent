'use client'

import { toast } from '@/components/ui/Toaster'

import { useEffect, useState } from 'react'

type Autor = { id: string; name: string | null; email: string | null; username: string | null }
type Evolucion = {
  id: string
  texto: string
  createdAt: string
  autor: Autor | null
  tratamiento: {
    id: string
    diente: number | null
    cara: string | null
    prestacion: { nombre: string }
  } | null
}

export function Evoluciones({ pacienteId, currentUserId }: { pacienteId: string; currentUserId: string }) {
  const [evos, setEvos] = useState<Evolucion[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)

  async function cargar() {
    const r = await fetch(`/api/evoluciones?pacienteId=${pacienteId}`, { cache: 'no-store' })
    if (r.ok) setEvos(await r.json())
    setLoading(false)
  }

  useEffect(() => { cargar() }, [pacienteId])

  async function agregar() {
    if (!texto.trim()) return
    setSaving(true)
    const r = await fetch('/api/evoluciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pacienteId, texto: texto.trim() }),
    })
    setSaving(false)
    if (r.ok) {
      setTexto('')
      cargar()
    } else {
      const e = await r.json().catch(() => ({}))
      toast.error(e.error ?? 'Error al guardar')
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta evolución?')) return
    const r = await fetch(`/api/evoluciones/${id}`, { method: 'DELETE' })
    if (r.ok) cargar()
    else {
      const e = await r.json().catch(() => ({}))
      toast.error(e.error ?? 'Error al eliminar')
    }
  }

  function autorLabel(a: Autor | null): string {
    if (!a) return 'Sistema'
    return a.name || a.username || a.email || 'Usuario'
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-light text-slate-700 mb-1">Evoluciones</h2>
        <p className="text-sm text-slate-500">Registro cronológico de lo realizado al paciente.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Nueva evolución</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Anota lo realizado, observaciones, próximos pasos..."
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-3"
        />
        <div className="flex justify-end">
          <button
            onClick={agregar}
            disabled={!texto.trim() || saving}
            className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-lg font-semibold"
          >
            {saving ? 'Guardando...' : 'Agregar evolución'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>
      ) : evos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          Sin evoluciones registradas todavía.
        </p>
      ) : (
        <div className="space-y-3">
          {evos.map((e) => (
            <div key={e.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{autorLabel(e.autor)[0]?.toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{autorLabel(e.autor)}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(e.createdAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                {(e.autor?.id === currentUserId) && (
                  <button onClick={() => eliminar(e.id)} title="Eliminar" className="text-slate-300 hover:text-red-600 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                    </svg>
                  </button>
                )}
              </div>
              {e.tratamiento && (
                <div className="mb-2 inline-flex items-center gap-2 px-3 py-1 bg-cyan-50 border border-cyan-100 rounded-full text-xs text-cyan-800">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">{e.tratamiento.prestacion.nombre}</span>
                  {e.tratamiento.diente ? <span className="text-cyan-600">· Pieza {e.tratamiento.diente}</span> : e.tratamiento.cara && <span className="text-cyan-600">· {e.tratamiento.cara}</span>}
                </div>
              )}
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{e.texto}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
