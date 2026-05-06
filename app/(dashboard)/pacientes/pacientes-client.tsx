'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatRUT, formatDate } from '@/lib/utils'

interface Paciente {
  id: string; rut: string; nombre: string; apellido: string
  telefono: string | null; email: string | null; prevision: string | null
  activo: boolean; totalCitas: number; createdAt: string
}

const PREVISION_COLORS: Record<string, string> = {
  FONASA: 'bg-emerald-100 text-emerald-700',
  ISAPRE: 'bg-blue-100 text-blue-700',
  PARTICULAR: 'bg-slate-100 text-slate-700',
}

export function PacientesClient({ pacientes }: { pacientes: Paciente[] }) {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ rut: '', nombre: '', apellido: '', telefono: '', email: '', prevision: 'PARTICULAR', fechaNacimiento: '', genero: '' })
  const [saving, setSaving] = useState(false)

  const filtered = pacientes.filter((p) => {
    const q = search.toLowerCase()
    return (
      p.nombre.toLowerCase().includes(q) ||
      p.apellido.toLowerCase().includes(q) ||
      p.rut.includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.telefono ?? '').includes(q)
    )
  })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/pacientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setShowModal(false)
    window.location.reload()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pacientes</h1>
          <p className="text-slate-500 text-sm mt-1">{pacientes.length} paciente{pacientes.length !== 1 ? 's' : ''} registrado{pacientes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo paciente
        </button>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-6">
        <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por nombre, RUT, email o teléfono..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Paciente</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">RUT</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Contacto</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Previsión</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Citas</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm">
                  {search ? 'No se encontraron pacientes con esa búsqueda' : 'No hay pacientes registrados'}
                </td>
              </tr>
            ) : filtered.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-cyan-700 text-sm font-semibold">{p.nombre[0]}{p.apellido[0]}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.nombre} {p.apellido}</p>
                      <p className="text-xs text-slate-400">Desde {formatDate(p.createdAt)}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-mono">{formatRUT(p.rut)}</td>
                <td className="px-6 py-4 hidden md:table-cell">
                  <p className="text-sm text-slate-600">{p.telefono ?? '—'}</p>
                  <p className="text-xs text-slate-400">{p.email ?? ''}</p>
                </td>
                <td className="px-6 py-4 hidden lg:table-cell">
                  {p.prevision ? (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PREVISION_COLORS[p.prevision] ?? 'bg-slate-100 text-slate-700'}`}>
                      {p.prevision}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-6 py-4 hidden lg:table-cell text-sm text-slate-600">{p.totalCitas}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/pacientes/${p.id}`}
                      className="text-xs font-medium text-cyan-600 hover:text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Ver ficha
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo paciente */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo paciente</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                  <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apellido *</label>
                  <input required value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RUT *</label>
                <input required placeholder="12345678-9" value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha nacimiento</label>
                  <input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Género</label>
                  <select value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="">Seleccionar</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="O">Otro</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Previsión</label>
                <select value={form.prevision} onChange={(e) => setForm({ ...form, prevision: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="PARTICULAR">Particular</option>
                  <option value="FONASA">FONASA</option>
                  <option value="ISAPRE">ISAPRE</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium transition-colors">
                  {saving ? 'Guardando...' : 'Guardar paciente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
