'use client'

import { useState, useMemo } from 'react'
import { formatCLP, formatDate } from '@/lib/utils'

interface CobroItem { id: string; descripcion: string; monto: number; tratamientoId?: string | null }
interface MedioPago  { id: string; nombre: string; comision: number }
interface Cajero     { id: string; nombre: string }
interface Paciente   { id: string; nombre: string; apellido: string; rut: string | null }
interface Tratamiento {
  id: string; descripcion: string; monto: number
  pacienteId: string; paciente: string
  diente: number | null; fechaCompletado: string | null
}
interface Cobro {
  id: string; numero: number; concepto: string
  monto: number; montoNeto: number | null; comisionMonto: number | null
  estado: string; pacienteId: string; paciente: string
  medioPago: MedioPago | null; reciboUsuario: { id: string; nombre: string } | null
  fechaPago: string | null; createdAt: string; items: CobroItem[]
}

const ESTADO_STYLES: Record<string, string> = {
  PAGADO:   'bg-emerald-100 text-emerald-700',
  PENDIENTE:'bg-amber-100 text-amber-700',
  ANULADO:  'bg-red-100 text-red-700',
}

export function CobrosClient({
  cobros: initCobros, pacientes, mediosPago, cajeros, tratamientos,
}: {
  cobros:       Cobro[]
  pacientes:    Paciente[]
  mediosPago:   MedioPago[]
  cajeros:      Cajero[]
  tratamientos: Tratamiento[]
}) {
  const [cobros,       setCobros]       = useState<Cobro[]>(initCobros)
  const [showModal,    setShowModal]    = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)

  // form state
  const [pacienteId,      setPacienteId]      = useState('')
  const [selectedItems,   setSelectedItems]   = useState<Set<string>>(new Set())
  const [medioPagoId,     setMedioPagoId]     = useState('')
  const [reciboUsuarioId, setReciboUsuarioId] = useState('')
  const [notas,           setNotas]           = useState('')

  const pendingByPatient = useMemo(() => {
    const map: Record<string, Tratamiento[]> = {}
    for (const t of tratamientos) {
      if (!map[t.pacienteId]) map[t.pacienteId] = []
      map[t.pacienteId].push(t)
    }
    return map
  }, [tratamientos])

  const patientTratamientos = pacienteId ? (pendingByPatient[pacienteId] ?? []) : []

  const selectedMedio = mediosPago.find(m => m.id === medioPagoId)
  const subtotal = patientTratamientos
    .filter(t => selectedItems.has(t.id))
    .reduce((s, t) => s + t.monto, 0)
  const comision = selectedMedio ? subtotal * (selectedMedio.comision / 100) : 0
  const neto     = subtotal - comision

  function toggleItem(id: string) {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function openModal() {
    setPacienteId(''); setSelectedItems(new Set()); setMedioPagoId(''); setReciboUsuarioId(''); setNotas('')
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!pacienteId || selectedItems.size === 0) return
    setSaving(true)
    const items = patientTratamientos
      .filter(t => selectedItems.has(t.id))
      .map(t => ({
        tratamientoId: t.id,
        descripcion:   t.diente ? `${t.descripcion} (diente ${t.diente})` : t.descripcion,
        monto:         t.monto,
      }))
    const res = await fetch('/api/cobros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pacienteId, items, medioPagoId: medioPagoId || null, reciboUsuarioId: reciboUsuarioId || null, notas: notas || null }),
    })
    const created = await res.json()
    const paciente = pacientes.find(p => p.id === pacienteId)
    setCobros(prev => [{
      ...created,
      paciente:      `${paciente?.nombre} ${paciente?.apellido}`,
      medioPago:     selectedMedio ?? null,
      reciboUsuario: cajeros.find(c => c.id === reciboUsuarioId) ? { id: reciboUsuarioId, nombre: cajeros.find(c => c.id === reciboUsuarioId)!.nombre } : null,
      fechaPago:     created.fechaPago,
      createdAt:     created.createdAt,
    }, ...prev])
    setSaving(false); setShowModal(false)
  }

  const filtered = cobros.filter(c => filtroEstado === 'TODOS' || c.estado === filtroEstado)
  const totalPagado   = cobros.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + c.monto, 0)
  const totalNeto     = cobros.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + (c.montoNeto ?? c.monto), 0)
  const totalPendiente = cobros.filter(c => c.estado === 'PENDIENTE').reduce((s, c) => s + c.monto, 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cobros</h1>
          <p className="text-slate-500 text-sm mt-1">Registro de pagos por tratamientos completados</p>
        </div>
        <button onClick={openModal}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Registrar cobro
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Bruto cobrado',  value: formatCLP(totalPagado),   color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Neto recibido',  value: formatCLP(totalNeto),     color: 'text-teal-600',    bg: 'bg-teal-50' },
          { label: 'Por cobrar',     value: formatCLP(totalPendiente),color: 'text-amber-600',   bg: 'bg-amber-50' },
          { label: 'Total cobros',   value: String(cobros.length),    color: 'text-slate-700',   bg: 'bg-slate-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-5 border border-white`}>
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5">
        {['TODOS', 'PAGADO', 'PENDIENTE', 'ANULADO'].map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filtroEstado === e ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
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
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Fecha</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Método</th>
              <th className="text-right px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase">Bruto</th>
              <th className="text-right px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase hidden lg:table-cell">Neto</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-slate-500 uppercase">Estado</th>
              <th className="px-6 py-3.5 w-6"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400 text-sm">Sin cobros</td></tr>
            ) : filtered.map(c => (
              <>
                <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  <td className="px-6 py-4 text-sm text-slate-400 font-mono">#{c.numero}</td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-900">{c.paciente}</p>
                    {c.reciboUsuario && <p className="text-xs text-slate-400">Recibido por: {c.reciboUsuario.nombre}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 hidden md:table-cell">
                    {c.fechaPago ? formatDate(c.fechaPago) : formatDate(c.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 hidden md:table-cell">
                    {c.medioPago ? (
                      <span>{c.medioPago.nombre}{c.medioPago.comision > 0 && <span className="text-xs text-slate-400 ml-1">({c.medioPago.comision}%)</span>}</span>
                    ) : '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-semibold text-slate-900">{formatCLP(c.monto)}</td>
                  <td className="px-6 py-4 text-right text-sm hidden lg:table-cell">
                    {c.montoNeto != null && c.montoNeto !== c.monto ? (
                      <span className="text-teal-700 font-semibold">{formatCLP(c.montoNeto)}</span>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_STYLES[c.estado] ?? 'bg-slate-100 text-slate-600'}`}>{c.estado}</span>
                  </td>
                  <td className="px-6 py-4">
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expandedId === c.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </td>
                </tr>
                {expandedId === c.id && (
                  <tr key={`${c.id}-detail`} className="bg-slate-50">
                    <td colSpan={8} className="px-6 pb-4 pt-1">
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Detalle de tratamientos</p>
                        {c.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between bg-white rounded-xl border border-slate-100 px-4 py-2.5">
                            <span className="text-sm text-slate-700">{item.descripcion}</span>
                            <span className="text-sm font-semibold text-slate-900">{formatCLP(item.monto)}</span>
                          </div>
                        ))}
                        {c.comisionMonto != null && c.comisionMonto > 0 && (
                          <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-500">
                            <span>Comisión {c.medioPago?.nombre} ({c.medioPago?.comision}%)</span>
                            <span className="text-red-500">- {formatCLP(c.comisionMonto)}</span>
                          </div>
                        )}
                        {c.montoNeto != null && c.montoNeto !== c.monto && (
                          <div className="flex items-center justify-between px-4 py-2 font-semibold text-teal-700 border-t border-slate-100">
                            <span>Neto recibido</span>
                            <span>{formatCLP(c.montoNeto)}</span>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-lg font-semibold text-slate-900">Registrar cobro</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Paciente */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paciente *</label>
                <select required value={pacienteId}
                  onChange={e => { setPacienteId(e.target.value); setSelectedItems(new Set()) }}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar paciente</option>
                  {pacientes.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.apellido}, {p.nombre}{pendingByPatient[p.id]?.length ? ` (${pendingByPatient[p.id].length} trat. pendiente${pendingByPatient[p.id].length > 1 ? 's' : ''})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tratamientos del paciente */}
              {pacienteId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Tratamientos a cobrar *
                    {patientTratamientos.length === 0 && <span className="ml-2 text-xs text-amber-600 font-normal">Este paciente no tiene tratamientos completados pendientes de cobro</span>}
                  </label>
                  {patientTratamientos.length > 0 ? (
                    <div className="space-y-1.5">
                      {patientTratamientos.map(t => (
                        <label key={t.id} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${selectedItems.has(t.id) ? 'bg-cyan-50 border-cyan-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                          <div className="flex items-center gap-3">
                            <input type="checkbox" checked={selectedItems.has(t.id)} onChange={() => toggleItem(t.id)} className="w-4 h-4 accent-cyan-600 rounded" />
                            <div>
                              <p className="text-sm font-medium text-slate-900">{t.descripcion}{t.diente ? <span className="text-slate-400 font-normal"> · diente {t.diente}</span> : ''}</p>
                              {t.fechaCompletado && <p className="text-xs text-slate-400">{formatDate(t.fechaCompletado)}</p>}
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-slate-900 flex-shrink-0">{formatCLP(t.monto)}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                      No hay tratamientos completados sin cobrar para este paciente.
                    </div>
                  )}
                </div>
              )}

              {/* Medio de pago */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Medio de pago</label>
                {mediosPago.length === 0 ? (
                  <p className="text-xs text-amber-600">No hay medios de pago configurados. Agrega uno en Configuración.</p>
                ) : (
                  <select value={medioPagoId} onChange={e => setMedioPagoId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="">Sin especificar</option>
                    {mediosPago.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}{m.comision > 0 ? ` (${m.comision}% comisión)` : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Cajero */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Recibe el pago</label>
                {cajeros.length === 0 ? (
                  <p className="text-xs text-amber-600">Ningún usuario habilitado para recibir pagos. Activa el permiso en Usuarios.</p>
                ) : (
                  <select value={reciboUsuarioId} onChange={e => setReciboUsuarioId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="">Sin especificar</option>
                    {cajeros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones…"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>

              {/* Resumen financiero */}
              {selectedItems.size > 0 && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-1.5">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal ({selectedItems.size} tratamiento{selectedItems.size !== 1 ? 's' : ''})</span>
                    <span className="font-semibold">{formatCLP(subtotal)}</span>
                  </div>
                  {comision > 0 && (
                    <div className="flex justify-between text-sm text-red-500">
                      <span>Comisión {selectedMedio?.nombre} ({selectedMedio?.comision}%)</span>
                      <span>- {formatCLP(comision)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
                    <span>Neto a recibir</span>
                    <span className="text-teal-700">{formatCLP(neto)}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving || !pacienteId || selectedItems.size === 0}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-xl text-sm font-medium transition-colors">
                  {saving ? 'Guardando…' : `Registrar ${selectedItems.size > 0 ? formatCLP(subtotal) : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
