'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatCLP, formatDate } from '@/lib/utils'
import { CobrosSubNav } from '../sub-nav'

interface UltimaSesion {
  id: string
  estado: string
  abiertaAt: string
  cerradaAt: string | null
  abiertaPorNombre: string | null
  cerradaPorNombre: string | null
  saldoApertura: number
  saldoReal: number | null
  diferencia: number | null
  totalIngresos: number | null
  totalEgresos: number | null
}

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
  estado: 'ABIERTA' | 'CERRADA' | 'SIN_SESION'
  ultimaSesion: UltimaSesion | null
  diasDesdeEvento: number | null
  stale: boolean
}

interface Usuario { id: string; nombre: string | null }

export function CajaListClient({
  cajas: initCajas, isAdmin, usuariosDisponibles, staleDias,
}: {
  cajas: CajaResumen[]
  isAdmin: boolean
  usuariosDisponibles: Usuario[]
  staleDias: number
}) {
  const router = useRouter()
  const [cajas, setCajas] = useState(initCajas)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', saldoInicial: '0', usuarioIds: [] as string[] })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Modal de apertura (Abrir caja)
  const [abriendo, setAbriendo] = useState<CajaResumen | null>(null)
  const [aperturaForm, setAperturaForm] = useState({ saldoApertura: '' })
  const [aperturaError, setAperturaError] = useState('')

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
        estado: 'SIN_SESION' as const,
        ultimaSesion: null,
        diasDesdeEvento: null,
        stale: false,
      }])
      setShowCreate(false)
      setForm({ nombre: '', descripcion: '', saldoInicial: '0', usuarioIds: [] })
    } finally { setSaving(false) }
  }

  async function pedirSaldoSugerido(caja: CajaResumen) {
    setAbriendo(caja); setAperturaError('')
    try {
      const res = await fetch(`/api/cajas/${caja.id}/abrir`, { method: 'GET' })
      const data = await res.json().catch(() => ({}))
      const sugerido = Number.isFinite(data?.saldoSugerido) ? Number(data.saldoSugerido) : caja.saldoInicial
      setAperturaForm({ saldoApertura: String(Math.round(sugerido)) })
    } catch {
      setAperturaForm({ saldoApertura: String(Math.round(caja.saldoInicial)) })
    }
  }

  async function abrirCaja(e: React.FormEvent) {
    e.preventDefault()
    if (!abriendo) return
    setAperturaError(''); setSaving(true)
    try {
      const monto = Number(aperturaForm.saldoApertura)
      if (!Number.isFinite(monto) || monto < 0) {
        setAperturaError('Monto inválido.'); return
      }
      const res = await fetch(`/api/cajas/${abriendo.id}/abrir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saldoApertura: monto }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAperturaError(data.error ?? `Error ${res.status}`); return }
      setAbriendo(null); setAperturaForm({ saldoApertura: '' })
      router.push(`/cobros/caja/${abriendo.id}`)
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

      {/* Alerta cajas estancadas */}
      {cajas.some(c => c.stale) && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Cajas sin cerrar hace más de {staleDias} días</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Los cierres regulares aseguran trazabilidad del flujo de efectivo. Considera cerrar las cajas marcadas y hacer arqueo.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {cajas.filter(c => c.stale).map(c => (
                <Link key={c.id} href={`/cobros/caja/${c.id}`}
                  className="text-[11px] font-medium bg-white border border-amber-300 text-amber-800 px-2 py-1 rounded-lg hover:bg-amber-50">
                  {c.nombre} · {c.diasDesdeEvento} días
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

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
          {cajas.map(c => {
            const showAbrir = c.activo && (c.estado === 'CERRADA' || c.estado === 'SIN_SESION')
            return (
              <div key={c.id}
                className={`bg-white border rounded-2xl p-5 transition-all ${c.stale ? 'border-amber-300 shadow-amber-100/50' : c.activo ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                <div className="flex items-start justify-between mb-3 gap-2">
                  <Link href={`/cobros/caja/${c.id}`} className="min-w-0 group flex-1">
                    <p className="font-bold text-slate-900 truncate group-hover:text-cyan-700">{c.nombre}</p>
                    {c.descripcion && <p className="text-xs text-slate-500 truncate">{c.descripcion}</p>}
                  </Link>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {!c.activo && <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">Inactiva</span>}
                    {c.estado === 'ABIERTA' && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.stale ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${c.stale ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                        Abierta {c.diasDesdeEvento === 0 ? 'hoy' : `${c.diasDesdeEvento} d`}
                      </span>
                    )}
                    {c.estado === 'CERRADA' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        Cerrada {c.diasDesdeEvento === 0 ? 'hoy' : c.diasDesdeEvento === 1 ? 'ayer' : `hace ${c.diasDesdeEvento} d`}
                      </span>
                    )}
                    {c.estado === 'SIN_SESION' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        Sin sesión
                      </span>
                    )}
                  </div>
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
                {c.estado === 'ABIERTA' && c.ultimaSesion && (
                  <p className="text-[11px] text-slate-400 mt-3 truncate">
                    Abierta {formatDate(c.ultimaSesion.abiertaAt)}
                    {c.ultimaSesion.abiertaPorNombre ? ` · ${c.ultimaSesion.abiertaPorNombre}` : ''}
                  </p>
                )}
                {c.estado === 'CERRADA' && c.ultimaSesion?.cerradaAt && (
                  <p className="text-[11px] text-slate-400 mt-3 truncate">
                    Cerrada {formatDate(c.ultimaSesion.cerradaAt)}
                    {c.ultimaSesion.cerradaPorNombre ? ` · ${c.ultimaSesion.cerradaPorNombre}` : ''}
                  </p>
                )}
                {c.estado === 'SIN_SESION' && (
                  <p className="text-[11px] text-blue-600 mt-3">
                    Aún no se ha abierto ninguna sesión.
                  </p>
                )}
                {c.usuarios.length > 0 && (
                  <p className="text-[11px] text-slate-400 truncate">
                    Operada por: {c.usuarios.map(u => u.nombre).join(', ')}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <Link href={`/cobros/caja/${c.id}`}
                    className="flex-1 text-center px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">
                    Ver detalle
                  </Link>
                  {showAbrir && (
                    <button onClick={() => pedirSaldoSugerido(c)}
                      className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium shadow-sm">
                      Abrir caja
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal abrir caja */}
      {abriendo && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
              <div>
                <h2 className="text-lg font-semibold text-emerald-900">Abrir caja</h2>
                <p className="text-xs text-emerald-700">{abriendo.nombre}</p>
              </div>
              <button onClick={() => { setAbriendo(null); setAperturaForm({ saldoApertura: '' }) }}
                className="text-emerald-400 hover:text-emerald-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={abrirCaja} className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
                Cuenta el efectivo que tienes en caja ahora y declara el monto.
                Este valor queda como saldo de apertura de la sesión y será la
                base de cuadre al cerrar.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Saldo de apertura (CLP) *</label>
                <input type="number" min="0" step="1" required value={aperturaForm.saldoApertura}
                  onChange={e => setAperturaForm({ saldoApertura: e.target.value })}
                  autoFocus
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono" />
                {abriendo.ultimaSesion?.saldoReal != null && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Sugerido: <span className="font-mono">{formatCLP(abriendo.ultimaSesion.saldoReal)}</span> · saldo real del último cierre.
                  </p>
                )}
              </div>
              {aperturaError && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{aperturaError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => { setAbriendo(null); setAperturaForm({ saldoApertura: '' }) }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Abriendo…' : 'Abrir y continuar'}
                </button>
              </div>
            </form>
          </div>
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
                <p className="mt-1 text-[11px] text-slate-500">Referencia para la primera apertura. Después se usa el saldo real declarado al abrir.</p>
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
