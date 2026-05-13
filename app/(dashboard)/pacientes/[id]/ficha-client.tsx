'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { formatRUT, formatDate, formatDateTime, calcularEdad, formatCLP } from '@/lib/utils'
import { PlanTratamiento } from '@/components/PlanTratamiento'

const TABS_PRINCIPALES = ['Datos personales', 'Ficha clínica', 'Planes de tratamiento', 'Facturación y pagos', 'Recibir pago'] as const
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

export function FichaClinicaClient({ paciente: initial, doctors, prestaciones }: any) {
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
            <PlanTratamiento
              pacienteId={paciente.id}
              pacienteNombre={`${paciente.nombre} ${paciente.apellido}`}
              fichaId={paciente.fichaClinica?.id}
              tratamientos={(paciente.fichaClinica?.tratamientos ?? []) as any}
              dientesExistentes={(paciente.fichaClinica?.odontograma ?? []).map((d: any) => ({ numero: d.numero, estadoActual: d.estado }))}
              prestaciones={prestaciones}
              onPresupuesto={() => window.location.reload()}
            />
          )}

          {tab === 'Facturación y pagos' && (
            <FacturacionPagos paciente={paciente} kpis={kpis} />
          )}

          {tab === 'Recibir pago' && (
            <RecibirPago paciente={paciente} kpis={kpis} onCobro={() => window.location.reload()} />
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
    <div className={`rounded-xl px-3 py-2 text-xs ${tiene ? 'bg-red-500/20 border border-red-300/30' : 'bg-white/10 border border-white/20'}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-base">{icon}</span>
        <span className="font-medium text-white">{label}</span>
      </div>
      <p className={`${tiene ? 'text-white' : 'text-cyan-100/70'} truncate`}>{tiene ? valor : 'Sin información'}</p>
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

function FacturacionPagos({ paciente, kpis }: any) {
  return (
    <div>
      <h2 className="text-2xl font-light text-slate-700 mb-5">Facturación y pagos</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiBox label="Realizado" value={formatCLP(kpis.realizado)} />
        <KpiBox label="Abonado" value={formatCLP(kpis.abonado)} />
        <KpiBox label="Saldo" value={formatCLP(kpis.saldo)} tono={kpis.saldo > 0 ? 'red' : 'emerald'} />
      </div>

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
    </div>
  )
}

function RecibirPago({ paciente, kpis }: any) {
  return (
    <div>
      <h2 className="text-2xl font-light text-slate-700 mb-5">Recibir pago</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <KpiBox label="Realizado" value={formatCLP(kpis.realizado)} />
        <KpiBox label="Abonado" value={formatCLP(kpis.abonado)} />
        <KpiBox label="Saldo pendiente" value={formatCLP(kpis.saldo)} tono={kpis.saldo > 0 ? 'red' : 'emerald'} />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Los cobros se registran en el módulo de Cobros. Aquí ves el historial del paciente.
      </p>
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
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.estado === 'PAGADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{c.estado}</span>
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
