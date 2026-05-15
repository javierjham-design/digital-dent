'use client'

import { useState } from 'react'
import { formatCLP, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const ESTADO_STYLES: Record<string, string> = { BORRADOR: 'bg-amber-100 text-amber-700', APROBADA: 'bg-blue-100 text-blue-700', PAGADA: 'bg-emerald-100 text-emerald-700' }

interface Liquidacion { id: string; doctorId: string; periodo: string; totalBruto: number; totalLiquidado: number; estado: string; fechaPago: string | null; createdAt: string; doctor: { id: string; name: string | null; email: string | null; especialidad: string | null }; contrato: { tipo: string; porcentaje: number | null; montoFijo: number | null }; _count: { items: number } }
interface Doctor { id: string; name: string | null; email: string | null; especialidad: string | null }

export function LiquidacionesClient({ liquidaciones: init, doctores }: { liquidaciones: Liquidacion[]; doctores: Doctor[] }) {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>(init)
  const [filtro, setFiltro] = useState('TODAS')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ doctorId: '', mes: String(new Date().getMonth() + 1).padStart(2, '0'), anio: String(new Date().getFullYear()) })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const now = new Date()
  const anios = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  async function generar(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    const periodo = `${form.anio}-${form.mes}`
    const res = await fetch('/api/liquidaciones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doctorId: form.doctorId, periodo }) })
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Error al generar'); setSaving(false); return }
    const created = await res.json()
    setLiquidaciones((p) => [created, ...p])
    setSaving(false); setShowModal(false)
  }

  async function cambiarEstado(id: string, estado: string) {
    const data: any = { estado }
    if (estado === 'PAGADA') data.fechaPago = new Date().toISOString()
    const res = await fetch(`/api/liquidaciones/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const updated = await res.json()
    setLiquidaciones((p) => p.map((l) => l.id === updated.id ? { ...l, ...updated } : l))
  }

  const filtradas = liquidaciones.filter((l) => filtro === 'TODAS' || l.estado === filtro)
  const totalPagadoMes = liquidaciones.filter((l) => l.estado === 'PAGADA' && l.fechaPago && new Date(l.fechaPago).getMonth() === now.getMonth()).reduce((s, l) => s + l.totalLiquidado, 0)

  function formatPeriodo(p: string) {
    const [y, m] = p.split('-')
    return `${MESES[parseInt(m) - 1]} ${y}`
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Liquidaciones</h1>
          <p className="text-slate-500 text-sm mt-0.5">Honorarios calculados desde tratamientos completados</p>
        </div>
        <button onClick={() => { setForm({ doctorId: '', mes: String(now.getMonth() + 1).padStart(2,'0'), anio: String(now.getFullYear()) }); setError(''); setShowModal(true) }} className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          Generar liquidación
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total liquidaciones', value: liquidaciones.length },
          { label: 'Pagado este mes', value: formatCLP(totalPagadoMes) },
          { label: 'Pendientes de pago', value: liquidaciones.filter((l) => l.estado !== 'PAGADA').length },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {['TODAS', 'BORRADOR', 'APROBADA', 'PAGADA'].map((e) => (
          <button key={e} onClick={() => setFiltro(e)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filtro === e ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-cyan-400')}>
            {e === 'TODAS' ? 'Todas' : e} ({e === 'TODAS' ? liquidaciones.length : liquidaciones.filter((l) => l.estado === e).length})
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">No hay liquidaciones{filtro !== 'TODAS' ? ' con este estado' : ''}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Doctor', 'Período', 'Tratamientos', 'Total bruto', 'Honorarios', 'Estado', 'Acciones'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtradas.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{(l.doctor.name ?? l.doctor.email ?? '?')[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{l.doctor.name ?? l.doctor.email ?? '—'}</p>
                        <p className="text-xs text-slate-400">{l.doctor.especialidad ?? ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatPeriodo(l.periodo)}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{l._count.items}</td>
                  <td className="px-4 py-3 text-slate-600">{formatCLP(l.totalBruto)}</td>
                  <td className="px-4 py-3 font-bold text-cyan-700">{formatCLP(l.totalLiquidado)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ESTADO_STYLES[l.estado] ?? 'bg-slate-100 text-slate-600')}>{l.estado}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {l.estado === 'BORRADOR' && (
                        <button onClick={() => cambiarEstado(l.id, 'APROBADA')} className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">Aprobar</button>
                      )}
                      {l.estado === 'APROBADA' && (
                        <button onClick={() => cambiarEstado(l.id, 'PAGADA')} className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors">Marcar pagada</button>
                      )}
                      <button onClick={() => window.open(`/print/liquidacion?id=${l.id}`, '_blank')} className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50" title="Imprimir">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal generar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Generar liquidación</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
            </div>
            <form onSubmit={generar} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor *</label>
                <select required value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar doctor</option>
                  {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}{d.especialidad ? ` — ${d.especialidad}` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mes</label>
                  <select value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {MESES.map((m, i) => <option key={i} value={String(i + 1).padStart(2,'0')}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
                  <select value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-xs text-cyan-700">
                Se incluirán todos los tratamientos con estado <strong>COMPLETADO</strong> del doctor en el período seleccionado que no hayan sido liquidados anteriormente.
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">{saving ? 'Generando...' : 'Generar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
