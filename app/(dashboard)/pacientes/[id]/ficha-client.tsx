'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatRUT, formatDate, formatDateTime, calcularEdad, formatCLP } from '@/lib/utils'
import { PlanTratamiento } from '@/components/PlanTratamiento'

const TABS = ['Información', 'Plan de Tratamiento', 'Citas', 'Cobros', 'Presupuestos']

const ESTADO_CITA_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  CONFIRMADA: 'bg-cyan-100 text-cyan-700',
  ATENDIDA: 'bg-emerald-100 text-emerald-700',
  CANCELADA: 'bg-red-100 text-red-700',
  NO_ASISTIO: 'bg-slate-100 text-slate-600',
}

export function FichaClinicaClient({ paciente, doctors, prestaciones }: any) {
  const [tab, setTab] = useState(0)
  const [showCitaModal, setShowCitaModal] = useState(false)
  const [showCobroModal, setShowCobroModal] = useState(false)
  const [citaForm, setCitaForm] = useState({ doctorId: '', fecha: '', hora: '', tipo: 'CONSULTA', notas: '', duracion: '30' })
  const [cobroForm, setCobroForm] = useState({ concepto: '', monto: '', metodoPago: 'EFECTIVO' })
  const [saving, setSaving] = useState(false)
  const [showPresupuestoConfirm, setShowPresupuestoConfirm] = useState(false)
  const [presupuestoItems, setPresupuestoItems] = useState<any[]>([])
  const [generatingPresupuesto, setGeneratingPresupuesto] = useState(false)

  async function generarPresupuestoDesde(tratamientos: any[]) {
    setPresupuestoItems(tratamientos)
    setShowPresupuestoConfirm(true)
  }

  async function confirmarPresupuesto() {
    setGeneratingPresupuesto(true)
    const items = presupuestoItems.map((t: any) => ({
      prestacionId: t.prestacion.id,
      cantidad: 1,
      precioUnitario: t.precio,
      descuento: 0,
      subtotal: t.precio,
    }))
    const total = items.reduce((s: number, i: any) => s + i.subtotal, 0)
    const res = await fetch('/api/presupuestos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pacienteId: paciente.id, items, total }),
    })
    const pres = await res.json()
    setGeneratingPresupuesto(false)
    setShowPresupuestoConfirm(false)
    window.open(`/print/presupuesto?id=${pres.id}`, '_blank')
  }

  async function saveCita(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const fechaCompleta = `${citaForm.fecha}T${citaForm.hora}`
    await fetch('/api/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...citaForm, pacienteId: paciente.id, fecha: fechaCompleta }),
    })
    setSaving(false)
    setShowCitaModal(false)
    window.location.reload()
  }

  async function saveCobro(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/cobros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cobroForm, pacienteId: paciente.id, monto: Number(cobroForm.monto) }),
    })
    setSaving(false)
    setShowCobroModal(false)
    window.location.reload()
  }

  return (
    <div className="p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href="/pacientes" className="hover:text-cyan-600">Pacientes</Link>
        <span>/</span>
        <span className="text-slate-700 font-medium">{paciente.nombre} {paciente.apellido}</span>
      </div>

      {/* Header paciente */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-white text-2xl font-bold">{paciente.nombre[0]}{paciente.apellido[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{paciente.nombre} {paciente.apellido}</h1>
                <p className="text-slate-500 text-sm mt-0.5">{paciente.rut ? `RUT ${formatRUT(paciente.rut)}` : 'Sin RUT registrado'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCitaModal(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-cyan-600 border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Nueva cita
                </button>
                <button onClick={() => setShowCobroModal(true)}
                  className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Nuevo cobro
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-sm">
              {paciente.fechaNacimiento && <span className="text-slate-600">{calcularEdad(paciente.fechaNacimiento)} años</span>}
              {paciente.telefono && <span className="text-slate-600">📞 {paciente.telefono}</span>}
              {paciente.email && <span className="text-slate-600">✉ {paciente.email}</span>}
              {paciente.prevision && <span className="bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full text-xs font-medium">{paciente.prevision}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-1">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${tab === i ? 'text-cyan-600 border-b-2 border-cyan-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab: Información */}
      {tab === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Datos personales</h3>
            <dl className="space-y-3">
              {[
                { label: 'Nombre completo', value: `${paciente.nombre} ${paciente.apellido}` },
                { label: 'RUT', value: paciente.rut ? formatRUT(paciente.rut) : '—' },
                { label: 'Fecha nacimiento', value: paciente.fechaNacimiento ? formatDate(paciente.fechaNacimiento) : '—' },
                { label: 'Género', value: paciente.genero === 'M' ? 'Masculino' : paciente.genero === 'F' ? 'Femenino' : paciente.genero ?? '—' },
                { label: 'Teléfono', value: paciente.telefono ?? '—' },
                { label: 'Email', value: paciente.email ?? '—' },
                { label: 'Dirección', value: paciente.direccion ?? '—' },
                { label: 'Previsión', value: paciente.prevision ?? '—' },
              ].map((f) => (
                <div key={f.label} className="flex justify-between text-sm">
                  <dt className="text-slate-500">{f.label}</dt>
                  <dd className="text-slate-900 font-medium text-right">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Antecedentes médicos</h3>
            {paciente.fichaClinica ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Diabético', val: paciente.fichaClinica.diabetico },
                    { label: 'Hipertenso', val: paciente.fichaClinica.hipertenso },
                    { label: 'Fumador', val: paciente.fichaClinica.fumador },
                    { label: 'Cardiopatía', val: paciente.fichaClinica.cardiopatia },
                  ].map((item) => (
                    <div key={item.label} className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${item.val ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${item.val ? 'bg-red-500' : 'bg-slate-300'}`} />
                      {item.label}
                    </div>
                  ))}
                </div>
                {paciente.fichaClinica.medicamentos && (
                  <div className="text-sm"><span className="text-slate-500">Medicamentos: </span>{paciente.fichaClinica.medicamentos}</div>
                )}
                {paciente.alergias && (
                  <div className="text-sm"><span className="text-slate-500">Alergias: </span>{paciente.alergias}</div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Sin ficha clínica registrada. Ir a la pestaña &quot;Ficha Clínica&quot; para crear una.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Plan de Tratamiento */}
      {tab === 1 && (
        <PlanTratamiento
          pacienteId={paciente.id}
          pacienteNombre={`${paciente.nombre} ${paciente.apellido}`}
          fichaId={paciente.fichaClinica?.id}
          tratamientos={paciente.fichaClinica?.tratamientos ?? []}
          dientesExistentes={(paciente.fichaClinica?.odontograma ?? []).map((d: any) => ({
            numero: d.numero,
            estadoActual: d.estado,
          }))}
          prestaciones={prestaciones}
          onPresupuesto={generarPresupuestoDesde}
        />
      )}

      {/* Tab: Citas */}
      {tab === 2 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Historial de citas</h3>
            <button onClick={() => setShowCitaModal(true)} className="text-sm font-medium text-cyan-600 hover:text-cyan-700">+ Nueva cita</button>
          </div>
          {paciente.citas.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Sin citas registradas</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Doctor</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paciente.citas.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">{formatDateTime(c.fecha)}</td>
                    <td className="px-6 py-3 text-slate-600">{c.doctor.name ?? c.doctor.email}</td>
                    <td className="px-6 py-3 text-slate-600">{c.tipo ?? 'Consulta'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_CITA_COLORS[c.estado] ?? 'bg-slate-100 text-slate-600'}`}>{c.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Cobros */}
      {tab === 3 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-semibold text-slate-900">Cobros</h3>
            <button onClick={() => setShowCobroModal(true)} className="text-sm font-medium text-cyan-600 hover:text-cyan-700">+ Nuevo cobro</button>
          </div>
          {paciente.cobros.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">Sin cobros registrados</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Concepto</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Método</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Monto</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paciente.cobros.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-900">{c.concepto}</td>
                    <td className="px-6 py-3 text-slate-600">{c.fechaPago ? formatDate(c.fechaPago) : formatDate(c.createdAt)}</td>
                    <td className="px-6 py-3 text-slate-600">{c.metodoPago ?? '—'}</td>
                    <td className="px-6 py-3 text-right font-medium text-slate-900">{formatCLP(c.monto)}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-700' :
                        c.estado === 'ANULADO' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{c.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: Presupuestos */}
      {tab === 4 && (
        <div className="space-y-4">
          {paciente.presupuestos.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-slate-400 text-sm">Sin presupuestos</div>
          ) : paciente.presupuestos.map((p: any) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-semibold text-slate-900">Presupuesto #{p.numero}</h4>
                  <p className="text-xs text-slate-400">{formatDate(p.createdAt)}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  p.estado === 'APROBADO' ? 'bg-emerald-100 text-emerald-700' :
                  p.estado === 'RECHAZADO' ? 'bg-red-100 text-red-700' :
                  p.estado === 'COMPLETADO' ? 'bg-blue-100 text-blue-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{p.estado}</span>
              </div>
              <table className="w-full text-sm mb-3">
                <tbody className="divide-y divide-slate-50">
                  {p.items.map((item: any) => (
                    <tr key={item.id}>
                      <td className="py-1.5 text-slate-700">{item.prestacion.nombre}</td>
                      <td className="py-1.5 text-slate-500 text-center">x{item.cantidad}</td>
                      <td className="py-1.5 text-right text-slate-900 font-medium">{formatCLP(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                <button
                  onClick={() => window.open(`/print/presupuesto?id=${p.id}`, '_blank')}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-cyan-600 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                  Imprimir presupuesto
                </button>
                <span className="text-sm font-bold text-slate-900">Total: {formatCLP(p.total)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nueva cita */}
      {showCitaModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Nueva cita</h2>
              <button onClick={() => setShowCitaModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveCita} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Doctor *</label>
                <select required value={citaForm.doctorId} onChange={(e) => setCitaForm({ ...citaForm, doctorId: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar doctor</option>
                  {doctors.map((d: any) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha *</label>
                  <input type="date" required value={citaForm.fecha} onChange={(e) => setCitaForm({ ...citaForm, fecha: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hora *</label>
                  <input type="time" required value={citaForm.hora} onChange={(e) => setCitaForm({ ...citaForm, hora: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select value={citaForm.tipo} onChange={(e) => setCitaForm({ ...citaForm, tipo: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="CONSULTA">Consulta</option>
                    <option value="CONTROL">Control</option>
                    <option value="TRATAMIENTO">Tratamiento</option>
                    <option value="URGENCIA">Urgencia</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Duración (min)</label>
                  <select value={citaForm.duracion} onChange={(e) => setCitaForm({ ...citaForm, duracion: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="45">45 min</option>
                    <option value="60">60 min</option>
                    <option value="90">90 min</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea value={citaForm.notas} onChange={(e) => setCitaForm({ ...citaForm, notas: e.target.value })} rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCitaModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Guardando...' : 'Guardar cita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal nuevo cobro */}
      {showCobroModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo cobro</h2>
              <button onClick={() => setShowCobroModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveCobro} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto *</label>
                <input required value={cobroForm.concepto} onChange={(e) => setCobroForm({ ...cobroForm, concepto: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Monto (CLP) *</label>
                  <input type="number" required min="0" value={cobroForm.monto} onChange={(e) => setCobroForm({ ...cobroForm, monto: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Método de pago</label>
                  <select value={cobroForm.metodoPago} onChange={(e) => setCobroForm({ ...cobroForm, metodoPago: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="DEBITO">Débito</option>
                    <option value="CREDITO">Crédito</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCobroModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Guardando...' : 'Registrar cobro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: confirmar generación de presupuesto desde plan */}
      {showPresupuestoConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Generar presupuesto</h2>
                <p className="text-sm text-slate-500 mt-0.5">Desde el plan de tratamiento activo</p>
              </div>
              <button onClick={() => setShowPresupuestoConfirm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Se generará un presupuesto con las siguientes acciones clínicas ({presupuestoItems.length} items):
              </p>
              <div className="bg-slate-50 rounded-xl p-4 mb-4 max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-1.5 text-xs font-semibold text-slate-500">Pieza/Zona</th>
                      <th className="text-left py-1.5 text-xs font-semibold text-slate-500">Prestación</th>
                      <th className="text-right py-1.5 text-xs font-semibold text-slate-500">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {presupuestoItems.map((t: any) => (
                      <tr key={t.id}>
                        <td className="py-1.5 text-cyan-700 font-medium text-xs">{t.diente ? `Pieza ${t.diente}` : t.cara ?? 'General'}</td>
                        <td className="py-1.5 text-slate-700">{t.prestacion.nombre}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-900">{formatCLP(t.precio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-slate-200 pt-2 mt-2 flex justify-end">
                  <span className="text-sm font-bold text-slate-900">
                    Total: {formatCLP(presupuestoItems.reduce((s: number, t: any) => s + t.precio, 0))}
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPresupuestoConfirm(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarPresupuesto}
                  disabled={generatingPresupuesto}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                >
                  {generatingPresupuesto ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generando...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>Generar e imprimir</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
