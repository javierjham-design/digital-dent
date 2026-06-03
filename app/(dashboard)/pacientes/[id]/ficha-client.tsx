'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatRUT, formatDate, formatDateTime, calcularEdad, formatCLP } from '@/lib/utils'
import { PlanesTratamiento } from '@/components/PlanesTratamiento'
import { Evoluciones } from '@/components/Evoluciones'

const TABS_PRINCIPALES = ['Datos personales', 'Ficha clínica', 'Planes de tratamiento', 'Evoluciones', 'Facturación y pagos', 'Recibir pago'] as const
const SUBTABS_DATOS = ['Datos', 'Citas', 'Comentarios', 'Mensajes'] as const

const ESTADO_CITA_COLORS: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  CONFIRMADA: 'bg-cyan-100 text-cyan-700',
  ATENDIDA: 'bg-emerald-100 text-emerald-700',
  CANCELADA: 'bg-red-100 text-red-700',
  NO_ASISTIO: 'bg-slate-100 text-slate-600',
}

const CATEGORIA_MSG: Record<string, string> = {
  CONFIRMACION_CITA: 'Confirmación de cita',
  PLAN_TRATAMIENTO:  'Plan de tratamiento',
  DOCUMENTO:         'Documento clínico',
  RECETA:            'Receta',
  OTRO:              'Otro',
}

const TIPO_MSG_BADGE: Record<string, string> = {
  EMAIL:    'bg-blue-100 text-blue-700',
  WHATSAPP: 'bg-emerald-100 text-emerald-700',
  SMS:      'bg-amber-100 text-amber-700',
}

