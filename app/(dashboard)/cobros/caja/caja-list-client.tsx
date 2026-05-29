'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCLP } from '@/lib/utils'
import { CobrosSubNav } from '../sub-nav'

interface CajaResumen {
  id: string
  nombre: string
  descripcion: string | null
  saldoInicial: number
  activo: boolean
  ingresos: number
  egresos: number
  saldo: number
  usuarios: { id: string; nombre: string | null }[]
}

interface Usuario { id: string; nombre: string | null }

export function CajaListClient({
  cajas: initCajas, isAdmin, usuariosDisponibles,
}: {
  cajas: CajaResumen[]
  isAdmin: boolean
  usuariosDisponibles: Usuario[]
}) {
  const [cajas, setCajas] = useState(initCajas)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', saldoInicial: '0', usuarioIds: [] as string[] })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(''); setSaving(true)
    try {
      const res = await fetch('/api/cajas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre,
          descripcion: form.descripcion || null,
          saldoInicial: Number(form.saldoInicial) || 0,
          usuarioIds: form.usuarioIds,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return }
      setCajas(prev => [...prev, {
        id: data.id, nombre: data.nombre, descripcion: data.descripcion,
        saldoInicial: data.saldoInicial, activo: data.activo,
        ingresos: 0, egresos: 0, saldo: data.saldoInicial,
        usuarios: data.usuarios.map((cu: any) => ({ id: cu.user.id, nombre: cu.user.name ?? cu.user.email })),
      }])
      setShowCreate(false)
      setForm({ nombre: '', descripcion: '', saldoInicial: '0', usuarioIds: [] })
    } finally { setSaving(false) }
  }

  function toggleUsuario(id: string) {
    setForm(f => ({
      ...f,
      usuarioIds: f.usuarioIds.includes(id)
        ? f.usuarioIds.filter(x => x !== id)
        : [...f.usuarioIds, id],
    }))
  }

  return (
    <div className="p-8">
      <CobrosSubNav />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Caja</h1>
          <p className="text-slate-500 text-sm mt-1">Flujo de efectivo de la clínica · ingresos y egresos</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nueva caja
          </button>
        )}
      </div>

      {cajas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
          </svg>
          <p className="text-slate-500">
            {isAdmin ? 'Aún no hay cajas. Crea la primera para empezar a recibir pagos.' : 'No tienes cajas asignadas. Pídele al admin que te asigne una.'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cajas.map(c => (
            <Link key={c.id} href={`/cobros/caja/${c.id}`}
              className={`bg-white border rounded-2xl p-5 hover:border-cyan-300 hover:shadow-md transition-all ${c.activo ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{c.nombre}</p>
                  {c.descripcion && <p className="text-xs text-slate-500 truncate">{c.descripcion}</p>}
                </div>
                {!c.activo && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Inactiva</span>}
              </div>
              <p className={`text-2xl font-bold mb-3 ${c.saldo >= 0 ? 'text-emerald-700' : 'text-rose-700'} font-mono`}>{formatCLP(c.saldo)}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-50 rounded-lg p-2">
                  <p className="text-emerald-600 font-semibold uppercase tracking-wide text-[10px]">Ingresos</p>
                  <p className="text-sm font-mono text-emerald-700">{formatCLP(c.ingresos)}</p>
                </div>
                <div className="bg-rose-50 rounded-lg p-2">
                  <p className="text-rose-600 font-semibold uppercase tracking-wide text-[10px]">Egresos</p>
                  <p className="text-sm font-mono text-rose-700">{formatCLP(c.egresos)}</p>
                </div>
              </div>
              {c.usuarios.length > 0 && (
                <p className="text-[11px] text-slate-400 mt-3 truncate">
                  Operada por: {c.usuarios.map(u => u.nombre).join(', ')}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* Modal crear */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Nueva caja</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={create} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input required value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Caja principal" autoFocus
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <input value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Saldo inicial (CLP)</label>
                <input type="number" min="0" step="1" value={form.saldoInicial} onChange={e => setForm({ ...form, saldoInicial: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Usuarios autorizados</label>
                {usuariosDisponibles.length === 0 ? (
                  <p className="text-xs text-amber-600">Ningún usuario tiene el permiso "Recibir pagos" todavía. Actívaselo desde Usuarios para asignárselo aquí.</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-100 rounded-xl p-2">
                    {usuariosDisponibles.map(u => (
                      <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                        <input type="checkbox" checked={form.usuarioIds.includes(u.id)} onChange={() => toggleUsuario(u.id)}
                          className="w-4 h-4 accent-cyan-600 rounded" />
                        <span className="text-sm text-slate-700">{u.nombre}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {error && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{error}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Creando…' : 'Crear caja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
