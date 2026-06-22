import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CitaDTO, PacienteDTO, PrestacionDTO } from '@shared/types'
import { CITA_ESTADOS } from '@shared/constants/cita-estados'
import { pacientesService, type FichaClinica, type ResumenPaciente, type ComentarioDTO, type MensajeDTO } from '@/services/clinica.service'
import { planesService, seccionesService, tratamientosService, evolucionesService, odontogramaService } from '@/services/clinico.service'
import { prestacionesService } from '@/services/catalogo.service'
import { ApiError } from '@/services/api'

const TABS = ['Datos', 'Citas', 'Planes', 'Evoluciones', 'Odontograma', 'Comentarios', 'Mensajes'] as const
type Tab = typeof TABS[number]

const DIENTE_ESTADOS = [
  { v: 'SANO', l: 'Sano', c: '#e2e8f0', t: '#334155' },
  { v: 'CARIES', l: 'Caries', c: '#ef4444', t: '#fff' },
  { v: 'OBTURADO', l: 'Obturado', c: '#3b82f6', t: '#fff' },
  { v: 'CORONA', l: 'Corona', c: '#f59e0b', t: '#fff' },
  { v: 'ENDODONCIA', l: 'Endodoncia', c: '#8b5cf6', t: '#fff' },
  { v: 'IMPLANTE', l: 'Implante', c: '#10b981', t: '#fff' },
  { v: 'AUSENTE', l: 'Ausente', c: '#94a3b8', t: '#fff' },
]
const ESTADO_COLOR = (e: string) => DIENTE_ESTADOS.find((d) => d.v === e) ?? DIENTE_ESTADOS[0]
const SUP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const INF = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const fmtCLP = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(n)
const edad = (iso: string | null) => { if (!iso) return null; const d = new Date(iso); return Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5)) }

