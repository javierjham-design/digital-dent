'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatCLP, formatDateTime } from '@/lib/utils'
import { CobrosSubNav } from '../../sub-nav'

interface Movimiento {
  id: string
  tipo: string
  monto: number
  descripcion: string
  categoria: string | null
  fecha: string
  anulado: boolean
  motivoAnulacion: string | null
  anuladoAt: string | null
  anuladoPorNombre: string | null
  cobroId: string | null
  cobroNumero: number | null
  pacienteNombre: string | null
  userNombre: string | null
}

interface Caja {
  id: string; nombre: string; descripcion: string | null
  saldoInicial: number; activo: boolean
  usuarios: { id: string; nombre: string | null }[]
}

type Periodo = 'hoy' | 'semana' | 'mes' | 'todo' | 'rango'

const CATEGORIAS_EGRESO = [
  { value: 'ARRIENDO',  label: 'Arriendo' },
  { value: 'INSUMOS',   label: 'Insumos' },
  { value: 'SUELDO',    label: 'Sueldos' },
  { value: 'SERVICIOS', label: 'Servicios' },
  { value: 'RETIRO',    label: 'Retiro' },
  { value: 'OTRO',      label: 'Otro' },
]

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d }
function startOfWeek() {
  const d = startOfToday()
  const day = (d.getDay() + 6) % 7 // lunes = 0
  d.setDate(d.getDate() - day)
  return d
}
function startOfMonth() {
  const d = startOfToday(); d.setDate(1); return d
}
function endOfToday() { const d = new Date(); d.setHours(23,59,59,999); return d }

