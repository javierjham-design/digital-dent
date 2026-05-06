'use client'

import { useState } from 'react'
import { formatCLP } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Prestacion {
  id: string
  nombre: string
  categoria: string | null
  precio: number
  descripcion: string | null
  activo: boolean
}

const CATEGORIAS = [
  'DIAGNOSTICO',
  'PREVENCION',
  'RESTAURACION',
  'ENDODONCIA',
  'CIRUGIA',
  'PROTESIS',
  'ORTODONCIA',
  'IMPLANTOLOGIA',
  'ESTETICA',
  'GENERAL',
]

const CATEGORIA_COLORS: Record<string, string> = {
  DIAGNOSTICO: 'bg-blue-100 text-blue-700',
  PREVENCION: 'bg-green-100 text-green-700',
  RESTAURACION: 'bg-amber-100 text-amber-700',
  ENDODONCIA: 'bg-purple-100 text-purple-700',
  CIRUGIA: 'bg-red-100 text-red-700',
  PROTESIS: 'bg-orange-100 text-orange-700',
  ORTODONCIA: 'bg-pink-100 text-pink-700',
  IMPLANTOLOGIA: 'bg-indigo-100 text-indigo-700',
  ESTETICA: 'bg-fuchsia-100 text-fuchsia-700',
  GENERAL: 'bg-slate-100 text-slate-600',
}

const emptyForm = { nombre: '', categoria: 'GENERAL', precio: '', descripcion: '' }

export function PrestacionesClient({ initialPrestaciones }: { initialPrestaciones: Prestacion[] }) {
  const [prestaciones, setPrestaciones] = useState<Prestacion[]>(initialPrestaciones)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Prestacion | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS')
  const [busqueda, setBusqueda] = useState('')

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(p: Prestacion) {
    setEditing(p)
    setForm({ nombre: p.nombre, categoria: p.categoria ?? 'GENERAL', precio: p.precio.toString(), descripcion: p.descripcion ?? '' })
    setShowModal(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = { nombre: form.nombre, categoria: form.categoria || null, precio: Number(form.precio), descripcion: form.descripcion || null }

    if (editing) {
      const res = await fetch(`/api/prestaciones/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const updated = await res.json()
      setPrestaciones((prev) => prev.map((p) => p.id === updated.id ? updated : p))
    } else {
      const res = await fetch('/api/prestaciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const created = await res.json()
      setPrestaciones((prev) => [...prev, created])
    }
    setSaving(false)
    setShowModal(false)
  }

  async function toggleActivo(p: Prestacion) {
    const res = await fetch(`/api/prestaciones/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activo: !p.activo }),
    })
    const updated = await res.json()
    setPrestaciones((prev) => prev.map((x) => x.id === updated.id ? updated : x))
  }

  const categorias = Array.from(new Set(prestaciones.map((p) => p.categoria ?? 'GENERAL')))
  const filtradas = prestaciones.filter((p) => {
    const matchCat = filtroCategoria === 'TODAS' || (p.categoria ?? 'GENERAL') === filtroCategoria
    const matchBusq = busqueda === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
    return matchCat && matchBusq
  })

  const activas = filtradas.filter((p) => p.activo)
  const inactivas = filtradas.filter((p) => !p.activo)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Arancel de Prestaciones</h1>
          <p className="text-slate-500 text-sm mt-0.5">Gestiona los tratamientos y sus precios</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva prestación
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total prestaciones', value: prestaciones.filter((p) => p.activo).length },
          { label: 'Categorías', value: categorias.length },
          { label: 'Precio promedio', value: formatCLP(Math.round(prestaciones.filter((p) => p.activo).reduce((s, p) => s + p.precio, 0) / (prestaciones.filter((p) => p.activo).length || 1))) },
          { label: 'Precio máximo', value: formatCLP(Math.max(...prestaciones.filter((p) => p.activo).map((p) => p.precio), 0)) },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar prestación..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {['TODAS', ...CATEGORIAS.filter((c) => categorias.includes(c))].map((cat) => (
            <button
              key={cat}
              onClick={() => setFiltroCategoria(cat)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filtroCategoria === cat ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-cyan-400'
              )}
            >
              {cat === 'TODAS' ? 'Todas' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {activas.length === 0 && inactivas.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            No hay prestaciones. Crea la primera.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Prestación</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Categoría</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Descripción</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Precio</th>
                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {activas.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-3.5 font-medium text-slate-900">{p.nombre}</td>
                  <td className="px-6 py-3.5">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', CATEGORIA_COLORS[p.categoria ?? 'GENERAL'] ?? 'bg-slate-100 text-slate-600')}>
                      {p.categoria ?? 'General'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-slate-500 hidden md:table-cell max-w-[220px] truncate">{p.descripcion || '—'}</td>
                  <td className="px-6 py-3.5 text-right font-bold text-slate-900">{formatCLP(p.precio)}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">Activa</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all justify-end">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => toggleActivo(p)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50" title="Desactivar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {inactivas.length > 0 && (
                <>
                  <tr>
                    <td colSpan={6} className="px-6 py-2 text-xs font-semibold text-slate-400 uppercase bg-slate-50 border-t border-slate-200">
                      Inactivas ({inactivas.length})
                    </td>
                  </tr>
                  {inactivas.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 opacity-50 group">
                      <td className="px-6 py-3.5 text-slate-500 line-through">{p.nombre}</td>
                      <td className="px-6 py-3.5">
                        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full">{p.categoria ?? 'General'}</span>
                      </td>
                      <td className="px-6 py-3.5 text-slate-400 hidden md:table-cell">{p.descripcion || '—'}</td>
                      <td className="px-6 py-3.5 text-right text-slate-500">{formatCLP(p.precio)}</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full">Inactiva</span>
                      </td>
                      <td className="px-6 py-3.5">
                        <button onClick={() => toggleActivo(p)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50" title="Reactivar">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">{editing ? 'Editar prestación' : 'Nueva prestación'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={save} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  required
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Obturación simple (resina)"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Precio (CLP) *</label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={form.precio}
                    onChange={(e) => setForm({ ...form, precio: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (opcional)</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  rows={2}
                  placeholder="Descripción breve del tratamiento..."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear prestación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
