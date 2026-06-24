import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CitaDTO, DoctorDTO, PacienteDTO, PrestacionDTO } from '@shared/types'
import { CITA_ESTADOS } from '@shared/constants/cita-estados'
import { pacientesService, type FichaClinica, type ResumenPaciente, type ComentarioDTO, type MensajeDTO } from '@/services/clinica.service'
import { planesService, seccionesService, tratamientosService, evolucionesService } from '@/services/clinico.service'
import { prestacionesService } from '@/services/catalogo.service'
import { usuariosService } from '@/services/equipo.service'
import { ApiError } from '@/services/api'

const TABS = ['Datos', 'Citas', 'Planes de Tratamiento', 'Evoluciones', 'Comentarios', 'Mensajes'] as const
type Tab = typeof TABS[number]

// Numeración FDI: arcada superior (1.x/2.x) e inferior (4.x/3.x).
const SUP = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const INF = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const fmtCLP = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(n)
const hoyISO = () => new Date().toISOString().slice(0, 10)
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
      {tab === 'Planes de Tratamiento' && <PlanesTab pacienteId={id} pacienteNombre={`${paciente.nombre} ${paciente.apellido}`} />}
      {tab === 'Evoluciones' && <EvolucionesTab pacienteId={id} />}
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
  doctor: { id: string; name: string | null } | null
}
interface TratLite { estado: string; precio: number; descuento: number; cobroItems: CobroItemLite[] }
interface SeccionNode { id: string; titulo: string; fechaTentativa: string | null; diasDesdeAnterior: number | null; tratamientos: TratNode[] }
interface DoctorRef { id: string; name: string | null; email?: string | null }
interface PlanCard {
  id: string; nombre: string; estado: string; bloqueado?: boolean
  doctorTitular: DoctorRef | null; createdAt: string; updatedAt: string; fechaInicio: string | null
  _count?: { tratamientos: number; secciones: number }; tratamientos: TratLite[]
}
interface PlanDetalle {
  id: string; nombre: string; estado: string; bloqueado: boolean
  doctorTitularId: string | null; doctorTitular: DoctorRef | null
  secciones: SeccionNode[]; tratamientos: TratNode[]
}

const CARAS = [['V', 'Vestibular'], ['L', 'Lingual/Palatino'], ['M', 'Mesial'], ['D', 'Distal'], ['O', 'Oclusal/Incisal']] as const
const netoTrat = (t: { precio: number; descuento: number }) => Math.round(t.precio * (1 - (t.descuento || 0) / 100))
const pagadoTrat = (t: { cobroItems: CobroItemLite[] }) => t.cobroItems.filter((ci) => ci.cobro?.estado === 'PAGADO').reduce((s, ci) => s + ci.monto, 0)
const pagadaTrat = (t: TratNode) => netoTrat(t) > 0 && pagadoTrat(t) >= netoTrat(t) - 0.5
const planFinanzas = (trats: TratLite[]) => {
  const total = trats.reduce((s, t) => s + netoTrat(t), 0)
  const realizado = trats.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + netoTrat(t), 0)
  const abonado = trats.reduce((s, t) => s + pagadoTrat(t), 0)
  const hechas = trats.filter((t) => t.estado === 'COMPLETADO').length
  return { total, realizado, abonado, saldo: Math.max(0, total - abonado), progreso: trats.length ? Math.round((hechas / trats.length) * 100) : 0, hechas, n: trats.length }
}