export function CajaDetalleClient({
  caja, movimientos: init, canVoidMovements,
}: {
  caja: Caja
  movimientos: Movimiento[]
  canVoidMovements: boolean
}) {
  const [movs, setMovs] = useState(init)
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desde, setDesde] = useState<string>('')
  const [hasta, setHasta] = useState<string>('')
  const [showGasto, setShowGasto] = useState(false)
  const [gastoForm, setGastoForm] = useState({ monto: '', descripcion: '', categoria: 'OTRO', fecha: new Date().toISOString().slice(0, 10) })
  const [gastoError, setGastoError] = useState('')
  const [saving, setSaving] = useState(false)
  const [anulando, setAnulando] = useState<Movimiento | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [anularError, setAnularError] = useState('')

  // Filtrado en memoria por período
  const { desdeDt, hastaDt } = useMemo(() => {
    if (periodo === 'hoy') return { desdeDt: startOfToday(), hastaDt: endOfToday() }
    if (periodo === 'semana') return { desdeDt: startOfWeek(), hastaDt: endOfToday() }
    if (periodo === 'mes') return { desdeDt: startOfMonth(), hastaDt: endOfToday() }
    if (periodo === 'rango' && desde && hasta) {
      return { desdeDt: new Date(desde), hastaDt: new Date(hasta + 'T23:59:59') }
    }
    return { desdeDt: null, hastaDt: null }
  }, [periodo, desde, hasta])

  const filtrados = useMemo(() => {
    return movs.filter(m => {
      if (!desdeDt || !hastaDt) return true
      const t = new Date(m.fecha).getTime()
      return t >= desdeDt.getTime() && t <= hastaDt.getTime()
    })
  }, [movs, desdeDt, hastaDt])

  const ingresos = filtrados.filter(m => !m.anulado && m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
  const egresos  = filtrados.filter(m => !m.anulado && m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
  const saldoPeriodo = ingresos - egresos
  const saldoTotal = movs.filter(m => !m.anulado).reduce((s, m) => s + (m.tipo === 'INGRESO' ? m.monto : -m.monto), 0) + caja.saldoInicial

  async function registrarGasto(e: React.FormEvent) {
    e.preventDefault(); setGastoError(''); setSaving(true)
    try {
      const monto = Number(gastoForm.monto)
      if (!Number.isFinite(monto) || monto <= 0) { setGastoError('Monto inválido.'); return }
      if (!gastoForm.descripcion.trim()) { setGastoError('Falta la descripción.'); return }
      const res = await fetch(`/api/cajas/${caja.id}/movimientos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'EGRESO',
          monto,
          descripcion: gastoForm.descripcion,
          categoria: gastoForm.categoria,
          fecha: gastoForm.fecha,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setGastoError(data.error ?? `Error ${res.status}`); return }
      setMovs(prev => [{
        ...data,
        fecha: data.fecha,
        userNombre: data.user?.name ?? data.user?.email,
        cobroId: null, cobroNumero: null, pacienteNombre: null,
      }, ...prev])
      setShowGasto(false)
      setGastoForm({ monto: '', descripcion: '', categoria: 'OTRO', fecha: new Date().toISOString().slice(0, 10) })
    } finally { setSaving(false) }
  }

  async function anular(e: React.FormEvent) {
    e.preventDefault()
    if (!anulando) return
    if (motivoAnulacion.trim().length < 4) { setAnularError('Indica un motivo (mínimo 4 caracteres).'); return }
    setSaving(true); setAnularError('')
    try {
      const res = await fetch(`/api/cajas/${caja.id}/movimientos/${anulando.id}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoAnulacion.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAnularError(data.error ?? `Error ${res.status}`); return }
      setMovs(prev => prev.map(m => m.id === anulando.id ? {
        ...m,
        anulado: true,
        motivoAnulacion: data.motivoAnulacion,
        anuladoAt: data.anuladoAt,
        anuladoPorNombre: data.anuladoPorNombre,
      } : m))
      setAnulando(null)
    } finally { setSaving(false) }
  }

  return (
    <div className="p-8">
      <CobrosSubNav />

      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/cobros/caja" className="text-xs text-cyan-600 hover:underline">← Volver a cajas</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{caja.nombre}</h1>
          {caja.descripcion && <p className="text-sm text-slate-500">{caja.descripcion}</p>}
          {caja.usuarios.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Operada por: {caja.usuarios.map(u => u.nombre).join(', ')}
            </p>
          )}
        </div>
        <button onClick={() => setShowGasto(true)}
          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          Registrar gasto
        </button>
      </div>

      {/* Período */}
      <div className="flex flex-wrap gap-2 items-center mb-5">
        {(['hoy', 'semana', 'mes', 'todo', 'rango'] as Periodo[]).map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${periodo === p ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {p === 'hoy' ? 'Hoy' : p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mes' : p === 'todo' ? 'Histórico' : 'Personalizado'}
          </button>
        ))}
        {periodo === 'rango' && (
          <>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
          </>
        )}
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Ingresos</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono">{formatCLP(ingresos)}</p>
          <p className="text-[10px] text-emerald-500 mt-0.5">en el período</p>
        </div>
        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-5">
          <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Egresos</p>
          <p className="text-2xl font-bold text-rose-700 mt-1 font-mono">{formatCLP(egresos)}</p>
          <p className="text-[10px] text-rose-500 mt-0.5">en el período</p>
        </div>
        <div className={`${saldoPeriodo >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-amber-50 border-amber-100'} border rounded-2xl p-5`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${saldoPeriodo >= 0 ? 'text-teal-600' : 'text-amber-600'}`}>Saldo período</p>
          <p className={`text-2xl font-bold mt-1 font-mono ${saldoPeriodo >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>{formatCLP(saldoPeriodo)}</p>
        </div>
        <div className="bg-slate-900 rounded-2xl p-5 text-white">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Saldo total caja</p>
          <p className="text-2xl font-bold mt-1 font-mono">{formatCLP(saldoTotal)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">incluye saldo inicial {formatCLP(caja.saldoInicial)}</p>
        </div>
      </div>

      {/* Tabla movimientos */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">Movimientos del período <span className="text-slate-400 font-normal">· {filtrados.length}</span></h2>
        </div>
        {filtrados.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">Sin movimientos en el período seleccionado.</div>
        ) : (
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Descripción</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cat.</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Usuario</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monto</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map(m => (
                <tr key={m.id} className={m.anulado ? 'bg-slate-50 text-slate-400 line-through' : ''}>
                  <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{formatDateTime(m.fecha)}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-slate-800 font-medium">{m.descripcion}</p>
                    {m.cobroNumero && (
                      <p className="text-[11px] text-slate-400">
                        Cobro #{m.cobroNumero}{m.pacienteNombre ? ` · ${m.pacienteNombre}` : ''}
                      </p>
                    )}
                    {m.anulado && m.motivoAnulacion && (
                      <p className="text-[11px] text-rose-500 not-italic no-underline">Motivo: {m.motivoAnulacion}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{m.categoria ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 truncate max-w-[120px]">{m.userNombre ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-right text-sm font-bold font-mono ${m.anulado ? '' : m.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {m.tipo === 'INGRESO' ? '+ ' : '- '}{formatCLP(m.monto)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canVoidMovements && !m.anulado && !m.cobroId && (
                      <button onClick={() => { setAnulando(m); setMotivoAnulacion(''); setAnularError('') }}
                        className="text-[11px] text-rose-600 hover:underline">
                        Anular
                      </button>
                    )}
                    {m.cobroId && (
                      <Link href="/cobros" className="text-[11px] text-cyan-600 hover:underline">
                        Ver cobro
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal gasto */}
      {showGasto && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-rose-50">
              <div>
                <h2 className="text-lg font-semibold text-rose-900">Registrar gasto</h2>
                <p className="text-xs text-rose-700">Caja: {caja.nombre}</p>
              </div>
              <button onClick={() => setShowGasto(false)} className="text-rose-400 hover:text-rose-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={registrarGasto} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto (CLP) *</label>
                <input type="number" min="1" step="1" required value={gastoForm.monto}
                  onChange={e => setGastoForm({ ...gastoForm, monto: e.target.value })}
                  autoFocus
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción *</label>
                <input required value={gastoForm.descripcion}
                  onChange={e => setGastoForm({ ...gastoForm, descripcion: e.target.value })}
                  placeholder="Compra de insumos, pago de cuenta, etc."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                  <select value={gastoForm.categoria}
                    onChange={e => setGastoForm({ ...gastoForm, categoria: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500">
                    {CATEGORIAS_EGRESO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label>
                  <input type="date" value={gastoForm.fecha}
                    onChange={e => setGastoForm({ ...gastoForm, fecha: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
                </div>
              </div>
              {gastoError && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{gastoError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowGasto(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Registrando…' : 'Registrar gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal anular */}
      {anulando && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-rose-50">
              <h2 className="text-lg font-semibold text-rose-900">Anular movimiento</h2>
              <button onClick={() => setAnulando(null)} className="text-rose-400 hover:text-rose-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={anular} className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Vas a anular: <strong>{anulando.descripcion}</strong> ({formatCLP(anulando.monto)}). El registro queda en historial con tu nombre y el motivo.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo *</label>
                <textarea required value={motivoAnulacion} rows={3}
                  onChange={e => setMotivoAnulacion(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              {anularError && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{anularError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setAnulando(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving || motivoAnulacion.trim().length < 4}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Anulando…' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
