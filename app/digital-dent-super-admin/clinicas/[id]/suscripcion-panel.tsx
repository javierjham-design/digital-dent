'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ESTADO_PAGO_LABEL, METODO_PAGO_OPCIONES, type EstadoPago } from '@/lib/billing'

type Pago = {
  id: string
  fechaPago: string
  monto: number
  periodoDesde: string
  periodoHasta: string
  metodoPago: string
  comprobante: string | null
  notas: string | null
}

export type SuscripcionData = {
  id: string
  plan: string
  activo: boolean
  trialHasta: string | null
  proximoCobro: string | null
  cicloFacturacion: string | null
  precioAcordado: number | null
  precioMensual: number
  estadoPago: EstadoPago
  pagos: Pago[]
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

const fmtFecha = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtInputDate = (iso: string | null) => {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

const ESTADO_COLOR: Record<EstadoPago, string> = {
  TRIAL: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  AL_DIA: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  ATRASADO: 'bg-rose-500/15 text-rose-300 border border-rose-500/30',
  SUSPENDIDO: 'bg-slate-700 text-slate-300 border border-slate-600',
}

export function SuscripcionPanel({
  data,
  planesDisponibles,
}: {
  data: SuscripcionData
  planesDisponibles: { id: string; nombre: string; precioMensual: number }[]
}) {
  const planPriceMap: Record<string, number> = {}
  for (const p of planesDisponibles) planPriceMap[p.id] = p.precioMensual
  const router = useRouter()
  const [modal, setModal] = useState<null | 'plan' | 'trial' | 'pago'>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // --- form: cambiar plan ---
  const [planForm, setPlanForm] = useState({
    plan: data.plan,
    cicloFacturacion: data.cicloFacturacion ?? 'MENSUAL',
    precioAcordadoStr: data.precioAcordado != null ? String(data.precioAcordado) : '',
    proximoCobro: fmtInputDate(data.proximoCobro),
  })

  // --- form: extender trial ---
  const [trialForm, setTrialForm] = useState({ dias: 30, customFecha: '' })

  // --- form: registrar pago ---
  const sugeridoMonto = data.cicloFacturacion === 'ANUAL' ? data.precioMensual * 12 : data.precioMensual
  const [pagoForm, setPagoForm] = useState({
    montoStr: sugeridoMonto > 0 ? String(sugeridoMonto) : '',
    fechaPago: new Date().toISOString().slice(0, 10),
    metodoPago: 'TRANSFERENCIA',
    comprobante: '',
    notas: '',
  })

  function openPlan() {
    setPlanForm({
      plan: data.plan,
      cicloFacturacion: data.cicloFacturacion ?? 'MENSUAL',
      precioAcordadoStr: data.precioAcordado != null ? String(data.precioAcordado) : '',
      proximoCobro: fmtInputDate(data.proximoCobro),
    })
    setErr(''); setModal('plan')
  }

  function openTrial() {
    setTrialForm({ dias: 30, customFecha: '' })
    setErr(''); setModal('trial')
  }

  function openPago() {
    setPagoForm({
      montoStr: sugeridoMonto > 0 ? String(sugeridoMonto) : '',
      fechaPago: new Date().toISOString().slice(0, 10),
      metodoPago: 'TRANSFERENCIA',
      comprobante: '',
      notas: '',
    })
    setErr(''); setModal('pago')
  }

  async function submitPlan() {
    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = {
        plan: planForm.plan,
        cicloFacturacion: planForm.cicloFacturacion,
      }
      if (planForm.precioAcordadoStr.trim() === '') body.precioAcordado = null
      else {
        const n = Number(planForm.precioAcordadoStr)
        if (!Number.isFinite(n) || n < 0) { setErr('Precio acordado inválido'); setSaving(false); return }
        body.precioAcordado = n
      }
      if (planForm.proximoCobro) body.proximoCobro = planForm.proximoCobro

      const res = await fetch(`/api/admin/clinicas/${data.id}/cambiar-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `Error ${res.status}`)
        return
      }
      setModal(null)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function submitTrial() {
    setSaving(true); setErr('')
    try {
      const body: Record<string, unknown> = {}
      if (trialForm.customFecha) body.nuevoVencimiento = trialForm.customFecha
      else body.dias = trialForm.dias

      const res = await fetch(`/api/admin/clinicas/${data.id}/extender-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `Error ${res.status}`)
        return
      }
      setModal(null)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function submitPago() {
    setSaving(true); setErr('')
    try {
      const monto = Number(pagoForm.montoStr)
      if (!Number.isFinite(monto) || monto <= 0) { setErr('Monto inválido'); setSaving(false); return }

      const res = await fetch(`/api/admin/clinicas/${data.id}/pagos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto,
          fechaPago: pagoForm.fechaPago,
          metodoPago: pagoForm.metodoPago,
          comprobante: pagoForm.comprobante || undefined,
          notas: pagoForm.notas || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `Error ${res.status}`)
        return
      }
      setModal(null)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function anularPago(pagoId: string) {
    if (!confirm('¿Anular este pago? Se recalculará la fecha del próximo cobro.')) return
    const res = await fetch(`/api/admin/clinicas/${data.id}/pagos/${pagoId}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(`Error: ${j.error ?? res.status}`)
      return
    }
    router.refresh()
  }

  const diasHasta = (iso: string | null) => {
    if (!iso) return null
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
  }
  const refFecha = data.plan === 'TRIAL' ? data.trialHasta : data.proximoCobro
  const dias = diasHasta(refFecha)

  return (
    <>
      <section className="bg-gradient-to-br from-purple-500/10 to-fuchsia-500/10 border border-purple-500/30 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
          <h2 className="font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Suscripción a la plataforma
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button onClick={openPlan} className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 rounded-lg text-xs font-medium">
              Cambiar plan
            </button>
            <button onClick={openTrial} className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/40 rounded-lg text-xs font-medium">
              Extender trial
            </button>
            <button onClick={openPago} className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 rounded-lg text-xs font-medium">
              Registrar pago
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-purple-300/70">Plan</p>
            <p className="text-2xl font-bold mt-1">{data.plan}</p>
            <p className="text-xs text-purple-300/60">{data.cicloFacturacion === 'ANUAL' ? 'Facturación anual' : 'Facturación mensual'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-purple-300/70">Precio mensual</p>
            <p className="text-2xl font-bold mt-1">{data.precioMensual > 0 ? fmtCLP(data.precioMensual) : 'Sin cobro'}</p>
            {data.precioAcordado != null && (
              <p className="text-xs text-purple-300/70 mt-0.5">acordado (override)</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-purple-300/70">Estado</p>
            <span className={`mt-1 inline-block px-2.5 py-1 rounded-full text-sm font-medium ${ESTADO_COLOR[data.estadoPago]}`}>
              {ESTADO_PAGO_LABEL[data.estadoPago]}
            </span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-purple-300/70">
              {data.plan === 'TRIAL' ? 'Trial vence' : 'Próximo cobro'}
            </p>
            <p className="text-lg font-semibold mt-1">{fmtFecha(refFecha)}</p>
            {dias != null && (
              <p className={`text-xs mt-0.5 ${dias < 0 ? 'text-rose-300' : dias <= 7 ? 'text-amber-300' : 'text-purple-300/70'}`}>
                {dias < 0 ? `Vencido hace ${Math.abs(dias)} días` : dias === 0 ? 'Hoy' : `En ${dias} días`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Historial de pagos */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Historial de pagos recibidos
        </h2>
        {data.pagos.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">Aún no se han registrado pagos para esta clínica.</p>
        ) : (
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left py-2.5">Fecha</th>
                <th className="text-right py-2.5">Monto</th>
                <th className="text-left py-2.5">Método</th>
                <th className="text-left py-2.5">Período cubierto</th>
                <th className="text-left py-2.5">Comprobante</th>
                <th className="py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.pagos.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/30">
                  <td className="py-3 text-slate-300">{fmtFecha(p.fechaPago)}</td>
                  <td className="py-3 text-right font-mono text-emerald-300">{fmtCLP(p.monto)}</td>
                  <td className="py-3 text-slate-400 text-xs">{p.metodoPago}</td>
                  <td className="py-3 text-slate-400 text-xs">{fmtFecha(p.periodoDesde)} → {fmtFecha(p.periodoHasta)}</td>
                  <td className="py-3 text-slate-400 text-xs truncate max-w-[180px]">{p.comprobante ?? '—'}</td>
                  <td className="py-3 text-right">
                    <button onClick={() => anularPago(p.id)} className="text-xs text-rose-300/70 hover:text-rose-300">Anular</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

      {/* MODALES */}
      {modal && (
        <Modal title={
          modal === 'plan' ? 'Cambiar plan' :
          modal === 'trial' ? 'Extender trial' :
          'Registrar pago'
        } onClose={() => setModal(null)}>
          {modal === 'plan' && (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Plan</span>
                <select value={planForm.plan} onChange={(e) => setPlanForm({ ...planForm, plan: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                  {planesDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.nombre} · {fmtCLP(p.precioMensual)}/mes
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Ciclo de facturación</span>
                <div className="flex gap-2">
                  {(['MENSUAL', 'ANUAL'] as const).map((c) => (
                    <button key={c} onClick={() => setPlanForm({ ...planForm, cicloFacturacion: c })}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${planForm.cicloFacturacion === c ? 'bg-purple-500/20 text-purple-200 border border-purple-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                      {c === 'MENSUAL' ? 'Mensual' : 'Anual'}
                    </button>
                  ))}
                </div>
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
                  Precio acordado <span className="text-slate-600">(opcional, en CLP/mes)</span>
                </span>
                <input value={planForm.precioAcordadoStr} onChange={(e) => setPlanForm({ ...planForm, precioAcordadoStr: e.target.value })}
                  placeholder={`Default plan: ${fmtCLP(planPriceMap[planForm.plan] ?? 0)}`}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500" />
                <p className="text-xs text-slate-500 mt-1">Dejá vacío para usar el precio estándar del plan.</p>
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
                  Próximo cobro <span className="text-slate-600">(opcional)</span>
                </span>
                <input type="date" value={planForm.proximoCobro} onChange={(e) => setPlanForm({ ...planForm, proximoCobro: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
              </label>
              {err && <p className="text-rose-300 text-sm">{err}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={submitPlan} disabled={saving} className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 rounded-lg text-sm font-medium">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setModal(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          )}

          {modal === 'trial' && (
            <div className="space-y-3">
              <div>
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-2">Sumar días al trial</span>
                <div className="grid grid-cols-4 gap-2">
                  {[7, 15, 30, 60].map((d) => (
                    <button key={d} onClick={() => setTrialForm({ dias: d, customFecha: '' })}
                      className={`px-3 py-2 rounded-lg text-sm font-medium ${trialForm.dias === d && !trialForm.customFecha ? 'bg-blue-500/20 text-blue-200 border border-blue-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
                      +{d}d
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">O fijar fecha exacta</span>
                <input type="date" value={trialForm.customFecha} onChange={(e) => setTrialForm({ ...trialForm, customFecha: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-slate-500">Si el plan es pagado, se devolverá a TRIAL. Si está suspendida, se reactiva.</p>
              {err && <p className="text-rose-300 text-sm">{err}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={submitTrial} disabled={saving} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg text-sm font-medium">
                  {saving ? 'Guardando...' : 'Extender'}
                </button>
                <button onClick={() => setModal(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          )}

          {modal === 'pago' && (
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Monto (CLP)</span>
                <input value={pagoForm.montoStr} onChange={(e) => setPagoForm({ ...pagoForm, montoStr: e.target.value })}
                  placeholder="Ej: 19900"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                {sugeridoMonto > 0 && (
                  <p className="text-xs text-slate-500 mt-1">Sugerido: {fmtCLP(sugeridoMonto)}</p>
                )}
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Fecha del pago</span>
                <input type="date" value={pagoForm.fechaPago} onChange={(e) => setPagoForm({ ...pagoForm, fechaPago: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Método</span>
                <select value={pagoForm.metodoPago} onChange={(e) => setPagoForm({ ...pagoForm, metodoPago: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  {METODO_PAGO_OPCIONES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Comprobante / N° operación <span className="text-slate-600">(opcional)</span></span>
                <input value={pagoForm.comprobante} onChange={(e) => setPagoForm({ ...pagoForm, comprobante: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Notas <span className="text-slate-600">(opcional)</span></span>
                <textarea value={pagoForm.notas} onChange={(e) => setPagoForm({ ...pagoForm, notas: e.target.value })} rows={2}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
              {err && <p className="text-rose-300 text-sm">{err}</p>}
              <p className="text-xs text-slate-500">Al registrar el pago la clínica se reactiva (si estaba suspendida) y el próximo cobro se desplaza un ciclo ({data.cicloFacturacion === 'ANUAL' ? 'año' : 'mes'}).</p>
              <div className="flex gap-2 pt-2">
                <button onClick={submitPago} disabled={saving} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg text-sm font-medium">
                  {saving ? 'Guardando...' : 'Registrar pago'}
                </button>
                <button onClick={() => setModal(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
