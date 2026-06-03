'use client'

import { useMemo, useState } from 'react'
import { formatCLP, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const ESTADO_STYLES: Record<string, string> = {
  BORRADOR: 'bg-amber-100 text-amber-700',
  APROBADA: 'bg-blue-100 text-blue-700',
  PAGADA: 'bg-emerald-100 text-emerald-700',
}
const ESTADO_LABEL: Record<string, string> = {
  BORRADOR: 'Borrador',
  APROBADA: 'Aprobada',
  PAGADA: 'Pagada',
}

interface Liquidacion {
  id: string
  doctorId: string
  periodo: string
  totalBruto: number
  totalLiquidado: number
  estado: string
  notas: string | null
  fechaPago: string | null
  createdAt: string
  doctor: { id: string; name: string | null; email: string | null; especialidad: string | null }
  contrato: { id: string; tipo: string; porcentaje: number | null; montoFijo: number | null }
  _count: { items: number }
}

interface Doctor { id: string; name: string | null; email: string | null; especialidad: string | null }

interface LiquidacionItemDetail {
  id: string
  prestacionNombre: string
  pacienteNombre: string
  diente: string | null
  fechaCompletado: string
  precioTratamiento: number
  porcentajeAplicado: number | null
  montoFijoAplicado: number | null
  montoLiquidado: number
}

function formatPeriodo(p: string) {
  const [y, m] = p.split('-')
  return `${MESES[parseInt(m) - 1]} ${y}`
}

export function LiquidacionesClient({
  liquidaciones: init, doctores, canManage, currentUserId,
}: {
  liquidaciones: Liquidacion[]
  doctores: Doctor[]
  canManage: boolean
  currentUserId: string
}) {
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>(init)

  // Filtros / acciones (sólo para gestores)
  const [filtroEstado, setFiltroEstado] = useState('TODAS')
  const [filtroDoctor, setFiltroDoctor] = useState('TODOS')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    doctorId: '',
    mes: String(new Date().getMonth() + 1).padStart(2, '0'),
    anio: String(new Date().getFullYear()),
  })
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState('')

  // Modal de detalle (items)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [detalleItems, setDetalleItems] = useState<LiquidacionItemDetail[] | null>(null)
  const [detalleLoading, setDetalleLoading] = useState(false)
  const [detalleError, setDetalleError] = useState('')

  const now = new Date()
  const anios = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  async function generar(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setCreateError('')
    const periodo = `${form.anio}-${form.mes}`
    try {
      const res = await fetch('/api/liquidaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId: form.doctorId, periodo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setCreateError(data.error ?? 'Error al generar'); return }
      // Normalizar al shape esperado por la tabla. El API ahora devuelve _count,
      // pero por seguridad lo derivamos del array items si no viniera.
      const itemsArr = Array.isArray(data.items) ? data.items : []
      const created: Liquidacion = {
        id: data.id,
        doctorId: data.doctorId,
        periodo: data.periodo,
        totalBruto: data.totalBruto,
        totalLiquidado: data.totalLiquidado,
        estado: data.estado,
        notas: data.notas ?? null,
        fechaPago: data.fechaPago ?? null,
        createdAt: data.createdAt,
        doctor: data.doctor,
        contrato: {
          id: data.contrato?.id ?? '',
          tipo: data.contrato?.tipo ?? '',
          porcentaje: data.contrato?.porcentaje ?? null,
          montoFijo: data.contrato?.montoFijo ?? null,
        },
        _count: { items: data._count?.items ?? itemsArr.length },
      }
      setLiquidaciones((p) => [created, ...p])
      setShowCreate(false)
    } finally { setSaving(false) }
  }

  async function cambiarEstado(id: string, estado: string) {
    const payload: Record<string, unknown> = { estado }
    if (estado === 'PAGADA') payload.fechaPago = new Date().toISOString()
    const res = await fetch(`/api/liquidaciones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const updated = await res.json().catch(() => ({}))
    if (!res.ok) return
    setLiquidaciones((prev) => prev.map((l) => l.id === updated.id ? {
      ...l,
      estado: updated.estado,
      notas: updated.notas,
      fechaPago: updated.fechaPago ?? null,
    } : l))
  }

  async function abrirDetalle(id: string) {
    setDetalleId(id); setDetalleItems(null); setDetalleError(''); setDetalleLoading(true)
    try {
      const res = await fetch(`/api/liquidaciones/${id}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setDetalleError(data.error ?? 'No se pudo cargar el detalle'); return }
      const items: LiquidacionItemDetail[] = (data.items ?? []).map((i: any) => ({
        id: i.id,
        prestacionNombre: i.prestacionNombre,
        pacienteNombre: i.pacienteNombre,
        diente: i.diente,
        fechaCompletado: typeof i.fechaCompletado === 'string' ? i.fechaCompletado : new Date(i.fechaCompletado).toISOString(),
        precioTratamiento: i.precioTratamiento,
        porcentajeAplicado: i.porcentajeAplicado,
        montoFijoAplicado: i.montoFijoAplicado,
        montoLiquidado: i.montoLiquidado,
      }))
      setDetalleItems(items)
    } finally { setDetalleLoading(false) }
  }

  function cerrarDetalle() {
    setDetalleId(null); setDetalleItems(null); setDetalleError('')
  }

  const detalleLiquidacion = useMemo(
    () => liquidaciones.find((l) => l.id === detalleId) ?? null,
    [detalleId, liquidaciones],
  )

  // Filtrado para vista gestor
  const filtradas = useMemo(() => {
    return liquidaciones.filter((l) => {
      if (filtroEstado !== 'TODAS' && l.estado !== filtroEstado) return false
      if (filtroDoctor !== 'TODOS' && l.doctorId !== filtroDoctor) return false
      return true
    })
  }, [liquidaciones, filtroEstado, filtroDoctor])

  // Vista para doctor (no canManage): sus liquidaciones, destacando las abiertas
  const misLiquidaciones = useMemo(
    () => liquidaciones.filter((l) => l.doctorId === currentUserId),
    [liquidaciones, currentUserId],
  )
  const misPendientes = misLiquidaciones.filter((l) => l.estado !== 'PAGADA')
  const misPagadas = misLiquidaciones.filter((l) => l.estado === 'PAGADA')

  const totalPagadoMes = liquidaciones
    .filter((l) => l.estado === 'PAGADA' && l.fechaPago && new Date(l.fechaPago).getMonth() === now.getMonth())
    .reduce((s, l) => s + l.totalLiquidado, 0)

  // ==========================================================================
  //   VISTA DOCTOR (sólo lectura sobre sus propias liquidaciones)
  // ==========================================================================
  if (!canManage) {
    return (
      <div className="p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mis liquidaciones</h1>
          <p className="text-slate-500 text-sm mt-0.5">Honorarios calculados por la administración a partir de tus tratamientos completados</p>
        </div>

        {/* Mis liquidaciones abiertas / pendientes */}
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Pendientes de pago</h2>
          {misPendientes.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
              <p className="text-slate-500 text-sm">No tienes liquidaciones abiertas. La administración generará una cuando corresponda al cierre del período.</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {misPendientes.map((l) => (
                <DoctorLiquidacionCard key={l.id} liquidacion={l} onVerDetalle={() => abrirDetalle(l.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Historial pagadas */}
        {misPagadas.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Pagadas</h2>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Período</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pagada</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tratamientos</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Honorarios</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {misPagadas.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-700 font-medium">{formatPeriodo(l.periodo)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{l.fechaPago ? formatDate(l.fechaPago) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-600 font-mono">{l._count?.items ?? 0}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-emerald-700 font-mono">{formatCLP(l.totalLiquidado)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => abrirDetalle(l.id)}
                          className="text-[11px] text-cyan-600 hover:underline mr-3">Ver detalle</button>
                        <button onClick={() => window.open(`/print/liquidacion?id=${l.id}`, '_blank')}
                          className="text-[11px] text-slate-500 hover:underline">Imprimir</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {detalleId && (
          <DetalleModal
            liquidacion={detalleLiquidacion}
            items={detalleItems}
            loading={detalleLoading}
            error={detalleError}
            onClose={cerrarDetalle}
          />
        )}
      </div>
    )
  }

  // ==========================================================================
  //   VISTA GESTOR (admin / puedeGestionarLiquidaciones)
  // ==========================================================================
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Liquidaciones</h1>
          <p className="text-slate-500 text-sm mt-0.5">Honorarios calculados desde tratamientos completados</p>
        </div>
        <button onClick={() => { setForm({ doctorId: '', mes: String(now.getMonth() + 1).padStart(2,'0'), anio: String(now.getFullYear()) }); setCreateError(''); setShowCreate(true) }}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
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
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5">
          {['TODAS', 'BORRADOR', 'APROBADA', 'PAGADA'].map((e) => (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filtroEstado === e ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-cyan-400')}>
              {e === 'TODAS' ? 'Todas' : (ESTADO_LABEL[e] ?? e)}
              {' '}
              ({e === 'TODAS' ? liquidaciones.length : liquidaciones.filter((l) => l.estado === e).length})
            </button>
          ))}
        </div>
        {doctores.length > 1 && (
          <select value={filtroDoctor} onChange={(e) => setFiltroDoctor(e.target.value)}
            className="ml-auto px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="TODOS">Todos los doctores</option>
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>{d.name ?? d.email}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            {liquidaciones.length === 0
              ? 'Aún no hay liquidaciones generadas. Usa "Generar liquidación" para crear la primera.'
              : 'Ninguna liquidación coincide con los filtros aplicados.'}
          </div>
        ) : (
          <div className="table-scroll">
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
                    <td className="px-4 py-3 text-center text-slate-600">{l._count?.items ?? 0}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono">{formatCLP(l.totalBruto)}</td>
                    <td className="px-4 py-3 font-bold text-cyan-700 font-mono">{formatCLP(l.totalLiquidado)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ESTADO_STYLES[l.estado] ?? 'bg-slate-100 text-slate-600')}>
                        {ESTADO_LABEL[l.estado] ?? l.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => abrirDetalle(l.id)}
                          className="px-2.5 py-1 text-xs font-medium bg-cyan-50 text-cyan-700 hover:bg-cyan-100 rounded-lg transition-colors">
                          Ver detalle
                        </button>
                        {l.estado === 'BORRADOR' && (
                          <button onClick={() => cambiarEstado(l.id, 'APROBADA')}
                            className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">Aprobar</button>
                        )}
                        {l.estado === 'APROBADA' && (
                          <button onClick={() => cambiarEstado(l.id, 'PAGADA')}
                            className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors">Marcar pagada</button>
                        )}
                        <button onClick={() => window.open(`/print/liquidacion?id=${l.id}`, '_blank')}
                          className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50" title="Imprimir">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal generar */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Generar liquidación</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={generar} className="p-6 space-y-4">
              {createError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">{createError}</div>}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor *</label>
                <select required value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar doctor</option>
                  {doctores.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name ?? d.email}{d.especialidad ? ` — ${d.especialidad}` : ''}
                    </option>
                  ))}
                </select>
                {doctores.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">No hay doctores con contrato activo. Crea un contrato primero.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mes</label>
                  <select value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {MESES.map((m, i) => <option key={i} value={String(i + 1).padStart(2,'0')}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Año</label>
                  <select value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
              <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-xs text-cyan-700">
                Se incluyen todos los tratamientos en estado <strong>COMPLETADO</strong> del doctor en el período seleccionado, que no estén ya en otra liquidación.
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving || !form.doctorId}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Generando…' : 'Generar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalleId && (
        <DetalleModal
          liquidacion={detalleLiquidacion}
          items={detalleItems}
          loading={detalleLoading}
          error={detalleError}
          onClose={cerrarDetalle}
        />
      )}
    </div>
  )
}

function DoctorLiquidacionCard({ liquidacion: l, onVerDetalle }: { liquidacion: Liquidacion; onVerDetalle: () => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Período</p>
          <p className="text-lg font-bold text-slate-900">{formatPeriodo(l.periodo)}</p>
        </div>
        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', ESTADO_STYLES[l.estado] ?? 'bg-slate-100 text-slate-600')}>
          {ESTADO_LABEL[l.estado] ?? l.estado}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Tratamientos</p>
          <p className="text-sm font-mono text-slate-800 mt-0.5">{l._count?.items ?? 0}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5">
          <p className="text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Total bruto</p>
          <p className="text-sm font-mono text-slate-800 mt-0.5">{formatCLP(l.totalBruto)}</p>
        </div>
      </div>
      <div className="bg-cyan-50 border border-cyan-100 rounded-lg p-3 mb-4">
        <p className="text-cyan-700 uppercase tracking-wide text-[10px] font-semibold">Tus honorarios</p>
        <p className="text-2xl font-bold text-cyan-800 font-mono mt-0.5">{formatCLP(l.totalLiquidado)}</p>
        {l.contrato?.tipo === 'PORCENTAJE' && l.contrato.porcentaje != null && (
          <p className="text-[11px] text-cyan-600 mt-1">Calculado al {l.contrato.porcentaje}% del total bruto.</p>
        )}
        {l.contrato?.tipo === 'MONTO_FIJO' && l.contrato.montoFijo != null && (
          <p className="text-[11px] text-cyan-600 mt-1">{formatCLP(l.contrato.montoFijo)} por tratamiento.</p>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onVerDetalle}
          className="flex-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium">
          Ver detalle
        </button>
        <button onClick={() => window.open(`/print/liquidacion?id=${l.id}`, '_blank')}
          className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">
          Imprimir
        </button>
      </div>
    </div>
  )
}

function DetalleModal({
  liquidacion, items, loading, error, onClose,
}: {
  liquidacion: Liquidacion | null
  items: LiquidacionItemDetail[] | null
  loading: boolean
  error: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Detalle de liquidación
              {liquidacion && ` · ${formatPeriodo(liquidacion.periodo)}`}
            </h2>
            {liquidacion && (
              <p className="text-xs text-slate-500 mt-0.5">
                {liquidacion.doctor.name ?? liquidacion.doctor.email}
                {liquidacion.doctor.especialidad ? ` · ${liquidacion.doctor.especialidad}` : ''}
                {' · '}
                <span className={cn('inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold', ESTADO_STYLES[liquidacion.estado] ?? 'bg-slate-100 text-slate-600')}>
                  {ESTADO_LABEL[liquidacion.estado] ?? liquidacion.estado}
                </span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {liquidacion && (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Total bruto</p>
                <p className="font-mono text-slate-800 mt-1">{formatCLP(liquidacion.totalBruto)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Tratamientos</p>
                <p className="font-mono text-slate-800 mt-1">{liquidacion._count?.items ?? items?.length ?? 0}</p>
              </div>
              <div className="bg-cyan-50 rounded-xl p-3">
                <p className="text-[10px] font-semibold text-cyan-700 uppercase">Honorarios</p>
                <p className="font-mono text-cyan-800 font-bold mt-1">{formatCLP(liquidacion.totalLiquidado)}</p>
              </div>
            </div>
          )}

          {liquidacion?.contrato && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
              Contrato:{' '}
              {liquidacion.contrato.tipo === 'PORCENTAJE'
                ? `${liquidacion.contrato.porcentaje}% sobre tratamientos`
                : `${formatCLP(liquidacion.contrato.montoFijo ?? 0)} por tratamiento`}
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">{error}</div>
          )}

          {loading && (
            <div className="text-center text-sm text-slate-400 py-12">Cargando detalle…</div>
          )}

          {!loading && !error && items && (
            items.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-12">Esta liquidación no tiene tratamientos asociados.</div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Paciente</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Prestación</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pieza</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Precio</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Honorario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-500 font-mono">{formatDate(it.fechaCompletado)}</td>
                        <td className="px-3 py-2 text-slate-700">{it.pacienteNombre}</td>
                        <td className="px-3 py-2 text-slate-700">{it.prestacionNombre}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{it.diente ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-600 font-mono">{formatCLP(it.precioTratamiento)}</td>
                        <td className="px-3 py-2 text-right text-sm text-cyan-700 font-bold font-mono">{formatCLP(it.montoLiquidado)}</td>
                      </tr>
                    ))}
                    <tr className="bg-cyan-50/40 border-t border-cyan-100">
                      <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-slate-700 text-right">Total honorarios</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-cyan-800 font-mono">
                        {formatCLP(items.reduce((s, i) => s + i.montoLiquidado, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3 flex justify-end gap-2 bg-white">
          {liquidacion && (
            <button onClick={() => window.open(`/print/liquidacion?id=${liquidacion.id}`, '_blank')}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50">
              Imprimir
            </button>
          )}
          <button onClick={onClose}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