function PlanesTab({ pacienteId, pacienteNombre }: { pacienteId: string; pacienteNombre: string }) {
  const [planes, setPlanes] = useState<PlanCard[]>([])
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [prestaciones, setPrestaciones] = useState<PrestacionDTO[]>([])
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [piezaSel, setPiezaSel] = useState<number | null>(null)
  const [carasSel, setCarasSel] = useState<string[]>([])
  const [evoAccion, setEvoAccion] = useState<TratNode | null>(null)
  const [error, setError] = useState('')

  const cargarPlanes = () => planesService.listar(pacienteId).then((p) => setPlanes(p as PlanCard[])).catch(() => {})
  useEffect(() => {
    cargarPlanes()
    prestacionesService.listar().then((ps) => setPrestaciones(ps.filter((p) => p.activo))).catch(() => {})
    usuariosService.doctores().then(setDoctores).catch(() => {})
  }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = async (planId: string) => { try { setPiezaSel(null); setCarasSel([]); setDetalle(await planesService.obtener(planId) as PlanDetalle) } catch (e) { setError((e as Error).message) } }
  const recargar = () => { if (detalle) abrir(detalle.id) }
  // Selección visual en el odontograma: clic en una cara la marca; clic en otra
  // pieza reinicia; el número de la pieza la selecciona completa (implante).
  const selFace = (n: number, f: string) => {
    if (piezaSel !== n) { setPiezaSel(n); setCarasSel([f]) }
    else setCarasSel((cs) => cs.includes(f) ? cs.filter((x) => x !== f) : [...cs, f])
  }
  const selWhole = (n: number) => { setPiezaSel((p) => (p === n ? null : n)); setCarasSel([]) }
  async function crearPlan() { const p = await planesService.crear({ pacienteId, doctorTitularId: doctores[0]?.id }) as { id: string }; cargarPlanes(); abrir(p.id) }

  async function accion<T>(fn: () => Promise<T>) {
    setError('')
    try { await fn(); recargar(); cargarPlanes() } catch (e) { setError(e instanceof ApiError ? e.message : 'Error') }
  }
  async function eliminarPlan(id: string) {
    if (!window.confirm('¿Eliminar este plan? Las acciones ya realizadas quedan registradas en la ficha del paciente.')) return
    await accion(() => planesService.eliminar(id))
    if (detalle?.id === id) setDetalle(null)
  }
  function renombrar() {
    if (!detalle) return
    const nombre = window.prompt('Nombre del plan de tratamiento', detalle.nombre)
    if (nombre && nombre.trim()) accion(() => planesService.actualizar(detalle.id, { nombre: nombre.trim() }))
  }

  return (
    <div>
      {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {detalle ? (
        <PlanDetalleView
          plan={detalle} prestaciones={prestaciones} doctores={doctores} pacienteId={pacienteId}
          piezaSel={piezaSel} carasSel={carasSel} selFace={selFace} selWhole={selWhole} accion={accion}
          onCerrar={() => setDetalle(null)} onEvolucionar={setEvoAccion} onRenombrar={renombrar}
          onBloquear={() => accion(() => planesService.actualizar(detalle.id, { bloqueado: !detalle.bloqueado }))}
          onProfesional={(id) => accion(() => planesService.actualizar(detalle.id, { doctorTitularId: id || null }))}
        />
      ) : (
        <PlanLista planes={planes} onAbrir={abrir} onNuevo={crearPlan} onEliminar={eliminarPlan} />
      )}
      {evoAccion && detalle && (
        <EvolucionModal accion={evoAccion} pacienteNombre={pacienteNombre} doctores={doctores} plan={detalle}
          onClose={() => setEvoAccion(null)}
          onDone={() => { setEvoAccion(null); recargar(); cargarPlanes() }} />
      )}
    </div>
  )
}

function ProgresoRing({ pct }: { pct: number }) {
  const r = 15, c = 2 * Math.PI * r
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" className="shrink-0">
      <circle cx="21" cy="21" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle cx="21" cy="21" r={r} fill="none" stroke="#0891b2" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 21 21)" />
      <text x="21" y="21" textAnchor="middle" dominantBaseline="central" fontSize="10" className="fill-slate-600 font-semibold">{pct}%</text>
    </svg>
  )
}

function Linea({ l, v, destacado }: { l: string; v: string; destacado?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-slate-500">{l}</span>
      <span className={`font-mono font-semibold ${destacado ? 'text-amber-600' : 'text-slate-800'}`}>{v}</span>
    </div>
  )
}

function Campo({ l, v }: { l: string; v: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p>
      <p className="text-sm text-slate-700 truncate">{v}</p>
    </div>
  )
}