export function FichaPaciente() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<Tab>('Datos')
  const [paciente, setPaciente] = useState<PacienteDTO | null>(null)
  const [resumen, setResumen] = useState<ResumenPaciente | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { pacientesService.obtener(id).then(setPaciente).catch((e) => setError(e.message)) }, [id])
  useEffect(() => { pacientesService.resumen(id).then(setResumen).catch(() => {}) }, [id])

  if (error) return <p className="text-rose-600 text-sm">{error}</p>
  if (!paciente) return <p className="text-slate-500 text-sm">Cargando…</p>

  const ed = edad(paciente.fechaNacimiento)

  return (
    <div className="max-w-4xl">
      <Link to="/pacientes" className="text-sm text-cyan-600 hover:underline">← Volver a pacientes</Link>
      <div className="mt-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-700 text-white p-6 mb-4">
        <h1 className="text-2xl font-bold">{paciente.nombre} {paciente.apellido}</h1>
        <p className="text-cyan-100 text-sm mt-1">
          {paciente.rut ?? 'Sin RUT'}{ed != null ? ` · ${ed} años` : ''}{paciente.prevision ? ` · ${paciente.prevision}` : ''}
          {paciente.telefono ? ` · ${paciente.telefono}` : ''}
        </p>
        {resumen && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm">
            <KpiInline l="Tratamientos activos" v={String(resumen.activos)} />
            <KpiInline l="Finalizados" v={String(resumen.finalizados)} />
            <KpiInline l="Realizado" v={fmtCLP(resumen.realizado)} />
            <KpiInline l="Abonado" v={fmtCLP(resumen.abonado)} />
            <KpiInline l="Saldo" v={fmtCLP(resumen.saldo)} destacado={resumen.saldo > 0} />
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap ${tab === t ? 'text-cyan-700 border-b-2 border-cyan-600' : 'text-slate-500 hover:text-slate-700'}`}>{t}</button>
        ))}
      </div>

      {tab === 'Datos' && <DatosTab paciente={paciente} onSaved={setPaciente} />}
      {tab === 'Citas' && <CitasTab pacienteId={id} />}
      {tab === 'Planes' && <PlanesTab pacienteId={id} />}
      {tab === 'Evoluciones' && <EvolucionesTab pacienteId={id} />}
      {tab === 'Odontograma' && <OdontogramaTab pacienteId={id} />}
      {tab === 'Comentarios' && <ComentariosTab pacienteId={id} />}
      {tab === 'Mensajes' && <MensajesTab pacienteId={id} />}
    </div>
  )
}

function KpiInline({ l, v, destacado }: { l: string; v: string; destacado?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-cyan-200/80">{l}</span>
      <span className={`font-semibold ${destacado ? 'text-amber-200' : 'text-white'}`}>{v}</span>
    </span>
  )
}

// ── Comentarios administrativos ──
function ComentariosTab({ pacienteId }: { pacienteId: string }) {
  const [comentarios, setComentarios] = useState<ComentarioDTO[]>([])
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargar = () => pacientesService.comentarios(pacienteId).then(setComentarios).catch(() => {})
  useEffect(() => { cargar() }, [pacienteId])
  async function agregar() {
    if (!texto.trim()) return
    setGuardando(true)
    try { await pacientesService.agregarComentario(pacienteId, texto.trim()); setTexto(''); cargar() } finally { setGuardando(false) }
  }
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Comentario administrativo (interno)…"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={agregar} disabled={guardando || !texto.trim()} className="mt-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">Agregar</button>
      </div>
      <div className="space-y-3">
        {comentarios.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.texto}</p>
            <p className="text-xs text-slate-400 mt-2">{c.autorNombre ?? 'Sistema'} · {new Date(c.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        ))}
        {comentarios.length === 0 && <p className="text-sm text-slate-500">Sin comentarios.</p>}
      </div>
    </div>
  )
}

// ── Historial de mensajes (solo lectura) ──
function MensajesTab({ pacienteId }: { pacienteId: string }) {
  const [mensajes, setMensajes] = useState<MensajeDTO[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => { pacientesService.mensajes(pacienteId).then(setMensajes).finally(() => setCargando(false)) }, [pacienteId])
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (mensajes.length === 0) return <p className="text-slate-500 text-sm">No hay mensajes registrados para este paciente.</p>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {mensajes.map((m) => (
        <div key={m.id} className="px-5 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-800">{m.asunto || m.categoria}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">{m.tipo} · {m.estado}</span>
          </div>
          {m.cuerpo && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{m.cuerpo}</p>}
          <p className="text-xs text-slate-400 mt-1">{m.enviadoA ? `${m.enviadoA} · ` : ''}{new Date(m.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
      ))}
    </div>
  )
}

// ── Datos + ficha clínica ──
function DatosTab({ paciente, onSaved }: { paciente: PacienteDTO; onSaved: (p: PacienteDTO) => void }) {
  const [form, setForm] = useState({ nombre: paciente.nombre, apellido: paciente.apellido, rut: paciente.rut ?? '', telefono: paciente.telefono ?? '', email: paciente.email ?? '', prevision: paciente.prevision ?? '' })
  const [ficha, setFicha] = useState<FichaClinica | null>(null)
  const [flags, setFlags] = useState({ fumador: false, diabetico: false, hipertenso: false, cardiopatia: false, alertasMedicas: '', medicamentos: '' })
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    pacientesService.ficha(paciente.id).then((f) => {
      setFicha(f.ficha)
      if (f.ficha) setFlags({ fumador: f.ficha.fumador, diabetico: f.ficha.diabetico, hipertenso: f.ficha.hipertenso, cardiopatia: f.ficha.cardiopatia, alertasMedicas: f.ficha.alertasMedicas ?? '', medicamentos: f.ficha.medicamentos ?? '' })
    }).catch(() => {})
  }, [paciente.id])

  async function guardar() {
    setSaving(true); setMsg('')
    try {
      const p = await pacientesService.actualizar(paciente.id, form)
      await pacientesService.guardarFicha(paciente.id, flags)
      onSaved(p)
      setMsg('Cambios guardados')
    } catch { setMsg('Error al guardar') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 grid sm:grid-cols-2 gap-3">
        <In label="Nombre" v={form.nombre} on={(x) => setForm({ ...form, nombre: x })} />
        <In label="Apellido" v={form.apellido} on={(x) => setForm({ ...form, apellido: x })} />
        <In label="RUT" v={form.rut} on={(x) => setForm({ ...form, rut: x })} />
        <In label="Teléfono" v={form.telefono} on={(x) => setForm({ ...form, telefono: x })} />
        <In label="Email" v={form.email} on={(x) => setForm({ ...form, email: x })} />
        <In label="Previsión" v={form.prevision} on={(x) => setForm({ ...form, prevision: x })} />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Ficha clínica {ficha ? '' : '(sin datos aún)'}</p>
        <div className="flex flex-wrap gap-4 mb-3">
          {([['fumador', 'Fumador'], ['diabetico', 'Diabético'], ['hipertenso', 'Hipertenso'], ['cardiopatia', 'Cardiopatía']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} /> {l}
            </label>
          ))}
        </div>
        <In label="Alertas médicas" v={flags.alertasMedicas} on={(x) => setFlags({ ...flags, alertasMedicas: x })} />
        <div className="h-3" />
        <In label="Medicamentos" v={flags.medicamentos} on={(x) => setFlags({ ...flags, medicamentos: x })} />
      </div>
      <div className="flex items-center gap-3">
        <button onClick={guardar} disabled={saving} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{saving ? 'Guardando…' : 'Guardar'}</button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>
    </div>
  )
}

// ── Citas del paciente ──
function CitasTab({ pacienteId }: { pacienteId: string }) {
  const [citas, setCitas] = useState<CitaDTO[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => { pacientesService.citas(pacienteId).then(setCitas).finally(() => setCargando(false)) }, [pacienteId])
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (citas.length === 0) return <p className="text-slate-500 text-sm">Este paciente no tiene citas.</p>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {citas.map((c) => {
        const cfg = CITA_ESTADOS[c.estado]
        return (
          <div key={c.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{new Date(c.inicio).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-xs text-slate-500">{c.doctor} · {c.tipo}</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>{cfg?.label ?? c.estado}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Planes de tratamiento (estilo Dentalink) ──
interface CobroItemLite { monto: number; cobro: { estado: string } | null }
interface TratNode {
  id: string; estado: string; precio: number; descuento: number; diente: number | null; cara: string | null
  prestacion: { nombre: string; categoria: string | null }; cobroItems: CobroItemLite[]
}
interface SeccionNode { id: string; titulo: string; fechaTentativa: string | null; diasDesdeAnterior: number | null; tratamientos: TratNode[] }
interface PlanLite { id: string; nombre: string; estado: string; bloqueado?: boolean; _count?: { tratamientos: number } }
interface PlanDetalle { id: string; nombre: string; estado: string; bloqueado: boolean; secciones: SeccionNode[]; tratamientos: TratNode[] }

const CARAS = [['V', 'Vestibular'], ['L', 'Lingual/Palatino'], ['M', 'Mesial'], ['D', 'Distal'], ['O', 'Oclusal/Incisal']] as const
const netoTrat = (t: TratNode) => Math.round(t.precio * (1 - (t.descuento || 0) / 100))
const pagadoTrat = (t: TratNode) => t.cobroItems.filter((ci) => ci.cobro?.estado === 'PAGADO').reduce((s, ci) => s + ci.monto, 0)
const pagadaTrat = (t: TratNode) => netoTrat(t) > 0 && pagadoTrat(t) >= netoTrat(t) - 0.5

function PlanesTab({ pacienteId }: { pacienteId: string }) {
  const [planes, setPlanes] = useState<PlanLite[]>([])
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [prestaciones, setPrestaciones] = useState<PrestacionDTO[]>([])
  const [error, setError] = useState('')

  const cargarPlanes = () => planesService.listar(pacienteId).then((p) => setPlanes(p as PlanLite[])).catch(() => {})
  useEffect(() => { cargarPlanes(); prestacionesService.listar().then((ps) => setPrestaciones(ps.filter((p) => p.activo))).catch(() => {}) }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = async (planId: string) => { try { setDetalle(await planesService.obtener(planId) as PlanDetalle) } catch (e) { setError((e as Error).message) } }
  const recargar = () => { if (detalle) abrir(detalle.id) }
  async function crearPlan() { const p = await planesService.crear({ pacienteId }) as { id: string }; cargarPlanes(); abrir(p.id) }

  async function accion<T>(fn: () => Promise<T>) {
    setError('')
    try { await fn(); recargar(); cargarPlanes() } catch (e) { setError(e instanceof ApiError ? e.message : 'Error') }
  }

  // Presupuesto del plan (todas las acciones, con/sin sección).
  const todas = detalle ? [...detalle.secciones.flatMap((s) => s.tratamientos), ...detalle.tratamientos] : []
  const total = todas.reduce((s, t) => s + netoTrat(t), 0)
  const realizado = todas.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + netoTrat(t), 0)
  const abonado = todas.reduce((s, t) => s + pagadoTrat(t), 0)

  return (
    <div className="grid md:grid-cols-[240px_1fr] gap-4">
      <div>
        <button onClick={crearPlan} className="w-full mb-3 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Nuevo plan</button>
        <div className="space-y-2">
          {planes.map((p) => (
            <button key={p.id} onClick={() => abrir(p.id)}
              className={`w-full text-left p-3 rounded-xl border ${detalle?.id === p.id ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white hover:border-cyan-300'}`}>
              <p className="text-sm font-semibold text-slate-800">{p.nombre}</p>
              <p className="text-xs text-slate-500">{p.estado}{p._count ? ` · ${p._count.tratamientos} acc.` : ''}{p.bloqueado ? ' · 🔒' : ''}</p>
            </button>
          ))}
          {planes.length === 0 && <p className="text-sm text-slate-500">Sin planes.</p>}
        </div>
      </div>

      <div>
        {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
        {!detalle ? (
          <p className="text-sm text-slate-500">Selecciona o crea un plan.</p>
        ) : (
          <div className="space-y-4">
            {/* Presupuesto */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <h3 className="font-semibold text-slate-900">{detalle.nombre}</h3>
                <button onClick={() => accion(() => planesService.actualizar(detalle.id, { bloqueado: !detalle.bloqueado }))}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${detalle.bloqueado ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                  {detalle.bloqueado ? '🔒 Bloqueado · Desbloquear' : '🔓 Bloquear presupuesto'}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <Resumen l="Presupuesto total" v={fmtCLP(total)} />
                <Resumen l="Realizado" v={fmtCLP(realizado)} />
                <Resumen l="Abonado" v={fmtCLP(abonado)} />
                <Resumen l="Saldo por abonar" v={fmtCLP(Math.max(0, total - abonado))} destacado={total - abonado > 0} />
              </div>
            </div>

            {detalle.bloqueado && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Plan bloqueado: no se puede editar el presupuesto (agregar/quitar acciones, precios). Las acciones igual se pueden evolucionar. Desbloquéalo para editar.
              </p>
            )}

            {/* Secciones */}
            {detalle.secciones.map((s) => (
              <SeccionBloque key={s.id} seccion={s} plan={detalle} prestaciones={prestaciones} pacienteId={pacienteId} accion={accion} />
            ))}

            {/* Acciones sin sección */}
            {detalle.tratamientos.length > 0 && (
              <SeccionBloque seccion={{ id: '', titulo: 'Sin sección', fechaTentativa: null, diasDesdeAnterior: null, tratamientos: detalle.tratamientos }} plan={detalle} prestaciones={prestaciones} pacienteId={pacienteId} accion={accion} sinSeccion />
            )}

            {!detalle.bloqueado && <AgregarSeccion planId={detalle.id} accion={accion} />}
          </div>
        )}
      </div>
    </div>
  )
}

