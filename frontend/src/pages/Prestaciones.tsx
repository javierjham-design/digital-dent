import { useEffect, useState } from 'react'
import type { PrestacionDTO } from '@shared/types'
import { prestacionesService } from '@/services/catalogo.service'
import { ApiError } from '@/services/api'

const fmtCLP = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(n)

export function Prestaciones() {
  const [items, setItems] = useState<PrestacionDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', categoria: '', precio: '', duracion: '30' })
  const [guardando, setGuardando] = useState(false)

  function cargar() {
    setCargando(true)
    prestacionesService.listar().then(setItems).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }
  useEffect(cargar, [])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    const precio = Number(form.precio)
    if (!form.nombre.trim() || !Number.isFinite(precio)) return
    setGuardando(true)
    try {
      await prestacionesService.crear({ nombre: form.nombre.trim(), categoria: form.categoria || undefined, precio, duracion: Number(form.duracion) || 30 })
      setForm({ nombre: '', categoria: '', precio: '', duracion: '30' })
      setShowForm(false)
      cargar()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear')
    } finally { setGuardando(false) }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar esta prestación?')) return
    await prestacionesService.eliminar(id).catch(() => {})
    cargar()
  }

  // Agrupar por categoría.
  const porCategoria = new Map<string, PrestacionDTO[]>()
  for (const p of items) {
    const k = p.categoria ?? 'Sin categoría'
    const arr = porCategoria.get(k) ?? []
    arr.push(p)
    porCategoria.set(k, arr)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prestaciones</h1>
          <p className="text-slate-500 text-sm mt-1">{items.length} prestaciones en el catálogo</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl transition-colors">
          {showForm ? 'Cerrar' : '+ Nueva prestación'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={crear} className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 grid sm:grid-cols-4 gap-3">
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre *" required
            className="sm:col-span-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Categoría"
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <input value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} placeholder="Precio *" required inputMode="numeric"
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <div className="sm:col-span-4">
            <button type="submit" disabled={guardando}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">
              {guardando ? 'Guardando…' : 'Agregar'}
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <p className="text-slate-500 text-sm">Cargando…</p>
      ) : error ? (
        <p className="text-rose-600 text-sm">{error}</p>
      ) : (
        <div className="space-y-6">
          {Array.from(porCategoria.entries()).map(([cat, lista]) => (
            <div key={cat}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{cat}</h2>
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {lista.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="font-mono text-sm text-slate-700">{fmtCLP(p.precio)}</span>
                      <button onClick={() => eliminar(p.id)} className="text-xs text-rose-400 hover:text-rose-600">Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