function PlanTarjeta({ p, onAbrir, onEliminar }: { p: PlanCard; onAbrir: (id: string) => void; onEliminar: (id: string) => void }) {
  const fin = planFinanzas(p.tratamientos)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-cyan-300 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => onAbrir(p.id)} className="text-cyan-700 font-semibold hover:underline truncate">#{p.id.slice(-4)}: {p.nombre}</button>
        <button onClick={() => onEliminar(p.id)} className="text-slate-300 hover:text-rose-600 shrink-0" title="Eliminar plan">🗑</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3 items-center">
        <Campo l="Profesional" v={p.doctorTitular?.name ?? '—'} />
        <Campo l="Acciones" v={`${fin.hechas}/${fin.n}`} />
        <div className="flex items-center gap-2"><ProgresoRing pct={fin.progreso} /><span className="text-[11px] uppercase tracking-wide text-slate-400">Progreso</span></div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Estado financiero</p>
          {fin.saldo > 0
            ? <p className="text-sm font-semibold text-amber-600">● Hay saldo</p>
            : <p className="text-sm font-semibold text-emerald-600">✓ Sin saldo</p>}
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-3 border-t border-slate-100 pt-2">
        Creado: {new Date(p.createdAt).toLocaleDateString('es-CL', { dateStyle: 'long' })} · Última actividad: {new Date(p.updatedAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </div>
  )
}

function PlanLista({ planes, onAbrir, onNuevo, onEliminar }: {
  planes: PlanCard[]; onAbrir: (id: string) => void; onNuevo: () => void; onEliminar: (id: string) => void
}) {
  const enEjecucion = planes.filter((p) => p.estado !== 'FINALIZADO')
  const finalizados = planes.filter((p) => p.estado === 'FINALIZADO')
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-900">Planes de tratamiento</h2>
        <button onClick={onNuevo} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl whitespace-nowrap">+ Nuevo plan de tratamiento</button>
      </div>
      {planes.length === 0 && <p className="text-sm text-slate-500">Este paciente no tiene planes de tratamiento.</p>}
      {enEjecucion.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-semibold text-cyan-700 mb-2">En ejecución</p>
          <div className="space-y-3">{enEjecucion.map((p) => <PlanTarjeta key={p.id} p={p} onAbrir={onAbrir} onEliminar={onEliminar} />)}</div>
        </div>
      )}
      {finalizados.length > 0 && (
        <div className="mb-5">
          <p className="text-sm font-semibold text-slate-500 mb-2">Finalizados</p>
          <div className="space-y-3">{finalizados.map((p) => <PlanTarjeta key={p.id} p={p} onAbrir={onAbrir} onEliminar={onEliminar} />)}</div>
        </div>
      )}
    </div>
  )
}