function Resumen({ l, v, destacado }: { l: string; v: string; destacado?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-xl px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p>
      <p className={`font-mono font-semibold ${destacado ? 'text-amber-600' : 'text-slate-800'}`}>{v}</p>
    </div>
  )
}

function SeccionBloque({ seccion, plan, prestaciones, pacienteId, accion, sinSeccion }: {
  seccion: SeccionNode; plan: PlanDetalle; prestaciones: PrestacionDTO[]; pacienteId: string
  accion: (fn: () => Promise<unknown>) => Promise<void>; sinSeccion?: boolean
}) {
  const [agregando, setAgregando] = useState(false)
  const totalSec = seccion.tratamientos.reduce((s, t) => s + netoTrat(t), 0)
  const tiempo = seccion.diasDesdeAnterior != null ? `~${seccion.diasDesdeAnterior} días` : (seccion.fechaTentativa ? new Date(seccion.fechaTentativa).toLocaleDateString('es-CL') : null)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-slate-800 text-sm truncate">{seccion.titulo}</span>
          {tiempo && <span className="text-xs text-slate-400">· {tiempo}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-slate-600">{fmtCLP(totalSec)}</span>
          {!sinSeccion && !plan.bloqueado && (
            <button onClick={() => accion(() => seccionesService.eliminar(seccion.id))} className="text-slate-300 hover:text-rose-600 text-sm" title="Eliminar sección">🗑</button>
          )}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {seccion.tratamientos.length === 0 && <p className="px-4 py-3 text-xs text-slate-400">Sin acciones.</p>}
        {seccion.tratamientos.map((t) => <AccionFila key={t.id} t={t} bloqueado={plan.bloqueado} accion={accion} />)}
      </div>
      {!plan.bloqueado && !sinSeccion && (
        <div className="px-4 py-2 border-t border-slate-100">
          {agregando
            ? <AgregarAccion planId={plan.id} seccionId={seccion.id} pacienteId={pacienteId} prestaciones={prestaciones} accion={accion} onDone={() => setAgregando(false)} />
            : <button onClick={() => setAgregando(true)} className="text-xs font-semibold text-cyan-700">+ Prestación</button>}
        </div>
      )}
    </div>
  )
}

