'use client'

import { useState } from 'react'
import { formatCLP, formatDate } from '@/lib/utils'

interface Cobro {
  id: string; numero: number; concepto: string; monto: number
  estado: string; metodoPago: string | null; fechaPago: string | null
  paciente: string; createdAt: string
}

const ESTADO_STYLES: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  PAGADO: 'bg-emerald-100 text-emerald-700',
  ANULADO: 'bg-red-100 text-red-700',
}

export function CobrosClient({ cobros, pacientes }: { cobros: Cobro[]; pacientes: any[] }) {
  const [showModal, setShowModal] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [form, setForm] = useState({ pacienteId: '', concepto: '', monto: '', metodoPago: 'EFECTIVO', estado: 'PAGADO' })
  const [saving, setSaving] = useState(false)

  const filtered = cobros.filter((c) => filtroEstado === 'TODOS' || c.estado === filtroEstado)
  const totalPendiente = cobros.filter((c) => c.estado === 'PENDIENTE').reduce((s, c) => s + c.monto, 0)
  const totalPagado = cobros.filter((c) => c.estado === 'PAGADO').reduce((s, c) => s + c.monto, 0)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/cobros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, monto: Number(form.monto) }),
    })
    setSaving(false)
    setShowModal(false)
    window.location.reload()
  }

  async function marcarPagado(id: string) {
    await fetch(`/api/cobros/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'PAGADO', fechaPago: new Date().toISOString() }),
    })
    window.location.reload()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cobros</h1>
          <p className="text-slate-500 text-sm mt-1">Gestión de pagos y deudas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuevo cobro
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total cobrado', value: formatCLP(totalPagado), color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Por cobrar', value: formatCLP(totalPendiente), color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total cobros', value: cobros.length.toString(), color: 'text-slate-700', bg: 'bg-slate-50' },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-5 border border-white`}>
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5">
        {['TODOS', 'PENDIENTE', 'PAGADO', 'ANULADO'].map((e) => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filtroEstado === e ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {e === 'TODOS' ? 'Todos' : e.charAt(0) + e.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase">#</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase">Paciente</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase">Concepto</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Fecha</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Método</th>
              <th className="text-right px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase">Monto</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase">Estado</th>
              <th className="px-6 py-3.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">Sin cobros</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-400 font-mono">#{c.numero}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{c.paciente}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{c.concepto}</td>
                <td className="px-6 py-4 text-sm text-slate-600 hidden md:table-cell">
                  {c.fechaPago ? formatDate(c.fechaPago) : formatDate(c.createdAt)}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 hidden md:table-cell">{c.metodoPago ?? '—'}</td>
                <td className="px-6 py-4 text-right text-sm font-semibold text-slate-900">{formatCLP(c.monto)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_STYLES[c.estado]}`}>{c.estado}</span>
                </td>
                <td className="px-6 py-4">
                  {c.estado === 'PENDIENTE' && (
                    <button onClick={() => marcarPagado(c.id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                      Marcar pagado
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo cobro</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paciente *</label>
                <select required value={form.pacienteId} onChange={(e) => setForm({ ...form, pacienteId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar paciente</option>
                  {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto *</label>
                <input required value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
                  <input type="number" required min="0" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Método</label>
                  <select value={form.metodoPago} onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="DEBITO">Débito</option>
                    <option value="CREDITO">Crédito</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="PAGADO">Pagado</option>
                  <option value="PENDIENTE">Pendiente</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