export function FichaClinicaClient({ paciente: initial, doctors, prestaciones, permisos, currentUserId, pagosData }: any) {
  const [paciente, setPaciente] = useState(initial)
  const [tab, setTab] = useState<typeof TABS_PRINCIPALES[number]>('Datos personales')
  const [subtab, setSubtab] = useState<typeof SUBTABS_DATOS[number]>('Datos')

  // KPIs derivados
  const tratamientos = paciente.fichaClinica?.tratamientos ?? []
  const kpis = useMemo(() => {
    const activos = tratamientos.filter((t: any) => t.estado === 'PLANIFICADO' || t.estado === 'EN_PROGRESO').length
    const finalizados = tratamientos.filter((t: any) => t.estado === 'COMPLETADO').length
    const realizado = tratamientos.filter((t: any) => t.estado === 'COMPLETADO').reduce((s: number, t: any) => s + t.precio, 0)
    const abonado = paciente.cobros.filter((c: any) => c.estado === 'PAGADO').reduce((s: number, c: any) => s + c.monto, 0)
    return { activos, finalizados, realizado, abonado, saldo: Math.max(realizado - abonado, 0) }
  }, [tratamientos, paciente.cobros])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Link href="/pacientes" className="text-sm text-cyan-600 hover:text-cyan-700 inline-flex items-center gap-1 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Volver al listado
      </Link>

      {/* Header azul */}
      <div className="rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-6 shadow-sm mb-4">
        <div className="flex items-start gap-5 flex-wrap">
          <div className="w-20 h-20 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-3xl font-bold flex-shrink-0">
            {paciente.nombre[0]}{paciente.apellido[0]}
          </div>
          <div className="flex-1 min-w-[260px]">
            <p className="text-cyan-100 text-xs font-semibold tracking-wider">ID {paciente.numero ?? '—'}</p>
            <h1 className="text-2xl font-bold mt-0.5">{paciente.nombre} {paciente.apellido}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-cyan-100 flex-wrap">
              {paciente.rut && <span>RUT {formatRUT(paciente.rut)}</span>}
              <span className="opacity-50">·</span>
              {paciente.fechaNacimiento && <span>{calcularEdad(paciente.fechaNacimiento)} años</span>}
              {paciente.prevision && (<><span className="opacity-50">·</span><span className="px-2 py-0.5 bg-white/15 rounded-full text-xs">{paciente.prevision}</span></>)}
            </div>
          </div>

          {/* Indicadores médicos */}
          <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
            <IndicadorMedico
              icon="⚠"
              label="Alertas médicas"
              valor={paciente.fichaClinica?.alertasMedicas}
            />
            <IndicadorMedico
              icon="♥"
              label="Enfermedades"
              valor={
                [
                  paciente.fichaClinica?.diabetico && 'Diabetes',
                  paciente.fichaClinica?.hipertenso && 'Hipertensión',
                  paciente.fichaClinica?.cardiopatia && 'Cardiopatía',
                  paciente.fichaClinica?.embarazada && 'Embarazo',
                  paciente.fichaClinica?.enfermedadesNotas,
                ].filter(Boolean).join(', ') || null
              }
            />
            <IndicadorMedico
              icon="℞"
              label="Medicamentos"
              valor={paciente.fichaClinica?.medicamentos}
            />
          </div>
        </div>
      </div>

      {/* Tabs principales */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {TABS_PRINCIPALES.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t ? 'text-cyan-700 border-b-2 border-cyan-600 bg-cyan-50/40' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t}
            </button>
          ))}
          <div className="flex-1" />
          <Link href={`/agenda?pacienteId=${paciente.id}`} className="px-4 py-3 text-sm font-medium text-cyan-600 hover:bg-cyan-50 flex items-center gap-1.5 whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Agendar
          </Link>
          <a href={`/print/plan?pacienteId=${paciente.id}`} target="_blank" rel="noopener noreferrer"
            className="px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 whitespace-nowrap border-l border-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Historia clínica
          </a>
        </div>

        {/* Subtabs (solo en Datos personales) */}
        {tab === 'Datos personales' && (
          <div className="flex border-b border-slate-100 bg-slate-50 overflow-x-auto">
            {SUBTABS_DATOS.map((st) => {
              const count = st === 'Citas' ? paciente.citas.length : st === 'Mensajes' ? paciente.mensajes.length : null
              return (
                <button key={st} onClick={() => setSubtab(st)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                    subtab === st ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {st}
                  {count !== null && <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-semibold">{count}</span>}
                </button>
              )
            })}
          </div>
        )}

        <div className="p-6">
          {tab === 'Datos personales' && subtab === 'Datos' && (
            <DatosPersonales paciente={paciente} setPaciente={setPaciente} />
          )}
          {tab === 'Datos personales' && subtab === 'Citas' && (
            <CitasList citas={paciente.citas} />
          )}
          {tab === 'Datos personales' && subtab === 'Comentarios' && (
            <Comentarios pacienteId={paciente.id} comentarios={paciente.comentariosAdmin} onAdd={(nuevo) => setPaciente({ ...paciente, comentariosAdmin: [nuevo, ...paciente.comentariosAdmin] })} />
          )}
          {tab === 'Datos personales' && subtab === 'Mensajes' && (
            <Mensajes mensajes={paciente.mensajes} />
          )}

          {tab === 'Ficha clínica' && (
            <FichaClinicaTab paciente={paciente} setPaciente={setPaciente} />
          )}

          {tab === 'Planes de tratamiento' && (
            <PlanesTratamiento
              pacienteId={paciente.id}
              pacienteEmail={paciente.email}
              pacienteNombre={`${paciente.nombre} ${paciente.apellido}`}
              prestaciones={prestaciones}
              doctors={doctors ?? []}
              dientesExistentes={(paciente.fichaClinica?.odontograma ?? []).map((d: any) => ({ numero: d.numero, estadoActual: d.estado }))}
              permisos={permisos ?? { puedeModificarPrecio: false, puedeAplicarDescuento: false, puedeRevertirCompletado: false }}
            />
          )}

          {tab === 'Evoluciones' && (
            <Evoluciones pacienteId={paciente.id} currentUserId={currentUserId ?? ''} />
          )}

          {tab === 'Facturación y pagos' && (
            <FacturacionPagos
              paciente={paciente}
              kpis={kpis}
              permisos={permisos}
              mediosPago={pagosData?.mediosPago ?? []}
              onCobroChange={(updated: any) => {
                setPaciente((prev: any) => ({
                  ...prev,
                  cobros: prev.cobros.map((c: any) => c.id === updated.id ? { ...c, ...updated } : c),
                }))
              }}
            />
          )}

          {tab === 'Recibir pago' && (
            <RecibirPago
              paciente={paciente}
              kpis={kpis}
              pagosData={pagosData}
              currentUserId={currentUserId}
              permisos={permisos}
              onCobro={() => window.location.reload()}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Componentes internos
// ────────────────────────────────────────────────────────────────────

function IndicadorMedico({ icon, label, valor }: { icon: string; label: string; valor: string | null | undefined }) {
  const tiene = !!valor
  return (
    <div className={`rounded-xl px-2.5 py-2 text-xs min-w-0 overflow-hidden ${tiene ? 'bg-red-500/20 border border-red-300/30' : 'bg-white/10 border border-white/20'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1.5 mb-0.5">
        <span className="text-base leading-none">{icon}</span>
        <span className="font-medium text-white text-[11px] sm:text-xs leading-tight break-words">{label}</span>
      </div>
      <p className={`${tiene ? 'text-white' : 'text-cyan-100/70'} truncate text-[11px] sm:text-xs`}>{tiene ? valor : 'Sin info'}</p>
    </div>
  )
}

function DatosPersonales({ paciente, setPaciente }: any) {
  const [form, setForm] = useState({ ...paciente, fechaNacimiento: paciente.fechaNacimiento ? paciente.fechaNacimiento.slice(0, 10) : '' })
  const [saving, setSaving] = useState(false)
  const [okMsg, setOkMsg] = useState('')

  function update(k: string, v: any) {
    setForm({ ...form, [k]: v })
  }

  async function guardar() {
    setSaving(true); setOkMsg('')
    try {
      const res = await fetch(`/api/pacientes/${paciente.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Error: ${j.error ?? res.status}`)
        return
      }
      const updated = await res.json()
      setPaciente({ ...paciente, ...updated })
      setOkMsg('Datos guardados ✓')
      setTimeout(() => setOkMsg(''), 3000)
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-light text-slate-700">Datos personales</h2>
        <div className="flex items-center gap-3">
          {okMsg && <span className="text-sm text-emerald-600">{okMsg}</span>}
          <button onClick={guardar} disabled={saving}
            className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium">
            {saving ? 'Guardando...' : 'Guardar datos'}
          </button>
        </div>
      </div>

      <section className="border border-slate-200 rounded-xl p-5 mb-5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Datos requeridos</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Tipo" value={form.tipoPaciente ?? ''} onChange={(v) => update('tipoPaciente', v)} />
          <Field label="Nombre legal" value={form.nombre ?? ''} onChange={(v) => update('nombre', v)} />
          <Field label="Apellidos *" value={form.apellido ?? ''} onChange={(v) => update('apellido', v)} />
          <Field label="Nacionalidad" value={form.nacionalidad ?? ''} onChange={(v) => update('nacionalidad', v)} />
          <Field label="RUT" value={form.rut ?? ''} onChange={(v) => update('rut', v)} placeholder="12345678-9" />
          <SelectField label="Migrante" value={form.migrante ?? ''} onChange={(v) => update('migrante', v)} options={[['', '—'], ['Si', 'Sí'], ['No', 'No']]} />
          <Field label="Pueblos originarios" value={form.puebloOriginario ?? ''} onChange={(v) => update('puebloOriginario', v)} wide />
        </div>
      </section>

      <section className="border border-slate-200 rounded-xl p-5">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Datos opcionales</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Nombre social" value={form.nombreSocial ?? ''} onChange={(v) => update('nombreSocial', v)} />
          <Field label="Email" type="email" value={form.email ?? ''} onChange={(v) => update('email', v)} />
          <SelectField label="Convenio" value={form.prevision ?? ''} onChange={(v) => update('prevision', v)}
            options={[['', 'Sin convenio'], ['PARTICULAR', 'Particular'], ['FONASA', 'FONASA'], ['ISAPRE', 'ISAPRE']]} />
          <Field label="Número interno" value={form.numeroInterno ?? ''} onChange={(v) => update('numeroInterno', v)} />
          <SelectField label="Sexo" value={form.sexo ?? ''} onChange={(v) => update('sexo', v)}
            options={[['', '—'], ['M', 'Masculino'], ['F', 'Femenino']]} />
          <SelectField label="Género" value={form.genero ?? ''} onChange={(v) => update('genero', v)}
            options={[['', '—'], ['M', 'Masculino'], ['F', 'Femenino'], ['O', 'Otro']]} />
          <Field label="Fecha nacimiento" type="date" value={form.fechaNacimiento ?? ''} onChange={(v) => update('fechaNacimiento', v)} />
          <Field label="Ciudad" value={form.ciudad ?? ''} onChange={(v) => update('ciudad', v)} />
          <Field label="Comuna" value={form.comuna ?? ''} onChange={(v) => update('comuna', v)} />
          <Field label="Dirección" value={form.direccion ?? ''} onChange={(v) => update('direccion', v)} />
          <Field label="Teléfono fijo" value={form.telefonoFijo ?? ''} onChange={(v) => update('telefonoFijo', v)} />
          <Field label="Teléfono móvil" value={form.telefono ?? ''} onChange={(v) => update('telefono', v)} placeholder="+56 9 ..." />
          <Field label="Actividad o profesión" value={form.actividad ?? ''} onChange={(v) => update('actividad', v)} />
          <Field label="Empleador" value={form.empleador ?? ''} onChange={(v) => update('empleador', v)} />
          <Field label="Observaciones" value={form.observaciones ?? ''} onChange={(v) => update('observaciones', v)} />
          <Field label="Apoderado" value={form.apoderado ?? ''} onChange={(v) => update('apoderado', v)} />
          <Field label="RUT apoderado" value={form.rutApoderado ?? ''} onChange={(v) => update('rutApoderado', v)} />
          <Field label="Referencia" value={form.referencia ?? ''} onChange={(v) => update('referencia', v)} />
        </div>
      </section>
    </div>
  )
}

function CitasList({ citas }: { citas: any[] }) {
  if (citas.length === 0) {
    return <p className="text-slate-400 text-sm py-8 text-center">Este paciente no tiene citas registradas.</p>
  }
  return (
    <div className="space-y-2">
      {citas.map((c: any) => (
        <div key={c.id} className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">{formatDateTime(c.fecha)}</p>
            <p className="text-xs text-slate-500">{c.doctor?.name ?? c.doctor?.email} · {c.tipo ?? 'CONSULTA'}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_CITA_COLORS[c.estado] ?? 'bg-slate-100 text-slate-600'}`}>{c.estado}</span>
        </div>
      ))}
    </div>
  )
}

function Comentarios({ pacienteId, comentarios, onAdd }: { pacienteId: string; comentarios: any[]; onAdd: (c: any) => void }) {
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)

  async function publicar() {
    if (!texto.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/pacientes/${pacienteId}/comentarios`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      if (!res.ok) { alert('Error al guardar'); return }
      const nuevo = await res.json()
      onAdd({ ...nuevo, createdAt: nuevo.createdAt })
      setTexto('')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="border border-slate-200 rounded-xl p-4 mb-4">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Escribe un comentario administrativo sobre este paciente..."
          className="w-full text-sm focus:outline-none resize-none"
        />
        <div className="flex justify-end mt-2">
          <button onClick={publicar} disabled={saving || !texto.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium">
            {saving ? 'Guardando...' : 'Publicar comentario'}
          </button>
        </div>
      </div>

      {comentarios.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center">No hay comentarios todavía.</p>
      ) : (
        <div className="space-y-3">
          {comentarios.map((c: any) => (
            <div key={c.id} className="border-l-4 border-cyan-400 bg-cyan-50/30 rounded-r-xl px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-slate-800">{c.autorNombre}</p>
                <p className="text-xs text-slate-500">{formatDateTime(c.createdAt)}</p>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.texto}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Mensajes({ mensajes }: { mensajes: any[] }) {
  if (mensajes.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-slate-400 text-sm">No hay mensajes registrados para este paciente.</p>
        <p className="text-slate-400 text-xs mt-2">
          Aquí aparecerán confirmaciones de citas por WhatsApp, planes de tratamiento enviados por email,
          documentos clínicos y recetas que se envíen al paciente.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {mensajes.map((m: any) => (
        <div key={m.id} className="flex items-start justify-between border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50/50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_MSG_BADGE[m.tipo] ?? 'bg-slate-100 text-slate-600'}`}>{m.tipo}</span>
              <span className="text-sm font-medium text-slate-800">{CATEGORIA_MSG[m.categoria] ?? m.categoria}</span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</span>
            </div>
            {m.asunto && <p className="text-sm text-slate-700 truncate">{m.asunto}</p>}
            {m.enviadoA && <p className="text-xs text-slate-500 mt-0.5">A: {m.enviadoA}</p>}
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            m.estado === 'LEIDO' ? 'bg-emerald-100 text-emerald-700' :
            m.estado === 'FALLIDO' ? 'bg-red-100 text-red-700' :
            'bg-slate-100 text-slate-600'
          }`}>{m.estado}</span>
        </div>
      ))}
    </div>
  )
}

function FichaClinicaTab({ paciente }: any) {
  const f = paciente.fichaClinica
  return (
    <div>
      <h2 className="text-2xl font-light text-slate-700 mb-5">Ficha clínica</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Info label="Alertas médicas" valor={f?.alertasMedicas} placeholder="Sin alertas registradas" />
        <Info label="Enfermedades (notas)" valor={f?.enfermedadesNotas} placeholder="Sin enfermedades registradas" />
        <Info label="Medicamentos" valor={f?.medicamentos} placeholder="Sin medicamentos" />
        <Info label="Alergias" valor={paciente.alergias} placeholder="Sin alergias" />
        <Info label="Antecedentes" valor={paciente.antecedentes} placeholder="Sin antecedentes" wide />
        <Info label="Grupo sanguíneo" valor={f?.grupoSanguineo} placeholder="—" />
        <div className="border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Condiciones</p>
          <ul className="text-sm text-slate-700 space-y-1">
            <li>{f?.fumador ? '✓' : '—'} Fumador</li>
            <li>{f?.diabetico ? '✓' : '—'} Diabético</li>
            <li>{f?.hipertenso ? '✓' : '—'} Hipertenso</li>
            <li>{f?.cardiopatia ? '✓' : '—'} Cardiopatía</li>
            <li>{f?.embarazada ? '✓' : '—'} Embarazo</li>
          </ul>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-4">Edición de ficha clínica completa próximamente en módulo dedicado.</p>
    </div>
  )
}

function FacturacionPagos({ paciente, kpis, permisos, mediosPago, onCobroChange }: any) {
  const canEdit = permisos?.puedeEditarPagos === true
  const cobros = paciente.cobros ?? []

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing,   setEditing]   = useState<any>(null)
  const [editForm,  setEditForm]  = useState({ concepto: '', monto: '', notas: '', fechaPago: '', medioPagoId: '' })
  const [editError, setEditError] = useState('')
  const [anulando, setAnulando]   = useState<any>(null)
  const [motivo,   setMotivo]     = useState('')
  const [anuError, setAnuError]   = useState('')
  const [saving,   setSaving]     = useState(false)

  function openEdit(c: any) {
    setEditing(c); setEditError('')
    setEditForm({
      concepto:    c.concepto ?? '',
      monto:       String(c.monto ?? ''),
      notas:       c.notas ?? '',
      fechaPago:   c.fechaPago ? c.fechaPago.slice(0, 10) : '',
      medioPagoId: c.medioPagoId ?? c.medioPago?.id ?? '',
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
      const medio = mediosPago.find((m: any) => m.id === payload.medioPagoId)
      onCobroChange?.({
        id: editing.id,
        concepto: data.concepto ?? editing.concepto,
        monto: data.monto ?? editing.monto,
        montoNeto: data.montoNeto ?? editing.montoNeto,
        notas: data.notas ?? null,
        fechaPago: data.fechaPago ?? null,
        medioPagoId: payload.medioPagoId ?? null,
        medioPago: medio ?? null,
      })
      setEditing(null)
    } finally { setSaving(false) }
  }

  function openAnular(c: any) {
    setAnulando(c); setMotivo(''); setAnuError('')
  }

  async function confirmAnular(e: React.FormEvent) {
    e.preventDefault()
    if (!anulando) return
    if (motivo.trim().length < 4) { setAnuError('Indica un motivo (mínimo 4 caracteres).'); return }
    setSaving(true); setAnuError('')
    try {
      const res = await fetch(`/api/cobros/${anulando.id}/anular`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setAnuError(data.error ?? `Error ${res.status}`); return }
      onCobroChange?.({
        id: anulando.id,
        estado: 'ANULADO',
        anulado: true,
        motivoAnulacion: data.motivoAnulacion,
        anuladoAt: data.anuladoAt,
        anuladoPorNombre: data.anuladoPorNombre,
      })
      setAnulando(null)
    } finally { setSaving(false) }
  }

  function printCobro(id: string) {
    window.open(`/print/cobro/${id}`, '_blank')
  }

  const totalAnulados = cobros.filter((c: any) => c.anulado).length

  return (
    <div>
      <h2 className="text-2xl font-light text-slate-700 mb-5">Facturación y pagos</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiBox label="Realizado" value={formatCLP(kpis.realizado)} />
        <KpiBox label="Abonado" value={formatCLP(kpis.abonado)} />
        <KpiBox label="Saldo" value={formatCLP(kpis.saldo)} tono={kpis.saldo > 0 ? 'red' : 'emerald'} />
      </div>

      {/* Cobros recibidos */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-semibold text-slate-800">Cobros recibidos</h3>
        <span className="text-xs text-slate-400">
          {cobros.length} {cobros.length === 1 ? 'cobro' : 'cobros'}
          {totalAnulados > 0 && ` · ${totalAnulados} anulado${totalAnulados !== 1 ? 's' : ''}`}
        </span>
      </div>
      {cobros.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center border border-dashed border-slate-200 rounded-xl mb-6">
          Sin cobros registrados.
        </p>
      ) : (
        <div className="space-y-2 mb-6">
          {cobros.map((c: any) => {
            const isOpen = expandedId === c.id
            return (
              <div key={c.id} className={`border rounded-xl overflow-hidden transition-colors ${c.anulado ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'}`}>
                <button type="button" onClick={() => setExpandedId(isOpen ? null : c.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-slate-800 truncate">Cobro N° {c.numero}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${c.anulado ? 'bg-rose-100 text-rose-700' : c.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {c.anulado ? 'ANULADO' : c.estado}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{c.concepto}</p>
                    <p className="text-[11px] text-slate-400">
                      {c.fechaPago ? formatDateTime(c.fechaPago) : formatDateTime(c.createdAt)}
                      {c.medioPago?.nombre ? ` · ${c.medioPago.nombre}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{formatCLP(c.monto)}</p>
                    {c.montoNeto != null && c.montoNeto !== c.monto && (
                      <p className="text-[11px] text-teal-700 font-mono">neto {formatCLP(c.montoNeto)}</p>
                    )}
                  </div>
                  <svg className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2">
                    {/* Items */}
                    {c.items?.length > 0 && (
                      <div className="space-y-1">
                        {c.items.map((it: any) => (
                          <div key={it.id} className="flex items-center justify-between bg-white rounded-lg border border-slate-100 px-3 py-2">
                            <span className="text-xs text-slate-700">{it.descripcion}</span>
                            <span className="text-xs font-semibold text-slate-800">{formatCLP(it.monto)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {c.comisionMonto != null && c.comisionMonto > 0 && (
                      <p className="text-[11px] text-slate-500">
                        Comisión {c.medioPago?.nombre} ({c.medioPago?.comision}%): <span className="text-rose-600 font-mono">- {formatCLP(c.comisionMonto)}</span>
                      </p>
                    )}
                    {c.notas && (
                      <p className="text-[11px] text-slate-500"><span className="font-semibold uppercase tracking-wide text-slate-400 mr-1">Notas:</span>{c.notas}</p>
                    )}

                    {c.anulado && (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-1.5">
                        <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wide">Cobro anulado</p>
                        <p className="text-xs text-rose-700"><span className="font-semibold">Motivo:</span> {c.motivoAnulacion ?? '—'}</p>
                        <p className="text-[10px] text-rose-500">
                          Por {c.anuladoPorNombre ?? '—'}{c.anuladoAt ? ` · ${formatDateTime(c.anuladoAt)}` : ''}
                        </p>
                      </div>
                    )}

                    {/* Acciones */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button type="button" onClick={() => printCobro(c.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Imprimir
                      </button>
                      {canEdit && !c.anulado && (
                        <>
                          <button type="button" onClick={() => openEdit(c)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Editar
                          </button>
                          <button type="button" onClick={() => openAnular(c)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            Anular
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Presupuestos */}
      <h3 className="font-semibold text-slate-800 mb-3">Presupuestos</h3>
      {paciente.presupuestos.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">Sin presupuestos.</p>
      ) : (
        <div className="space-y-2">
          {paciente.presupuestos.map((p: any) => (
            <div key={p.id} className="border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">Presupuesto N° {p.numero}</p>
                <p className="text-xs text-slate-500">{formatDate(p.createdAt)} · {p.items.length} ítem{p.items.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800">{formatCLP(p.total)}</p>
                <a href={`/print/presupuesto?id=${p.id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-600 hover:underline">Ver / Imprimir</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal editar */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Editar cobro N° {editing.numero}</h3>
                <p className="text-xs text-slate-500">{paciente.nombre} {paciente.apellido}</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto</label>
                <input value={editForm.concepto} onChange={e => setEditForm({ ...editForm, concepto: e.target.value })}
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
                  {mediosPago.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.nombre}{m.comision > 0 ? ` (${m.comision}%)` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <input value={editForm.notas} onChange={e => setEditForm({ ...editForm, notas: e.target.value })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              {editError && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{editError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Guardando…' : 'Guardar cambios'}
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
              <div>
                <h3 className="text-lg font-semibold text-rose-900">Anular cobro N° {anulando.numero}</h3>
                <p className="text-xs text-rose-700">{paciente.nombre} {paciente.apellido} · {formatCLP(anulando.monto)}</p>
              </div>
              <button type="button" onClick={() => setAnulando(null)} className="text-rose-400 hover:text-rose-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={confirmAnular} className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                Al anular el cobro queda registrado con tu nombre y la fecha. El movimiento de caja también se revierte. Este texto se conserva para siempre.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo *</label>
                <textarea required value={motivo} rows={3}
                  onChange={e => setMotivo(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
              {anuError && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{anuError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setAnulando(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving || motivo.trim().length < 4}
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

function RecibirPago({ paciente, kpis, pagosData, currentUserId, permisos, onCobro }: any) {
  const tratamientos = pagosData?.tratamientosPendientes ?? []
  const mediosPago   = pagosData?.mediosPago ?? []
  const cajas        = pagosData?.cajas ?? []
  const cajeros      = pagosData?.cajeros ?? []
  const canReceive   = permisos?.puedeRecibirPagos === true

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [modoCobro, setModoCobro] = useState<'tratamientos' | 'abono'>(tratamientos.length > 0 ? 'tratamientos' : 'abono')
  const [abonoMonto, setAbonoMonto] = useState('')
  const [abonoConcepto, setAbonoConcepto] = useState('Abono al plan de tratamiento')
  const [cajaId, setCajaId] = useState<string>(cajas[0]?.id ?? '')
  const [medioPagoId, setMedioPagoId] = useState<string>('')
  const [reciboUsuarioId, setReciboUsuarioId] = useState<string>(
    cajeros.find((c: any) => c.id === currentUserId)?.id ?? '',
  )
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const seleccionados = tratamientos.filter((t: any) => selected.has(t.id))
  const subtotalTrat = seleccionados.reduce((s: number, t: any) => s + t.monto, 0)
  const subtotalAbono = Number(abonoMonto) || 0
  const subtotal = modoCobro === 'abono' ? subtotalAbono : subtotalTrat
  const medio = mediosPago.find((m: any) => m.id === medioPagoId)
  const comision = medio ? subtotal * (medio.comision / 100) : 0
  const neto = subtotal - comision

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!cajaId) { setError('Selecciona una caja.'); return }

    let items: { tratamientoId?: string; descripcion: string; monto: number }[]
    if (modoCobro === 'abono') {
      const monto = Number(abonoMonto)
      if (!Number.isFinite(monto) || monto <= 0) { setError('Ingresa un monto válido.'); return }
      const concepto = abonoConcepto.trim() || 'Abono al plan de tratamiento'
      items = [{ descripcion: concepto, monto }]
    } else {
      if (seleccionados.length === 0) { setError('Marca al menos un tratamiento.'); return }
      items = seleccionados.map((t: any) => ({
        tratamientoId: t.id,
        descripcion:   t.diente ? `${t.descripcion} (diente ${t.diente})` : t.descripcion,
        monto:         t.monto,
      }))
    }

    setSaving(true)
    try {
      const res = await fetch('/api/cobros', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pacienteId:     paciente.id,
          cajaId,
          medioPagoId:    medioPagoId || null,
          reciboUsuarioId: reciboUsuarioId || null,
          notas:          notas || null,
          items,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? `Error ${res.status}`); return }
      onCobro?.()
    } finally { setSaving(false) }
  }

  return (
    <div>
      <h2 className="text-2xl font-light text-slate-700 mb-5">Recibir pago</h2>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiBox label="Realizado" value={formatCLP(kpis.realizado)} />
        <KpiBox label="Abonado" value={formatCLP(kpis.abonado)} />
        <KpiBox label="Saldo pendiente" value={formatCLP(kpis.saldo)} tono={kpis.saldo > 0 ? 'red' : 'emerald'} />
      </div>

      {!canReceive ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-6">
          No tienes permiso para recibir pagos. Pide al admin que active el toggle <strong>&ldquo;Recibir pagos&rdquo;</strong> en tu usuario.
        </div>
      ) : cajas.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 mb-6">
          <p className="font-semibold mb-1">No hay cajas disponibles para recibir pagos.</p>
          <p className="text-xs">
            Para recaudar necesitas una caja con <strong>sesión abierta</strong>.
            {' '}Ve a <Link href="/cobros/caja" className="underline font-medium">Cobros → Caja</Link>{' '}
            y abre tu caja declarando el conteo inicial.
            {' '}Si no tienes ninguna caja asignada, pide al admin que te asigne una.
          </p>
        </div>
      ) : (
        <form onSubmit={registrar} className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-5">
          {/* Toggle modo */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Tipo de cobro *</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setModoCobro('tratamientos')}
                className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${modoCobro === 'tratamientos' ? 'bg-cyan-50 border-cyan-500 text-cyan-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                Tratamientos completados
              </button>
              <button type="button" onClick={() => setModoCobro('abono')}
                className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-all ${modoCobro === 'abono' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                Abono libre
              </button>
            </div>
          </div>

          {modoCobro === 'tratamientos' ? (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">
                Tratamientos a cobrar *
                {tratamientos.length === 0 && (
                  <span className="ml-2 text-xs text-amber-600 font-normal">Sin tratamientos pendientes — usa <strong>Abono libre</strong>.</span>
                )}
              </p>
              {tratamientos.length > 0 && (
                <div className="space-y-1.5">
                  {tratamientos.map((t: any) => (
                    <label key={t.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors ${selected.has(t.id) ? 'bg-cyan-50 border-cyan-300' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="w-4 h-4 accent-cyan-600 rounded" />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{t.descripcion}{t.diente ? <span className="text-slate-400 font-normal"> · diente {t.diente}</span> : ''}</p>
                          {t.fechaCompletado && <p className="text-xs text-slate-400">{formatDate(t.fechaCompletado)}</p>}
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-slate-900">{formatCLP(t.monto)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto *</label>
                <input value={abonoConcepto} onChange={e => setAbonoConcepto(e.target.value)}
                  placeholder="Abono al plan de tratamiento"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto (CLP) *</label>
                <input type="number" min="1" step="1" inputMode="numeric"
                  value={abonoMonto} onChange={e => setAbonoMonto(e.target.value)}
                  placeholder="50000"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Caja *</label>
              <select value={cajaId} onChange={e => setCajaId(e.target.value)} required
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                {cajas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Medio de pago</label>
              <select value={medioPagoId} onChange={e => setMedioPagoId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="">Sin especificar</option>
                {mediosPago.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.nombre}{m.comision > 0 ? ` (${m.comision}%)` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Recibe el pago</label>
              <select value={reciboUsuarioId} onChange={e => setReciboUsuarioId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="">— Yo —</option>
                {cajeros.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
              <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..."
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
          </div>

          {subtotal > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">
                  {modoCobro === 'abono'
                    ? 'Abono libre'
                    : `Subtotal (${selected.size} tratamiento${selected.size !== 1 ? 's' : ''})`}
                </span>
                <span className="font-semibold">{formatCLP(subtotal)}</span>
              </div>
              {comision > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Comisión {medio?.nombre} ({medio?.comision}%)</span>
                  <span>- {formatCLP(comision)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t border-slate-200 pt-1.5">
                <span>Neto a caja</span>
                <span className="text-teal-700">{formatCLP(neto)}</span>
              </div>
            </div>
          )}

          {error && <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="flex justify-end">
            <button type="submit"
              disabled={saving || !cajaId || (modoCobro === 'tratamientos' ? selected.size === 0 : !(Number(abonoMonto) > 0))}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-300 text-white rounded-xl text-sm font-medium">
              {saving ? 'Registrando…' : `Registrar pago ${subtotal > 0 ? formatCLP(subtotal) : ''}`}
            </button>
          </div>
        </form>
      )}

      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Historial</p>
      {paciente.cobros.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">Sin cobros registrados.</p>
      ) : (
        <div className="space-y-2">
          {paciente.cobros.map((c: any) => (
            <div key={c.id} className="border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">Cobro N° {c.numero}</p>
                <p className="text-xs text-slate-500">{c.concepto}</p>
                <p className="text-xs text-slate-400">{c.fechaPago ? formatDateTime(c.fechaPago) : formatDateTime(c.createdAt)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800">{formatCLP(c.monto)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.anulado ? 'bg-rose-100 text-rose-700' : c.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{c.anulado ? 'ANULADO' : c.estado}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────── Helpers ────────

function Field({ label, value, onChange, type = 'text', placeholder, wide }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; wide?: boolean
}) {
  return (
    <div className={wide ? 'md:col-span-3' : ''}>
      <label className="block text-xs text-slate-500 mb-1 font-medium">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full px-0 py-1.5 border-0 border-b border-slate-200 focus:border-cyan-500 focus:outline-none text-sm bg-transparent" />
    </div>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][]
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1 font-medium">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-0 py-1.5 border-0 border-b border-slate-200 focus:border-cyan-500 focus:outline-none text-sm bg-transparent">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function Info({ label, valor, placeholder, wide }: { label: string; valor: any; placeholder: string; wide?: boolean }) {
  return (
    <div className={`border border-slate-200 rounded-xl p-4 ${wide ? 'md:col-span-2' : ''}`}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm ${valor ? 'text-slate-700' : 'text-slate-400'}`}>{valor ?? placeholder}</p>
    </div>
  )
}

function KpiBox({ label, value, tono }: { label: string; value: string; tono?: 'red' | 'emerald' }) {
  const tones = {
    red:     'bg-red-50 border-red-100 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${tono ? tones[tono] : 'bg-slate-50 border-slate-100'}`}>
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-1 ${tono ? '' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