function AccionFila({ t, bloqueado, accion }: { t: TratNode; bloqueado: boolean; accion: (fn: () => Promise<unknown>) => Promise<void> }) {
  const completado = t.estado === 'COMPLETADO'
  const pagada = pagadaTrat(t)
  const toggle = () => accion(() => tratamientosService.actualizar(t.id, { estado: completado ? 'PLANIFICADO' : 'COMPLETADO', fechaCompletado: completado ? null : new Date().toISOString() }))
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <button onClick={toggle} title={completado ? 'Completada (clic para revertir)' : 'Evolucionar a completada'}
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${completado ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}>
        {completado ? '✓' : ''}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800 truncate">{t.prestacion.nombre}</p>
        <p className="text-xs text-slate-400">
          {t.diente ? `Pieza ${t.diente}` : 'General'}{t.cara ? ` · caras ${t.cara.split('').join(',')}` : ''}{t.descuento ? ` · ${t.descuento}% dscto` : ''}
        </p>
      </div>
      <span className="text-sm font-mono text-slate-700 w-24 text-right">{fmtCLP(netoTrat(t))}</span>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${pagada ? 'bg-emerald-500' : 'bg-rose-400'}`} title={pagada ? 'Pagada' : 'Pendiente de pago'} />
      {!bloqueado && <button onClick={() => accion(() => tratamientosService.eliminar(t.id))} className="text-slate-300 hover:text-rose-600 text-sm shrink-0" title="Quitar">×</button>}
    </div>
  )
}

function AgregarAccion({ planId, seccionId, pacienteId, prestaciones, accion, onDone }: {
  planId: string; seccionId: string; pacienteId: string; prestaciones: PrestacionDTO[]
  accion: (fn: () => Promise<unknown>) => Promise<void>; onDone: () => void
}) {
  const [prestId, setPrestId] = useState('')
  const [pieza, setPieza] = useState('')
  const [caras, setCaras] = useState<string[]>([])
  const prest = prestaciones.find((p) => p.id === prestId)

  async function añadir() {
    if (!prestId) return
    await accion(() => tratamientosService.crear({
      pacienteId, prestacionId: prestId, planId, seccionId,
      precio: prest?.precio, piezas: pieza ? [Number(pieza)] : undefined, cara: caras.length ? caras.join('') : undefined,
    }))
    onDone()
  }

  return (
    <div className="space-y-2 py-1">
      <div className="flex gap-2 flex-wrap">
        <select value={prestId} onChange={(e) => setPrestId(e.target.value)} className="flex-1 min-w-[12rem] px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
          <option value="">Prestación…</option>
          {prestaciones.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {fmtCLP(p.precio)}</option>)}
        </select>
        <input value={pieza} onChange={(e) => setPieza(e.target.value)} placeholder="Pieza (FDI)" inputMode="numeric" className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
        <span>Caras:</span>
        {CARAS.map(([c, label]) => (
          <button key={c} type="button" title={label}
            onClick={() => setCaras((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c])}
            className={`px-2 py-1 rounded-md border ${caras.includes(c) ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600'}`}>{c}</button>
        ))}
        <span className="text-slate-300">(vacío = diente completo / implante)</span>
      </div>
      <div className="flex gap-2">
        <button onClick={añadir} disabled={!prestId} className="px-3 py-1.5 bg-cyan-600 disabled:opacity-50 text-white text-sm rounded-lg">Añadir</button>
        <button onClick={onDone} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
      </div>
    </div>
  )
}

