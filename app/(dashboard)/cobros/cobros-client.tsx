'use client'

import { useState, useMemo } from 'react'
import { formatCLP, formatDate, formatRUT } from '@/lib/utils'
import { CobrosSubNav } from './sub-nav'

interface CobroItem { id: string; descripcion: string; monto: number; tratamientoId?: string | null }
interface MedioPago  { id: string; nombre: string; comision: number }
interface Cajero     { id: string; nombre: string | null }
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
  medioPago: MedioPago | null; reciboUsuario: { id: string; nombre: string | null } | null
  fechaPago: string | null; createdAt: string; items: CobroItem[]
  notas: string | null
  anulado: boolean
  motivoAnulacion: string | null
  anuladoAt: string | null
  anuladoPorNombre: string | null
}

const ESTADO_STYLES: Record<string, string> = {
  PAGADO:   'bg-emerald-100 text-emerald-700',
  PENDIENTE:'bg-amber-100 text-amber-700',
  ANULADO:  'bg-red-100 text-red-700',
}

export function CobrosClient({
  cobros: initCobros, pacientes, mediosPago, cajeros, tratamientos, cajas, canEditPayments, canReceivePayments,
}: {
  cobros:       Cobro[]
  pacientes:    Paciente[]
  mediosPago:   MedioPago[]
  cajeros:      Cajero[]
  tratamientos: Tratamiento[]
  cajas:        { id: string; nombre: string }[]
  canEditPayments: boolean
  canReceivePayments: boolean
}) {
  const [cobros,       setCobros]       = useState<Cobro[]>(initCobros)
  const [showModal,    setShowModal]    = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [formError,    setFormError]    = useState('')

  // Caja seleccionada y búsqueda de paciente
  const [cajaId, setCajaId] = useState<string>(cajas[0]?.id ?? '')
  const [search, setSearch] = useState('')

  // Filtro búsqueda en tabla de cobros
  const [searchCobros, setSearchCobros] = useState('')

  // Anulación
  const [anulando,        setAnulando]        = useState<Cobro | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [anularError,     setAnularError]     = useState('')

  // Edición
  const [editing,    setEditing]    = useState<Cobro | null>(null)
  const [editForm,   setEditForm]   = useState({ concepto: '', monto: '', notas: '', fechaPago: '', medioPagoId: '' })
  const [editError,  setEditError]  = useState('')

  // Resultados de la búsqueda de paciente en el modal de nuevo cobro
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return pacientes
      .filter(p =>
        `${p.nombre} ${p.apellido}`.toLowerCase().includes(q) ||
        (p.rut ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [search, pacientes])

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
    setSearch(''); setFormError('')
    if (!cajaId && cajas.length > 0) setCajaId(cajas[0].id)
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!pacienteId) { setFormError('Selecciona un paciente.'); return }
    if (!cajaId) { setFormError('Selecciona una caja.'); return }
    if (selectedItems.size === 0) { setFormError('Marca al menos un tratamiento.'); return }
    setSaving(true)
    try {
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
        body: JSON.stringify({
          pacienteId, items, cajaId,
          medioPagoId: medioPagoId || null,
          reciboUsuarioId: reciboUsuarioId || null,
          notas: notas || null,
        }),
      })
      const created = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(created.error ?? `Error ${res.status}`); return }
      const paciente = pacientes.find(p => p.id === pacienteId)
      setCobros(prev => [{
        ...created,
        paciente:      `${paciente?.nombre} ${paciente?.apellido}`,
        medioPago:     selectedMedio ?? null,
        reciboUsuario: cajeros.find(c => c.id === reciboUsuarioId) ? { id: reciboUsuarioId, nombre: cajeros.find(c => c.id === reciboUsuarioId)!.nombre } : null,
        fechaPago:     created.fechaPago,
        createdAt:     created.createdAt,
      }, ...prev])
      setShowModal(false)
    } finally { setSaving(false) }
  }

  // ── Editar ────────────────────────────────────────────────────────────
  function openEdit(c: Cobro) {
    setEditing(c)
    setEditError('')
    setEditForm({
      concepto:    c.concepto ?? '',
      monto:       String(c.monto ?? ''),
      notas:       c.notas ?? '',
      fechaPago:   c.fechaPago ? c.fechaPago.slice(0, 10) : '',
      medioPagoId: c.medioPago?.id ?? '',
    })
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true); setEditError('')
    try {
      const payload: Record<string, unknown> = {
        concepto:    editForm.concepto,
        monto:       Number(editForm.monto),
        notas:       editForm.notas || null,
        fechaPago:   editForm.fechaPago || null,
        medioPagoId: editForm.medioPagoId || null,
      }
      const res = await fetch(`/api/cobros/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setEditError(data.error ?? `Error ${res.status}`); return }
      const medio = mediosPago.find(m => m.id === payload.medioPagoId) ?? null
      setCobros(prev => prev.map(c => c.id === editing.id ? {
        ...c,
        concepto: data.concepto ?? c.concepto,
        monto: data.monto ?? c.monto,
        montoNeto: data.montoNeto ?? c.montoNeto,
        notas: data.notas ?? null,
        fechaPago: data.fechaPago ?? c.fechaPago,
        medioPago: medio ? { id: medio.id, nombre: medio.nombre, comision: medio.comision } : null,
      } : c))
      setEditing(null)
    } finally { setSaving(false) }
  }

  // ── Anular ────────────────────────────────────────────────────────────
  function openAnular(c: Cobro) {
    setAnulando(c); setMotivoAnulacion(''); setAnularError('')
  }

  async function confirmAnular(e: React.FormEvent) {
    e.preventDefault()
    if (!anulando) return
    if (motivoAnulacion.trim().length < 4) {
      setAnularError('Indica un motivo (mínimo 4 caracteres).')
      return
    }
    setSaving(true); setAnularError('')
    try {
      const res = await fetch(`/api/cobros/${anulando.id}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoAnulacion.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAnularError(data.error ?? `Error ${res.status}`); return }
      setCobros(prev => prev.map(c => c.id === anulando.id ? {
        ...c,
        estado: 'ANULADO',
        anulado: true,
        motivoAnulacion: data.motivoAnulacion,
        anuladoAt: data.anuladoAt,
        anuladoPorNombre: data.anuladoPorNombre,
      } : c))
      setAnulando(null)
    } finally { setSaving(false) }
  }

  function printCobro(id: string) {
    window.open(`/print/cobro/${id}`, '_blank')
  }

  const filtered = cobros.filter(c => {
    if (filtroEstado !== 'TODOS' && c.estado !== filtroEstado) return false
    const q = searchCobros.trim().toLowerCase()
    if (!q) return true
    return c.paciente.toLowerCase().includes(q) || String(c.numero).includes(q)
  })
  const totalPagado   = cobros.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + c.monto, 0)
  const totalNeto     = cobros.filter(c => c.estado === 'PAGADO').reduce((s, c) => s + (c.montoNeto ?? c.monto), 0)
  const totalPendiente = cobros.filter(c => c.estado === 'PENDIENTE').reduce((s, c) => s + c.monto, 0)

  const newCobroDisabled = !canReceivePayments || cajas.length === 0
  const newCobroDisabledTitle = !canReceivePayments
    ? 'No tienes permiso para recibir pagos (pídelo al admin)'
    : cajas.length === 0
      ? 'No tienes cajas asignadas (pídelo al admin)'
      : ''

  return (
    <div className="p-8">
      <CobrosSubNav />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cobros</h1>
          <p className="text-slate-500 text-sm mt-1">Registro de pagos por tratamientos completados</p>
        </div>
        <button
          onClick={openModal}
          disabled={newCobroDisabled}
          title={newCobroDisabledTitle}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
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

      {/* Filtros + búsqueda */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        {['TODOS', 'PAGADO', 'PENDIENTE', 'ANULADO'].map(e => (
          <button key={e} onClick={() => setFiltroEstado(e)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filtroEstado === e ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {e === 'TODOS' ? 'Todos' : e.charAt(0) + e.slice(1).toLowerCase()}
          </button>
        ))}
        <div className="ml-auto relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
          </svg>
          <input
            type="search" value={searchCobros}
            onChange={e => setSearchCobros(e.target.value)}
            placeholder="Buscar paciente o N° cobro…"
            className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="table-scroll">
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
                        {c.notas && (
                          <div className="bg-white rounded-xl border border-slate-100 px-4 py-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-400 uppercase mr-2">Notas:</span>{c.notas}
                          </div>
                        )}

                        {/* Bloque de anulación */}
                        {c.anulado && (
                          <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mt-2 space-y-1">
                            <p className="text-xs font-bold text-rose-700 uppercase tracking-wide">Cobro anulado</p>
                            <p className="text-sm text-rose-700"><span className="font-semibold">Motivo:</span> {c.motivoAnulacion ?? '—'}</p>
                            <p className="text-[11px] text-rose-500">
                              Por {c.anuladoPorNombre ?? '—'}{c.anuladoAt ? ` · ${formatDate(c.anuladoAt)}` : ''}
                            </p>
                          </div>
                        )}

                        {/* Acciones */}
                        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200">
                          <button
                            onClick={(e) => { e.stopPropagation(); printCobro(c.id) }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Imprimir comprobante
                          </button>
                          {canEditPayments && !c.anulado && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(c) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Editar
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); openAnular(c) }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                Anular
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
        </div>
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
              {/* Paciente: buscador */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paciente *</label>
                {pacienteId ? (
                  (() => {
                    const p = pacientes.find(x => x.id === pacienteId)
                    return (
                      <div className="flex items-center gap-2 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2.5">
                        <svg className="w-4 h-4 text-cyan-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-cyan-900">{p?.nombre} {p?.apellido}</p>
                          {p?.rut && <p className="text-xs text-cyan-600 font-mono">{formatRUT(p.rut)}</p>}
                        </div>
                        <button type="button" onClick={() => { setPacienteId(''); setSelectedItems(new Set()); setSearch('') }}
                          className="text-cyan-400 hover:text-cyan-600 text-xs font-medium">Cambiar</button>
                      </div>
                    )
                  })()
                ) : (
                  <div className="relative">
                    <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
                    </svg>
                    <input
                      type="search" value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar por nombre o RUT…"
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-72 overflow-y-auto">
                        {searchResults.map(p => {
                          const pendientes = pendingByPatient[p.id]?.length ?? 0
                          return (
                            <button key={p.id} type="button"
                              onClick={() => { setPacienteId(p.id); setSelectedItems(new Set()); setSearch('') }}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{p.nombre} {p.apellido}</p>
                                  <p className="text-xs text-slate-500 font-mono">{p.rut ? formatRUT(p.rut) : 'Sin RUT'}</p>
                                </div>
                                {pendientes > 0 && (
                                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                    {pendientes} pend.
                                  </span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {search.length >= 2 && searchResults.length === 0 && (
                      <p className="text-xs text-slate-400 mt-1">Sin coincidencias.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Caja */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Caja *</label>
                <select required value={cajaId} onChange={e => setCajaId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  {cajas.length === 0 && <option value="">— Sin cajas —</option>}
                  {cajas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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

              {formError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{formError}</div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving || !pacienteId || !cajaId || selectedItems.size === 0}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-xl text-sm font-medium transition-colors">
                  {saving ? 'Guardando…' : `Registrar ${selectedItems.size > 0 ? formatCLP(subtotal) : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Editar cobro ─────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Editar cobro #{editing.numero}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{editing.paciente}</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto</label>
                <input value={editForm.concepto}
                  onChange={e => setEditForm({ ...editForm, concepto: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto bruto (CLP)</label>
                  <input type="number" min="0" step="1" value={editForm.monto}
                    onChange={e => setEditForm({ ...editForm, monto: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de pago</label>
                  <input type="date" value={editForm.fechaPago}
                    onChange={e => setEditForm({ ...editForm, fechaPago: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Medio de pago</label>
                <select value={editForm.medioPagoId}
                  onChange={e => setEditForm({ ...editForm, medioPagoId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Sin especificar</option>
                  {mediosPago.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}{m.comision > 0 ? ` (${m.comision}%)` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <input value={editForm.notas}
                  onChange={e => setEditForm({ ...editForm, notas: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              {editError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{editError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Anular cobro ─────────────────────────────────────────── */}
      {anulando && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-rose-50">
              <div>
                <h2 className="text-lg font-semibold text-rose-900">Anular cobro #{anulando.numero}</h2>
                <p className="text-sm text-rose-700 mt-0.5">{anulando.paciente} · {formatCLP(anulando.monto)}</p>
              </div>
              <button onClick={() => setAnulando(null)} className="text-rose-400 hover:text-rose-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={confirmAnular} className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Al anular el cobro queda registrado en la auditoría con tu nombre y la fecha. Indica un motivo claro: este texto se conservará para siempre.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de la anulación *</label>
                <textarea required value={motivoAnulacion} rows={3}
                  onChange={e => setMotivoAnulacion(e.target.value)}
                  placeholder="Ej: error al registrar el monto, pago duplicado, etc."
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              {anularError && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{anularError}</div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setAnulando(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={saving || motivoAnulacion.trim().length < 4}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Anulando…' : 'Confirmar anulación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