function PlanDetalleView({ plan, prestaciones, doctores, pacienteId, piezaSel, carasSel, selFace, selWhole, accion, onCerrar, onEvolucionar, onRenombrar, onBloquear, onProfesional }: {
  plan: PlanDetalle; prestaciones: PrestacionDTO[]; doctores: DoctorDTO[]; pacienteId: string
  piezaSel: number | null; carasSel: string[]; selFace: (n: number, f: string) => void; selWhole: (n: number) => void
  accion: (fn: () => Promise<unknown>) => Promise<void>
  onCerrar: () => void; onEvolucionar: (t: TratNode) => void; onRenombrar: () => void
  onBloquear: () => void; onProfesional: (id: string) => void
}) {
  const todas = [...plan.secciones.flatMap((s) => s.tratamientos), ...plan.tratamientos]
  const fin = planFinanzas(todas)
  // Caras que ya tienen una acción, por pieza (para resaltarlas en el odontograma).
  const caraMap = new Map<number, Set<string>>()
  for (const t of todas) {
    if (t.diente == null) continue
    const set = caraMap.get(t.diente) ?? new Set<string>()
    for (const f of (t.cara ?? '').split('')) if (f.trim()) set.add(f)
    caraMap.set(t.diente, set)
  }
  return (
    <div>
      <button onClick={onCerrar} className="text-sm text-cyan-600 hover:underline mb-3">← Planes de tratamiento</button>
      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        {/* Panel izquierdo: presupuesto + datos */}
        <div className="space-y-3">
          <div className="rounded-2xl bg-gradient-to-br from-cyan-600 to-cyan-700 text-white p-4">
            <p className="text-xs text-cyan-100">Plan de tratamiento #{plan.id.slice(-4)}</p>
            <div className="flex items-center gap-2 mt-1">
              <h3 className="text-lg font-bold truncate">{plan.nombre}</h3>
              <button onClick={onRenombrar} title="Renombrar" className="text-cyan-100 hover:text-white shrink-0">✏️</button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-center text-[11px] uppercase tracking-wide text-slate-400">Presupuesto total</p>
            <p className="text-center text-2xl font-bold text-cyan-700 mb-3">{fmtCLP(fin.total)}</p>
            <Linea l="Realizado" v={fmtCLP(fin.realizado)} />
            <Linea l="Abonado" v={fmtCLP(fin.abonado)} />
            <Linea l="Saldo por abonar" v={fmtCLP(fin.saldo)} destacado={fin.saldo > 0} />
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Profesional a cargo</span>
              <select value={plan.doctorTitularId ?? ''} onChange={(e) => onProfesional(e.target.value)} className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm">
                <option value="">Sin asignar</option>
                {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
              </select>
            </label>
            <button onClick={onBloquear} className={`w-full text-xs font-semibold px-3 py-2 rounded-lg border ${plan.bloqueado ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {plan.bloqueado ? '🔒 Presupuesto bloqueado · Desbloquear' : '🔓 Bloquear presupuesto'}
            </button>
          </div>
        </div>

        {/* Panel derecho: odontograma + secciones */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <OdontogramaPlan caraMap={caraMap} piezaSel={piezaSel} carasSel={carasSel} onFace={selFace} onWhole={selWhole} />
          </div>

          {plan.bloqueado && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Plan bloqueado: no se puede editar el presupuesto (agregar/quitar acciones, precios). Las acciones igual se pueden evolucionar. Desbloquéalo para editar.
            </p>
          )}

          {todas.length > 0 && (
            <div className="flex items-center gap-3 px-4 text-[11px] uppercase tracking-wide text-slate-400">
              <span className="w-5" /><span className="flex-1">Prestación</span>
              <span className="w-12 text-center">Pieza</span><span className="w-12 text-center">Dscto</span>
              <span className="w-24 text-right">Precio</span><span className="w-10 text-center">Pago</span><span className="w-4" />
            </div>
          )}

          {plan.secciones.map((s) => (
            <SeccionBloque key={s.id} seccion={s} plan={plan} prestaciones={prestaciones} pacienteId={pacienteId} piezaSel={piezaSel} carasSel={carasSel} accion={accion} onEvolucionar={onEvolucionar} />
          ))}
          {plan.tratamientos.length > 0 && (
            <SeccionBloque seccion={{ id: '', titulo: 'Sin sección', fechaTentativa: null, diasDesdeAnterior: null, tratamientos: plan.tratamientos }} plan={plan} prestaciones={prestaciones} pacienteId={pacienteId} piezaSel={piezaSel} carasSel={carasSel} accion={accion} onEvolucionar={onEvolucionar} sinSeccion />
          )}
          {!plan.bloqueado && <AgregarSeccion planId={plan.id} accion={accion} />}
        </div>
      </div>
    </div>
  )
}

const FACE_NAME: Record<string, string> = { V: 'Vestibular', O: 'Oclusal/Incisal', L: 'Lingual/Palatino', M: 'Mesial', D: 'Distal' }
const EMPTY_FACES = new Set<string>()

function Leyenda({ color, l }: { color: string; l: string }) {
  return <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-slate-300" style={{ background: color }} /> {l}</span>
}

// Diagrama de una pieza con sus 5 caras seleccionables (V arriba, L abajo,
// M/D a los lados, O al centro). Clic en una cara la marca; clic en el número
// selecciona la pieza completa (implante / diente entero).
function ToothFaces({ n, sel, carasSel, carasConAccion, onFace, onWhole }: {
  n: number; sel: boolean; carasSel: string[]; carasConAccion: Set<string>
  onFace: (n: number, f: string) => void; onWhole: (n: number) => void
}) {
  const S = 30, a = S * 0.34
  const zonas: [string, string][] = [
    ['V', `0,0 ${S},0 ${S - a},${a} ${a},${a}`],
    ['L', `0,${S} ${S},${S} ${S - a},${S - a} ${a},${S - a}`],
    ['M', `0,0 ${a},${a} ${a},${S - a} 0,${S}`],
    ['D', `${S},0 ${S - a},${a} ${S - a},${S - a} ${S},${S}`],
    ['O', `${a},${a} ${S - a},${a} ${S - a},${S - a} ${a},${S - a}`],
  ]
  const fill = (f: string) => (sel && carasSel.includes(f) ? '#0891b2' : carasConAccion.has(f) ? '#bae6fd' : '#ffffff')
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className={`shrink-0 rounded-sm ${sel ? 'ring-2 ring-cyan-400' : ''}`}>
        {zonas.map(([f, pts]) => (
          <polygon key={f} points={pts} fill={fill(f)} stroke="#94a3b8" strokeWidth="0.75"
            className="cursor-pointer hover:opacity-70 transition-opacity" onClick={() => onFace(n, f)}>
            <title>{`Pieza ${n} · ${FACE_NAME[f]}`}</title>
          </polygon>
        ))}
      </svg>
      <button onClick={() => onWhole(n)} title={`Pieza ${n} completa`}
        className={`text-[9px] font-bold leading-none px-0.5 rounded ${sel ? 'text-cyan-700 bg-cyan-50' : 'text-slate-400 hover:text-slate-600'}`}>{n}</button>
    </div>
  )
}

function OdontogramaPlan({ caraMap, piezaSel, carasSel, onFace, onWhole }: {
  caraMap: Map<number, Set<string>>; piezaSel: number | null; carasSel: string[]
  onFace: (n: number, f: string) => void; onWhole: (n: number) => void
}) {
  const fila = (nums: number[]) => (
    <div className="flex gap-1 justify-center min-w-max">
      {nums.map((n) => <ToothFaces key={n} n={n} sel={piezaSel === n} carasSel={carasSel} carasConAccion={caraMap.get(n) ?? EMPTY_FACES} onFace={onFace} onWhole={onWhole} />)}
    </div>
  )
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <p className="text-sm font-semibold text-slate-700">Odontograma</p>
        <p className="text-xs text-slate-400">
          {piezaSel
            ? `Pieza ${piezaSel}${carasSel.length ? ` · caras ${carasSel.join(',')}` : ' · completa'} — agrégala con "+ Agregar prestación"`
            : 'Clic en las caras de una pieza (o en su número para la pieza completa)'}
        </p>
      </div>
      <div className="space-y-2 overflow-x-auto pb-1">
        {fila(SUP)}
        {fila(INF)}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
        <Leyenda color="#0891b2" l="Cara seleccionada" />
        <Leyenda color="#bae6fd" l="Con acción" />
        <span className="text-slate-400">V vestibular · O oclusal · L lingual/palatino · M mesial · D distal</span>
      </div>
    </div>
  )
}

function EvolucionModal({ accion, pacienteNombre, doctores, plan, onClose, onDone }: {
  accion: TratNode; pacienteNombre: string; doctores: DoctorDTO[]; plan: PlanDetalle
  onClose: () => void; onDone: () => void
}) {
  const [profesionalId, setProfesionalId] = useState(accion.doctor?.id ?? plan.doctorTitularId ?? doctores[0]?.id ?? '')
  const [fecha, setFecha] = useState(hoyISO())
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function evolucionar() {
    if (!texto.trim()) { setErr('Escribe la evolución'); return }
    setGuardando(true); setErr('')
    try {
      await tratamientosService.evolucionar(accion.id, { texto: texto.trim(), profesionalId: profesionalId || undefined, fecha })
      onDone()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error'); setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Nueva evolución</h3>
          <p className="text-sm text-slate-500">Paciente {pacienteNombre} · {accion.prestacion.nombre}{accion.diente ? ` · Pieza ${accion.diente}` : ''}</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Profesional</span>
              <select value={profesionalId} onChange={(e) => setProfesionalId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="">Sin asignar</option>
                {doctores.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.email}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-500">Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Evolución</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} autoFocus
              placeholder="Describe la evolución clínica. Queda registrada en la ficha del paciente y marca la acción como realizada."
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </label>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg">Cerrar</button>
          <button onClick={evolucionar} disabled={guardando || !texto.trim()} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">{guardando ? 'Guardando…' : 'Evolucionar'}</button>
        </div>
      </div>
    </div>
  )
}

function SeccionBloque({ seccion, plan, prestaciones, pacienteId, piezaSel, carasSel, accion, onEvolucionar, sinSeccion }: {
  seccion: SeccionNode; plan: PlanDetalle; prestaciones: PrestacionDTO[]; pacienteId: string; piezaSel: number | null; carasSel: string[]
  accion: (fn: () => Promise<unknown>) => Promise<void>; onEvolucionar: (t: TratNode) => void; sinSeccion?: boolean
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
        {seccion.tratamientos.map((t) => <AccionFila key={t.id} t={t} bloqueado={plan.bloqueado} accion={accion} onEvolucionar={onEvolucionar} />)}
      </div>
      {!plan.bloqueado && !sinSeccion && (
        <div className="px-4 py-2 border-t border-slate-100">
          {agregando
            ? <AgregarAccion planId={plan.id} seccionId={seccion.id} pacienteId={pacienteId} prestaciones={prestaciones} piezaSel={piezaSel} carasSel={carasSel} accion={accion} onDone={() => setAgregando(false)} />
            : <button onClick={() => setAgregando(true)} className="text-xs font-semibold text-cyan-700">+ Agregar prestación{piezaSel ? ` (pieza ${piezaSel}${carasSel.length ? ` ${carasSel.join(',')}` : ''})` : ''}</button>}
        </div>
      )}
    </div>
  )
}

function AccionFila({ t, bloqueado, accion, onEvolucionar }: {
  t: TratNode; bloqueado: boolean; accion: (fn: () => Promise<unknown>) => Promise<void>; onEvolucionar: (t: TratNode) => void
}) {
  const completado = t.estado === 'COMPLETADO'
  const pagada = pagadaTrat(t)
  const revertir = () => accion(() => tratamientosService.actualizar(t.id, { estado: 'PLANIFICADO', fechaCompletado: null }))
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <button onClick={() => (completado ? revertir() : onEvolucionar(t))}
        title={completado ? 'Realizada (clic para revertir)' : 'Evolucionar / marcar como realizada'}
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${completado ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 hover:border-cyan-400'}`}>
        {completado ? '✓' : ''}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800 truncate">{t.prestacion.nombre}</p>
        <p className="text-xs text-slate-400 truncate">
          {t.doctor?.name ? `Dr(a) ${t.doctor.name}` : 'Sin profesional'}{t.cara ? ` · caras ${t.cara.split('').join(',')}` : ''}
        </p>
      </div>
      <span className="w-12 text-center text-sm text-slate-600">{t.diente ?? '—'}</span>
      <span className="w-12 text-center text-sm text-slate-500">{t.descuento ? `${t.descuento}%` : '—'}</span>
      <span className="w-24 text-right text-sm font-mono text-slate-700">{fmtCLP(netoTrat(t))}</span>
      <span className="w-10 flex justify-center"><span className={`w-2.5 h-2.5 rounded-full ${pagada ? 'bg-emerald-500' : 'bg-rose-400'}`} title={pagada ? 'Pagada' : 'Pendiente de pago'} /></span>
      {!bloqueado
        ? <button onClick={() => accion(() => tratamientosService.eliminar(t.id))} className="w-4 text-slate-300 hover:text-rose-600 text-sm shrink-0" title="Quitar">×</button>
        : <span className="w-4" />}
    </div>
  )
}

function AgregarAccion({ planId, seccionId, pacienteId, prestaciones, piezaSel, carasSel, accion, onDone }: {
  planId: string; seccionId: string; pacienteId: string; prestaciones: PrestacionDTO[]; piezaSel: number | null; carasSel: string[]
  accion: (fn: () => Promise<unknown>) => Promise<void>; onDone: () => void
}) {
  const [prestId, setPrestId] = useState('')
  const [pieza, setPieza] = useState(piezaSel != null ? String(piezaSel) : '')
  const [caras, setCaras] = useState<string[]>(carasSel)
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

function In({ label, v, on }: { label: string; v: string; on: (x: string) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