function AgregarSeccion({ planId, accion }: { planId: string; accion: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [dias, setDias] = useState('')
  if (!abierto) return <button onClick={() => setAbierto(true)} className="text-sm font-semibold text-cyan-700">+ Sección</button>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 flex gap-2 flex-wrap items-center">
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre de la sección" className="flex-1 min-w-[12rem] px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      <input value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Días estimados" inputMode="numeric" className="w-32 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      <button onClick={async () => { await accion(() => planesService.crearSeccion(planId, { titulo: titulo.trim() || undefined, diasDesdeAnterior: dias ? Number(dias) : undefined })); setAbierto(false); setTitulo(''); setDias('') }}
        className="px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg">Crear</button>
      <button onClick={() => setAbierto(false)} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
    </div>
  )
}

// ── Evoluciones ──
function EvolucionesTab({ pacienteId }: { pacienteId: string }) {
  interface Evo { id: string; texto: string; createdAt: string; autor?: { name: string | null; username: string | null } }
  const [evos, setEvos] = useState<Evo[]>([])
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargar = () => evolucionesService.listar(pacienteId).then((e) => setEvos(e as Evo[]))
  useEffect(() => { cargar() }, [pacienteId])
  async function agregar() {
    if (!texto.trim()) return
    setGuardando(true)
    try { await evolucionesService.crear({ pacienteId, texto: texto.trim() }); setTexto(''); cargar() } finally { setGuardando(false) }
  }
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Nueva evolución clínica…"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={agregar} disabled={guardando || !texto.trim()} className="mt-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">Agregar</button>
      </div>
      <div className="space-y-3">
        {evos.map((e) => (
          <div key={e.id} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.texto}</p>
            <p className="text-xs text-slate-400 mt-2">{e.autor?.name ?? e.autor?.username ?? 'Sistema'} · {new Date(e.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        ))}
        {evos.length === 0 && <p className="text-sm text-slate-500">Sin evoluciones registradas.</p>}
      </div>
    </div>
  )
}

// ── Odontograma ──
function OdontogramaTab({ pacienteId }: { pacienteId: string }) {
  const [dientes, setDientes] = useState<Record<number, string>>({})
  const [sel, setSel] = useState<number | null>(null)
  useEffect(() => {
    pacientesService.ficha(pacienteId).then((f) => {
      const map: Record<number, string> = {}
      for (const d of f.odontograma) map[d.numero] = d.estado
      setDientes(map)
    }).catch(() => {})
  }, [pacienteId])

  async function setEstado(numero: number, estado: string) {
    setDientes((m) => ({ ...m, [numero]: estado }))
    setSel(null)
    await odontogramaService.upsertDiente({ pacienteId, numero, estado }).catch(() => {})
  }

  const Tooth = ({ n }: { n: number }) => {
    const cfg = ESTADO_COLOR(dientes[n] ?? 'SANO')
    return (
      <button onClick={() => setSel(sel === n ? null : n)}
        className={`w-9 h-11 rounded-md border text-[11px] font-bold flex items-center justify-center transition-transform hover:scale-105 ${sel === n ? 'ring-2 ring-cyan-500' : ''}`}
        style={{ backgroundColor: cfg.c, color: cfg.t, borderColor: 'rgba(0,0,0,0.1)' }}>{n}</button>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="space-y-3 overflow-x-auto">
        <div className="flex gap-1 justify-center">{SUP.map((n) => <Tooth key={n} n={n} />)}</div>
        <div className="flex gap-1 justify-center">{INF.map((n) => <Tooth key={n} n={n} />)}</div>
      </div>

      {sel != null && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Pieza {sel} — marcar como:</p>
          <div className="flex flex-wrap gap-2">
            {DIENTE_ESTADOS.map((d) => (
              <button key={d.v} onClick={() => setEstado(sel, d.v)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border" style={{ backgroundColor: d.c, color: d.t, borderColor: 'rgba(0,0,0,0.1)' }}>{d.l}</button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {DIENTE_ESTADOS.map((d) => (
          <span key={d.v} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-3 rounded" style={{ background: d.c }} /> {d.l}
          </span>
        ))}
      </div>
    </div>
  )
}

function In({ label, v, on }: { label: string; v: string; on: (x: string) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
