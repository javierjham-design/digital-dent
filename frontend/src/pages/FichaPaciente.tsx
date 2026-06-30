import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { CitaDTO, DoctorDTO, PacienteDTO, PrestacionDTO } from '@shared/types'
import { CITA_ESTADOS } from '@shared/constants/cita-estados'
import { pacientesService, type FichaClinica, type ResumenPaciente, type ComentarioDTO, type MensajeDTO } from '@/services/clinica.service'
import { planesService, seccionesService, tratamientosService, evolucionesService, historialService, type HistorialEntry } from '@/services/clinico.service'
import { prestacionesService, mediosPagoService, type MedioPagoDTO } from '@/services/catalogo.service'
import { cobrosService, cajasService } from '@/services/caja.service'
import { usuariosService } from '@/services/equipo.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import { RutField } from '@/components/RutField'
import { validarRut } from '@shared/utils/rut'

const TABS = ['Datos', 'Citas', 'Planes de Tratamiento', 'Recaudación', 'Evoluciones', 'Historial', 'Comentarios', 'Mensajes'] as const
type Tab = typeof TABS[number]

// Numeración FDI. Permanente: cuadrantes 1/2 (superior) y 4/3 (inferior).
// Temporal (pediátrica): cuadrantes 5/6 (superior) y 8/7 (inferior).
const SUP_PERM = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const INF_PERM = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const SUP_TEMP = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const INF_TEMP = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]
// Zonas (selección independiente, sin marcar dientes): para acciones asociadas
// a una arcada o sextante completo (p.ej. pacientes desdentados). [display, valor].
const SEXTANTES: [string, string][] = [
  ['Sext. 1', 'Sextante 1'], ['Sext. 2', 'Sextante 2'], ['Sext. 3', 'Sextante 3'],
  ['Sext. 4', 'Sextante 4'], ['Sext. 5', 'Sextante 5'], ['Sext. 6', 'Sextante 6'],
]
const fmtCLP = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(n)
const hoyISO = () => new Date().toISOString().slice(0, 10)
const edad = (iso: string | null) => { if (!iso) return null; const d = new Date(iso); return Math.floor((Date.now() - d.getTime()) / (365.25 * 864e5)) }

export function FichaPaciente() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  // Permite entrar directo a una pestaña vía ?tab= (p.ej. desde la agenda → planes).
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'planes' ? 'Planes de Tratamiento' : 'Datos')
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
      {tab === 'Recaudación' && <RecaudacionTab pacienteId={id} />}
      {tab === 'Evoluciones' && <EvolucionesTab pacienteId={id} isAdmin={isAdmin} />}
      {tab === 'Historial' && <HistorialTab pacienteId={id} />}
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
  const [form, setForm] = useState({
    nombre: paciente.nombre, apellido: paciente.apellido, nombreSocial: paciente.nombreSocial ?? '',
    rut: paciente.rut ?? '', otroDoc: paciente.otroDocId ?? '',
    fechaNacimiento: paciente.fechaNacimiento ? paciente.fechaNacimiento.slice(0, 10) : '',
    sexo: paciente.sexo ?? '', actividad: paciente.actividad ?? '',
    telefono: paciente.telefono ?? '', email: paciente.email ?? '',
    prevision: paciente.prevision ?? '', direccion: paciente.direccion ?? '',
    apoderado: paciente.apoderado ?? '', rutApoderado: paciente.rutApoderado ?? '',
    contactoEmergencia: paciente.contactoEmergencia ?? '', telefonoEmergencia: paciente.telefonoEmergencia ?? '',
    observaciones: paciente.observaciones ?? '',
  })
  const rutInvalido = Boolean(form.rut) && !validarRut(form.rut)
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
    if (rutInvalido) { setMsg('Corrige el RUT (dígito verificador) o marca «Otro documento» antes de guardar.'); return }
    setSaving(true); setMsg('')
    try {
      const { otroDoc, ...rest } = form
      const p = await pacientesService.actualizar(paciente.id, { ...rest, otroDocId: otroDoc })
      await pacientesService.guardarFicha(paciente.id, flags)
      onSaved(p)
      setMsg('Cambios guardados')
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error al guardar') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">N° ficha clínica</span>
          <input value={paciente.numero ?? '—'} readOnly disabled
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-500 font-mono" />
        </label>
        <div className="hidden sm:block" />
        <In label="Nombres" v={form.nombre} on={(x) => setForm({ ...form, nombre: x })} />
        <In label="Apellidos" v={form.apellido} on={(x) => setForm({ ...form, apellido: x })} />
        <In label="Nombre social" v={form.nombreSocial} on={(x) => setForm({ ...form, nombreSocial: x })} />
        <RutField rut={form.rut} otroDoc={form.otroDoc} onChange={(v) => setForm({ ...form, ...v })} />
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Fecha de nacimiento</span>
          <input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Sexo</span>
          <select value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">Sin especificar</option>
            <option value="Masculino">Masculino</option>
            <option value="Femenino">Femenino</option>
            <option value="Otro">Otro</option>
          </select>
        </label>
        <In label="Ocupación" v={form.actividad} on={(x) => setForm({ ...form, actividad: x })} />
        <In label="Teléfono" v={form.telefono} on={(x) => setForm({ ...form, telefono: x })} />
        <In label="Email" v={form.email} on={(x) => setForm({ ...form, email: x })} />
        <In label="Previsión" v={form.prevision} on={(x) => setForm({ ...form, prevision: x })} />
        <In label="Dirección" v={form.direccion} on={(x) => setForm({ ...form, direccion: x })} />
        <div className="sm:col-span-2 border-t border-slate-100 pt-3 mt-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Representante legal / Apoderado y contacto de emergencia</p>
        </div>
        <In label="Representante legal o Apoderado" v={form.apoderado} on={(x) => setForm({ ...form, apoderado: x })} />
        <In label="RUT del apoderado / representante" v={form.rutApoderado} on={(x) => setForm({ ...form, rutApoderado: x })} />
        <In label="Contacto de emergencia (nombre)" v={form.contactoEmergencia} on={(x) => setForm({ ...form, contactoEmergencia: x })} />
        <In label="Teléfono de emergencia" v={form.telefonoEmergencia} on={(x) => setForm({ ...form, telefonoEmergencia: x })} />
        <label className="block sm:col-span-2">
          <span className="block text-sm font-medium text-slate-700 mb-1">Observaciones</span>
          <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
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
        <button onClick={guardar} disabled={saving || rutInvalido} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{saving ? 'Guardando…' : 'Guardar'}</button>
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
  id: string; estado: string; precio: number; descuento: number; diente: number | null; cara: string | null; notas: string | null
  prestacion: { nombre: string; categoria: string | null }; cobroItems: CobroItemLite[]
  doctor: { id: string; name: string | null } | null
}
interface TratLite { estado: string; precio: number; descuento: number; cobroItems: CobroItemLite[] }
interface SeccionNode { id: string; titulo: string; orden: number; fechaTentativa: string | null; diasDesdeAnterior: number | null; tratamientos: TratNode[] }
interface DoctorRef { id: string; name: string | null; email?: string | null }
interface PlanCard {
  id: string; nombre: string; estado: string; bloqueado?: boolean
  doctorTitular: DoctorRef | null; createdAt: string; updatedAt: string; fechaInicio: string | null
  _count?: { tratamientos: number; secciones: number }; tratamientos: TratLite[]; abonoLibre?: number
}
interface PlanDetalle {
  id: string; nombre: string; estado: string; bloqueado: boolean
  doctorTitularId: string | null; doctorTitular: DoctorRef | null
  secciones: SeccionNode[]; tratamientos: TratNode[]; abonoLibre?: number
}

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

// Estado financiero del plan, comparando lo REALIZADO (acciones evolucionadas)
// con lo ABONADO (pagos de acciones + abono libre):
//  · Sin comenzar  → nada realizado y nada abonado.
//  · Hay saldo     → abonado > realizado (dinero a favor, sin acciones realizadas o de más).
//  · Al día        → todo lo realizado está pagado (sin deuda ni saldo a favor).
//  · Deuda         → hay acciones realizadas sin pagar (realizado > abonado).
function estadoFinanciero(realizado: number, abonado: number): { label: string; cls: string; icon: string } {
  const r = Math.round(realizado)
  const a = Math.round(abonado)
  if (r > a) return { label: 'Deuda', cls: 'text-rose-600', icon: '●' }
  if (a > r) return { label: 'Hay saldo', cls: 'text-cyan-600', icon: '●' }
  if (r > 0) return { label: 'Al día', cls: 'text-emerald-600', icon: '✓' }
  return { label: 'Sin comenzar', cls: 'text-slate-400', icon: '○' }
}

function PlanesTab({ pacienteId, pacienteNombre }: { pacienteId: string; pacienteNombre: string }) {
  const [planes, setPlanes] = useState<PlanCard[]>([])
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [prestaciones, setPrestaciones] = useState<PrestacionDTO[]>([])
  const [doctores, setDoctores] = useState<DoctorDTO[]>([])
  const [selPiezas, setSelPiezas] = useState<number[]>([])
  const [selCaras, setSelCaras] = useState<Record<number, string[]>>({})
  const [selZona, setSelZona] = useState<string | null>(null)
  const [denticion, setDenticion] = useState<'PERM' | 'TEMP'>('PERM')
  const [evoAccion, setEvoAccion] = useState<TratNode | null>(null)
  const [error, setError] = useState('')

  const cargarPlanes = () => planesService.listar(pacienteId).then((p) => setPlanes(p as PlanCard[])).catch(() => {})
  useEffect(() => {
    cargarPlanes()
    prestacionesService.listar().then((ps) => setPrestaciones(ps.filter((p) => p.activo))).catch(() => {})
    usuariosService.doctores().then(setDoctores).catch(() => {})
  }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = async (planId: string) => { try { clearSel(); setDetalle(await planesService.obtener(planId) as PlanDetalle) } catch (e) { setError((e as Error).message) } }
  const recargar = () => { if (detalle) abrir(detalle.id) }
  // Selección múltiple en el odontograma: se pueden marcar varias piezas y, en
  // cada una, sus caras. Clic en una cara agrega esa pieza+cara; clic en la
  // silueta/número selecciona/deselecciona la pieza completa (implante).
  const clearSel = () => { setSelPiezas([]); setSelCaras({}); setSelZona(null) }
  const toggleFace = (n: number, f: string) => {
    setSelZona(null)
    setSelPiezas((ps) => (ps.includes(n) ? ps : [...ps, n]))
    setSelCaras((cs) => {
      const cur = cs[n] ?? []
      return { ...cs, [n]: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] }
    })
  }
  const toggleWhole = (n: number) => {
    setSelZona(null)
    setSelPiezas((ps) => (ps.includes(n) ? ps.filter((x) => x !== n) : [...ps, n]))
    setSelCaras((cs) => { const { [n]: _omit, ...rest } = cs; return rest })
  }
  // Zona = selección independiente (no marca dientes). Excluye la selección de piezas.
  const toggleZona = (label: string) => { setSelPiezas([]); setSelCaras({}); setSelZona((z) => (z === label ? null : label)) }
  const cambiarDenticion = (d: 'PERM' | 'TEMP') => { setDenticion(d); clearSel() }
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
          selPiezas={selPiezas} selCaras={selCaras} selZona={selZona} denticion={denticion}
          toggleFace={toggleFace} toggleWhole={toggleWhole} toggleZona={toggleZona} clearSel={clearSel} cambiarDenticion={cambiarDenticion}
          accion={accion}
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
  const ef = estadoFinanciero(fin.realizado, fin.abonado + (p.abonoLibre ?? 0))
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
          <p className={`text-sm font-semibold ${ef.cls}`}>{ef.icon} {ef.label}</p>
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

function PlanDetalleView({ plan, prestaciones, doctores, pacienteId, selPiezas, selCaras, selZona, denticion, toggleFace, toggleWhole, toggleZona, clearSel, cambiarDenticion, accion, onCerrar, onEvolucionar, onRenombrar, onBloquear, onProfesional }: {
  plan: PlanDetalle; prestaciones: PrestacionDTO[]; doctores: DoctorDTO[]; pacienteId: string
  selPiezas: number[]; selCaras: Record<number, string[]>; selZona: string | null; denticion: 'PERM' | 'TEMP'
  toggleFace: (n: number, f: string) => void; toggleWhole: (n: number) => void; toggleZona: (label: string) => void
  clearSel: () => void; cambiarDenticion: (d: 'PERM' | 'TEMP') => void
  accion: (fn: () => Promise<unknown>) => Promise<void>
  onCerrar: () => void; onEvolucionar: (t: TratNode) => void; onRenombrar: () => void
  onBloquear: () => void; onProfesional: (id: string) => void
}) {
  const [agregando, setAgregando] = useState(false)
  const todas = [...plan.secciones.flatMap((s) => s.tratamientos), ...plan.tratamientos]
  const fin = planFinanzas(todas)
  const abonado = fin.abonado + (plan.abonoLibre ?? 0)
  const saldo = Math.max(0, fin.total - abonado)
  // Caras que ya tienen una acción, por pieza (para resaltarlas en el odontograma).
  const caraMap = new Map<number, Set<string>>()
  for (const t of todas) {
    if (t.diente == null) continue
    const set = caraMap.get(t.diente) ?? new Set<string>()
    for (const f of (t.cara ?? '').split('')) if (f.trim()) set.add(f)
    caraMap.set(t.diente, set)
  }
  // Reordenar secciones: reasigna `orden` = posición tras el intercambio.
  async function moverSeccion(idx: number, dir: -1 | 1) {
    const arr = [...plan.secciones]
    const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    await accion(() => Promise.all(arr.map((s, i) => seccionesService.actualizar(s.id, { orden: i }))))
  }
  // Mover una acción (arrastrar) a otra sección. seccionId '' = sin sección.
  const moverAccion = (tratId: string, seccionId: string) => accion(() => tratamientosService.actualizar(tratId, { seccionId: seccionId || null }))
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
            <Linea l="Abonado" v={fmtCLP(abonado)} />
            <Linea l="Saldo por abonar" v={fmtCLP(saldo)} destacado={saldo > 0} />
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
            <button onClick={() => window.open(`/print/plan/${plan.id}`, '_blank')}
              className="w-full text-xs font-semibold px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
              🖨 Imprimir presupuesto (PDF)
            </button>
          </div>
        </div>

        {/* Panel derecho: odontograma + secciones */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <OdontogramaPlan caraMap={caraMap} selPiezas={selPiezas} selCaras={selCaras} selZona={selZona} denticion={denticion}
              onFace={toggleFace} onWhole={toggleWhole} onZona={toggleZona} onClear={clearSel} onDenticion={cambiarDenticion} />
          </div>

          {plan.bloqueado ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Plan bloqueado: no se puede editar el presupuesto (agregar/quitar acciones, precios). Las acciones igual se pueden evolucionar. Desbloquéalo para editar.
            </p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setAgregando((v) => !v)}
                  className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${agregando ? 'bg-cyan-100 text-cyan-700' : 'bg-cyan-600 hover:bg-cyan-700 text-white'}`}>
                  + Agregar prestación
                </button>
                <AgregarSeccion planId={plan.id} accion={accion} sinSeccionIds={plan.tratamientos.map((t) => t.id)} />
                {!agregando && <span className="text-xs text-slate-400">Selecciona piezas o una zona arriba.</span>}
              </div>
              {agregando && <AgregarAccion planId={plan.id} seccionId="" pacienteId={pacienteId} prestaciones={prestaciones} selPiezas={selPiezas} selCaras={selCaras} selZona={selZona} clearSel={clearSel} accion={accion} onDone={() => setAgregando(false)} />}
            </div>
          )}

          {todas.length > 0 && (
            <div className="flex items-center gap-3 px-4 text-[11px] uppercase tracking-wide text-slate-400">
              <span className="w-5" /><span className="flex-1">Prestación</span>
              <span className="w-28">Pieza / zona</span><span className="w-12 text-center">Dscto</span>
              <span className="w-24 text-right">Precio</span><span className="w-10 text-center">Pago</span><span className="w-4" />
            </div>
          )}

          {plan.secciones.map((s, i) => (
            <SeccionBloque key={s.id} seccion={s} plan={plan} prestaciones={prestaciones} pacienteId={pacienteId} selPiezas={selPiezas} selCaras={selCaras} selZona={selZona} clearSel={clearSel} accion={accion} onEvolucionar={onEvolucionar} onMoverAccion={moverAccion} idx={i} total={plan.secciones.length} onMover={moverSeccion} />
          ))}
          {plan.tratamientos.length > 0 && (
            <SeccionBloque seccion={{ id: '', titulo: 'Sin sección', orden: 0, fechaTentativa: null, diasDesdeAnterior: null, tratamientos: plan.tratamientos }} plan={plan} prestaciones={prestaciones} pacienteId={pacienteId} selPiezas={selPiezas} selCaras={selCaras} selZona={selZona} clearSel={clearSel} accion={accion} onEvolucionar={onEvolucionar} onMoverAccion={moverAccion} sinSeccion />
          )}
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

function toothType(n: number): 'incisor' | 'canine' | 'premolar' | 'molar' {
  const d = n % 10
  if (d === 1 || d === 2) return 'incisor'
  if (d === 3) return 'canine'
  if (d === 4 || d === 5) return 'premolar'
  return 'molar'
}

// Silueta estilizada del diente (corona + raíces), alineada al ancho del círculo
// (30px). Raíz arriba en la arcada superior, abajo en la inferior. Clic = pieza.
function Crown({ n, upper, sel, conAccion, onClick }: { n: number; upper: boolean; sel: boolean; conAccion: boolean; onClick: () => void }) {
  const tipo = toothType(n)
  const W = 30, H = 24, crownH = 12
  const wide = tipo === 'molar' ? 22 : tipo === 'premolar' ? 17 : tipo === 'canine' ? 13 : 15
  const x0 = (W - wide) / 2
  const crownY = upper ? H - crownH : 0
  const baseY = upper ? crownY + 1 : crownH - 1
  const tip = upper ? 1.5 : H - 1.5
  const roots = tipo === 'molar' ? [W / 2 - 5, W / 2 + 5] : tipo === 'premolar' ? [W / 2 - 2.5, W / 2 + 2.5] : [W / 2]
  const fillCrown = sel ? '#7dd3fc' : conAccion ? '#e0f2fe' : '#f1f5f9'
  const stroke = sel ? '#0284c7' : '#cbd5e1'
  return (
    <button onClick={onClick} title={`Pieza ${n} completa`} className="block w-[30px] leading-none hover:opacity-80 transition-opacity">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="mx-auto">
        {roots.map((rx, i) => (
          <path key={i} d={`M ${rx} ${baseY} L ${rx + (roots.length > 1 ? (i === 0 ? -1.5 : 1.5) : 0)} ${tip}`}
            stroke={stroke} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        ))}
        <rect x={x0} y={crownY} width={wide} height={crownH} rx={tipo === 'incisor' ? 3 : 5} ry="5" fill={fillCrown} stroke={stroke} strokeWidth="1.3" />
      </svg>
    </button>
  )
}

// Círculo de la pieza con sus 5 caras seleccionables (V arriba, L abajo,
// M/D a los lados, O al centro). Clic en una cara la marca; clic en el número
// selecciona/deselecciona la pieza completa.
function ToothCircle({ n, sel, carasSel, carasConAccion, numAbove, onFace, onWhole }: {
  n: number; sel: boolean; carasSel: string[]; carasConAccion: Set<string>; numAbove?: boolean
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
  const fill = (f: string) => (carasSel.includes(f) ? '#0891b2' : carasConAccion.has(f) ? '#bae6fd' : '#ffffff')
  const num = (
    <button onClick={() => onWhole(n)} title={`Pieza ${n} completa`}
      className={`text-[9px] font-bold leading-none px-0.5 rounded ${sel ? 'text-cyan-700 bg-cyan-50' : 'text-slate-400 hover:text-slate-600'}`}>{n}</button>
  )
  return (
    <div className="flex flex-col items-center gap-0.5 w-[30px]">
      {numAbove && num}
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} className={`shrink-0 rounded-sm ${sel ? 'ring-2 ring-cyan-400' : ''}`}>
        {zonas.map(([f, pts]) => (
          <polygon key={f} points={pts} fill={fill(f)} stroke="#94a3b8" strokeWidth="0.75"
            className="cursor-pointer hover:opacity-70 transition-opacity" onClick={() => onFace(n, f)}>
            <title>{`Pieza ${n} · ${FACE_NAME[f]}`}</title>
          </polygon>
        ))}
      </svg>
      {!numAbove && num}
    </div>
  )
}

function GroupBtn({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${active ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      {label}
    </button>
  )
}

function OdontogramaPlan({ caraMap, selPiezas, selCaras, selZona, denticion, onFace, onWhole, onZona, onClear, onDenticion }: {
  caraMap: Map<number, Set<string>>; selPiezas: number[]; selCaras: Record<number, string[]>; selZona: string | null; denticion: 'PERM' | 'TEMP'
  onFace: (n: number, f: string) => void; onWhole: (n: number) => void; onZona: (label: string) => void
  onClear: () => void; onDenticion: (d: 'PERM' | 'TEMP') => void
}) {
  const sup = denticion === 'PERM' ? SUP_PERM : SUP_TEMP
  const inf = denticion === 'PERM' ? INF_PERM : INF_TEMP
  const isSel = (n: number) => selPiezas.includes(n)
  const conAccion = (n: number) => (caraMap.get(n)?.size ?? 0) > 0
  const filaCirc = (nums: number[], numAbove: boolean) => (
    <div className="flex gap-1 justify-center min-w-max">
      {nums.map((n) => <ToothCircle key={n} n={n} sel={isSel(n)} carasSel={selCaras[n] ?? []} carasConAccion={caraMap.get(n) ?? EMPTY_FACES} numAbove={numAbove} onFace={onFace} onWhole={onWhole} />)}
    </div>
  )
  const filaCrown = (nums: number[], upper: boolean) => (
    <div className="flex gap-1 justify-center min-w-max">
      {nums.map((n) => <Crown key={n} n={n} upper={upper} sel={isSel(n)} conAccion={conAccion(n)} onClick={() => onWhole(n)} />)}
    </div>
  )
  const permCount = [...caraMap.keys()].filter((n) => n < 50).length
  const tempCount = [...caraMap.keys()].filter((n) => n >= 50).length
  const haySel = selPiezas.length > 0 || selZona != null
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1 text-sm">
          {(['PERM', 'TEMP'] as const).map((d) => (
            <button key={d} onClick={() => onDenticion(d)}
              className={`px-3 py-1 rounded-lg font-semibold ${denticion === d ? 'bg-cyan-50 text-cyan-700' : 'text-slate-400 hover:text-slate-600'}`}>
              {d === 'PERM' ? `Permanente${permCount ? ` (${permCount})` : ''}` : `Temporal${tempCount ? ` (${tempCount})` : ''}`}
            </button>
          ))}
          <span className="text-xs text-slate-300 ml-1">FDI</span>
        </div>
        {haySel && (
          <button onClick={onClear} className="text-xs text-slate-500 hover:text-rose-600">Limpiar selección{selPiezas.length ? ` (${selPiezas.length})` : ''}</button>
        )}
      </div>

      <div className="space-y-0.5 overflow-x-auto pb-1">
        {filaCrown(sup, true)}
        {filaCirc(sup, false)}
        {filaCirc(inf, true)}
        {filaCrown(inf, false)}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100">
        <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Zona (sin dientes):</span>
        <GroupBtn label="Arcada superior" onClick={() => onZona('Arcada superior')} active={selZona === 'Arcada superior'} />
        <GroupBtn label="Arcada inferior" onClick={() => onZona('Arcada inferior')} active={selZona === 'Arcada inferior'} />
        {denticion === 'PERM' && SEXTANTES.map(([disp, val]) => (
          <GroupBtn key={val} label={disp} onClick={() => onZona(val)} active={selZona === val} />
        ))}
      </div>

      {selZona && <p className="text-xs text-cyan-700 mt-2">Zona seleccionada: <b>{selZona}</b> — la acción quedará asociada a la zona, sin marcar dientes.</p>}

      <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-slate-500">
        <Leyenda color="#0891b2" l="Cara seleccionada" />
        <Leyenda color="#bae6fd" l="Con acción" />
        <span className="text-slate-400">Clic en una cara o en el número/silueta (pieza completa). V vestibular · O oclusal · L lingual/palatino · M mesial · D distal</span>
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

function SeccionBloque({ seccion, plan, prestaciones, pacienteId, selPiezas, selCaras, selZona, clearSel, accion, onEvolucionar, onMoverAccion, sinSeccion, idx, total, onMover }: {
  seccion: SeccionNode; plan: PlanDetalle; prestaciones: PrestacionDTO[]; pacienteId: string
  selPiezas: number[]; selCaras: Record<number, string[]>; selZona: string | null; clearSel: () => void
  accion: (fn: () => Promise<unknown>) => Promise<void>; onEvolucionar: (t: TratNode) => void
  onMoverAccion?: (tratId: string, seccionId: string) => void; sinSeccion?: boolean
  idx?: number; total?: number; onMover?: (idx: number, dir: -1 | 1) => void
}) {
  const [agregando, setAgregando] = useState(false)
  const [over, setOver] = useState(false)
  const totalSec = seccion.tratamientos.reduce((s, t) => s + netoTrat(t), 0)
  const tiempo = seccion.diasDesdeAnterior != null
    ? `~${seccion.diasDesdeAnterior} días estimados`
    : (seccion.fechaTentativa ? `Tentativa: ${new Date(seccion.fechaTentativa).toLocaleDateString('es-CL')}` : null)
  const seleccion = selZona ?? (selPiezas.length ? `${selPiezas.length} pieza${selPiezas.length > 1 ? 's' : ''}` : '')

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-colors ${over ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200'}`}
      onDragOver={(e) => { if (!plan.bloqueado && onMoverAccion) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/plain'); if (id && onMoverAccion) onMoverAccion(id, seccion.id) }}>
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm truncate">{seccion.titulo}</span>
          {tiempo && <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 whitespace-nowrap">⏱ {tiempo}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-slate-600">{fmtCLP(totalSec)}</span>
          {!sinSeccion && !plan.bloqueado && onMover && idx != null && total != null && (
            <div className="flex flex-col -my-1 leading-none">
              <button disabled={idx === 0} onClick={() => onMover(idx, -1)} className="text-slate-300 hover:text-cyan-600 disabled:opacity-30 text-[10px]" title="Subir sección">▲</button>
              <button disabled={idx === total - 1} onClick={() => onMover(idx, 1)} className="text-slate-300 hover:text-cyan-600 disabled:opacity-30 text-[10px]" title="Bajar sección">▼</button>
            </div>
          )}
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
            ? <AgregarAccion planId={plan.id} seccionId={seccion.id} pacienteId={pacienteId} prestaciones={prestaciones} selPiezas={selPiezas} selCaras={selCaras} selZona={selZona} clearSel={clearSel} accion={accion} onDone={() => setAgregando(false)} />
            : <button onClick={() => setAgregando(true)} className="text-xs font-semibold text-cyan-700">+ Agregar prestación{seleccion ? ` (${seleccion})` : ''}</button>}
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
  const [edit, setEdit] = useState<null | 'precio' | 'dscto'>(null)
  const [val, setVal] = useState('')
  const revertir = () => accion(() => tratamientosService.actualizar(t.id, { estado: 'PLANIFICADO', fechaCompletado: null }))
  const piezaLabel = t.diente
    ? `${t.diente}${t.cara ? ` (${t.cara.split('').join(',')})` : ''}`
    : (t.cara ? t.cara : (t.notas ? t.notas.replace(/^Piezas:\s*/, '') : '—'))

  function abrir(campo: 'precio' | 'dscto') {
    if (bloqueado) return
    setVal(String(campo === 'precio' ? Math.round(t.precio) : (t.descuento || 0)))
    setEdit(campo)
  }
  function guardar() {
    const campo = edit
    setEdit(null)
    if (campo === 'precio') {
      const n = Math.max(0, Math.round(Number(val)))
      if (Number.isFinite(n) && n !== Math.round(t.precio)) accion(() => tratamientosService.actualizar(t.id, { precio: n }))
    } else if (campo === 'dscto') {
      const n = Math.max(0, Math.min(100, Math.round(Number(val))))
      if (Number.isFinite(n) && n !== (t.descuento || 0)) accion(() => tratamientosService.actualizar(t.id, { descuento: n }))
    }
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 ${!bloqueado && !edit ? 'cursor-move' : ''}`}
      draggable={!bloqueado && !edit}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}>
      <button onClick={() => (completado ? revertir() : onEvolucionar(t))}
        title={completado ? 'Realizada (clic para revertir)' : 'Evolucionar / marcar como realizada'}
        className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${completado ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 hover:border-cyan-400'}`}>
        {completado ? '✓' : ''}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800 truncate">{t.prestacion.nombre}</p>
      </div>
      <span className="w-28 text-sm text-slate-600 truncate" title={piezaLabel}>{piezaLabel}</span>

      {/* Descuento (editable, 0% por defecto) */}
      {edit === 'dscto' ? (
        <input autoFocus type="number" min={0} max={100} value={val} onChange={(e) => setVal(e.target.value)} onBlur={guardar} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEdit(null) }}
          className="w-12 text-center text-sm border border-cyan-400 rounded px-1 py-0.5 focus:outline-none" />
      ) : (
        <button onClick={() => abrir('dscto')} disabled={bloqueado} title={bloqueado ? '' : 'Editar descuento'}
          className="w-12 text-center text-sm text-slate-500 enabled:hover:text-cyan-600 disabled:cursor-default">{t.descuento ? `${t.descuento}%` : (bloqueado ? '—' : '0%')}</button>
      )}

      {/* Precio (editable: se edita el precio base; se muestra el neto con descuento) */}
      {edit === 'precio' ? (
        <input autoFocus type="number" min={0} value={val} onChange={(e) => setVal(e.target.value)} onBlur={guardar} onKeyDown={(e) => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') setEdit(null) }}
          className="w-24 text-right text-sm font-mono border border-cyan-400 rounded px-1 py-0.5 focus:outline-none" />
      ) : (
        <button onClick={() => abrir('precio')} disabled={bloqueado}
          title={bloqueado ? '' : (t.descuento ? `Precio base ${fmtCLP(t.precio)} · neto ${fmtCLP(netoTrat(t))}` : 'Editar precio')}
          className="w-24 text-right text-sm font-mono text-slate-700 enabled:hover:text-cyan-600 disabled:cursor-default">{fmtCLP(netoTrat(t))}</button>
      )}

      <span className="w-10 flex justify-center"><span className={`w-2.5 h-2.5 rounded-full ${pagada ? 'bg-emerald-500' : 'bg-rose-400'}`} title={pagada ? 'Pagada' : 'Pendiente de pago'} /></span>
      {!bloqueado
        ? <button onClick={() => accion(() => tratamientosService.eliminar(t.id))} className="w-4 text-slate-300 hover:text-rose-600 text-sm shrink-0" title="Quitar">×</button>
        : <span className="w-4" />}
    </div>
  )
}

// Buscador de prestaciones (hay cientos en el arancel): filtra a medida que se
// escribe en vez de una lista desplegable gigante.
function PrestacionBuscador({ prestaciones, onSelect }: { prestaciones: PrestacionDTO[]; onSelect: (p: PrestacionDTO) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const term = q.trim().toLowerCase()
  const results = (term ? prestaciones.filter((p) => p.nombre.toLowerCase().includes(term) || (p.categoria ?? '').toLowerCase().includes(term)) : prestaciones).slice(0, 40)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Buscar prestación…" autoFocus
        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-64 overflow-y-auto">
          {results.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Sin resultados</p>}
          {results.map((p) => (
            <button key={p.id} type="button" onClick={() => { onSelect(p); setQ(p.nombre); setOpen(false) }}
              className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-800">{p.nombre}</span>
              <span className="text-xs text-slate-400 ml-2 font-mono">{fmtCLP(p.precio)}</span>
              {p.categoria && <span className="block text-[11px] text-slate-400">{p.categoria}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AgregarAccion({ planId, seccionId, pacienteId, prestaciones, selPiezas, selCaras, selZona, clearSel, accion, onDone }: {
  planId: string; seccionId: string; pacienteId: string; prestaciones: PrestacionDTO[]
  selPiezas: number[]; selCaras: Record<number, string[]>; selZona: string | null; clearSel: () => void
  accion: (fn: () => Promise<unknown>) => Promise<void>; onDone: () => void
}) {
  const [prestId, setPrestId] = useState('')
  const [modo, setModo] = useState<'porPieza' | 'unaSola'>('porPieza')
  const prest = prestaciones.find((p) => p.id === prestId)
  const piezas = [...selPiezas].sort((a, b) => a - b)
  const resumen = piezas.map((n) => `${n}${selCaras[n]?.length ? `(${selCaras[n].join('')})` : ''}`).join(', ')

  async function añadir() {
    if (!prestId) return
    await accion(async () => {
      if (selZona) {
        // Acción asociada a una zona (arcada/sextante), sin dientes.
        await tratamientosService.crear({ pacienteId, prestacionId: prestId, planId, seccionId, precio: prest?.precio, zona: selZona })
      } else if (piezas.length === 0 || modo === 'unaSola') {
        await tratamientosService.crear({
          pacienteId, prestacionId: prestId, planId, seccionId, precio: prest?.precio,
          ...(piezas.length ? { notas: `Piezas: ${resumen}` } : {}),
        })
      } else {
        // Una acción por pieza, con sus propias caras.
        await Promise.all(piezas.map((n) => tratamientosService.crear({
          pacienteId, prestacionId: prestId, planId, seccionId, precio: prest?.precio,
          piezas: [n], cara: selCaras[n]?.length ? selCaras[n].join('') : undefined,
        })))
      }
    })
    clearSel()
    onDone()
  }

  return (
    <div className="space-y-2 py-1">
      <PrestacionBuscador prestaciones={prestaciones} onSelect={(p) => setPrestId(p.id)} />
      {selZona ? (
        <p className="text-xs text-cyan-700">Asociada a la zona <b>{selZona}</b> (sin dientes){prest ? ` · ${fmtCLP(prest.precio)}` : ''}.</p>
      ) : piezas.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-500">Piezas seleccionadas: <span className="font-mono text-slate-700">{resumen}</span></p>
          <div className="flex flex-col gap-1 text-xs text-slate-600">
            <label className="flex items-center gap-2"><input type="radio" checked={modo === 'porPieza'} onChange={() => setModo('porPieza')} /> Una prestación <b>por cada pieza</b> ({piezas.length} acciones{prest ? ` · ${fmtCLP(prest.precio * piezas.length)}` : ''})</label>
            <label className="flex items-center gap-2"><input type="radio" checked={modo === 'unaSola'} onChange={() => setModo('unaSola')} /> Una <b>sola prestación</b> para todas{prest ? ` · ${fmtCLP(prest.precio)}` : ''}</label>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Sin selección → se agrega como prestación general. Marca piezas o una zona en el odontograma para asociarla.</p>
      )}
      <div className="flex gap-2">
        <button onClick={añadir} disabled={!prestId} className="px-3 py-1.5 bg-cyan-600 disabled:opacity-50 text-white text-sm rounded-lg">Agregar</button>
        <button onClick={onDone} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
      </div>
    </div>
  )
}

function AgregarSeccion({ planId, accion, sinSeccionIds }: { planId: string; accion: (fn: () => Promise<unknown>) => Promise<void>; sinSeccionIds: string[] }) {
  const [abierto, setAbierto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [dias, setDias] = useState('')
  const [incorporar, setIncorporar] = useState(true)
  const haySueltas = sinSeccionIds.length > 0

  async function crear() {
    await accion(async () => {
      const sec = await planesService.crearSeccion(planId, { titulo: titulo.trim() || undefined, diasDesdeAnterior: dias ? Number(dias) : undefined }) as { id: string }
      // Mueve automáticamente todas las prestaciones "sin sección" a la nueva sección.
      if (incorporar && haySueltas && sec?.id) {
        await Promise.all(sinSeccionIds.map((tid) => tratamientosService.actualizar(tid, { seccionId: sec.id })))
      }
    })
    setAbierto(false); setTitulo(''); setDias('')
  }

  if (!abierto) return <button onClick={() => setAbierto(true)} className="text-sm font-semibold text-cyan-700">+ Sección</button>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 flex gap-2 flex-wrap items-center">
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nombre de la sección" className="flex-1 min-w-[12rem] px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      <input value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Días estimados" inputMode="numeric" className="w-32 px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      {haySueltas && (
        <label className="flex items-center gap-1.5 text-xs text-slate-600 w-full">
          <input type="checkbox" checked={incorporar} onChange={(e) => setIncorporar(e.target.checked)} />
          Incorporar las {sinSeccionIds.length} prestación{sinSeccionIds.length === 1 ? '' : 'es'} sin sección a esta sección
        </label>
      )}
      <button onClick={crear} className="px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg">Crear</button>
      <button onClick={() => setAbierto(false)} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
    </div>
  )
}

// ── Recaudación: pagar acciones pendientes o registrar un abono libre al plan ──
function RecaudacionTab({ pacienteId }: { pacienteId: string }) {
  const [planes, setPlanes] = useState<PlanCard[]>([])
  const [planId, setPlanId] = useState('')
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [cajas, setCajas] = useState<{ id: string; nombre: string }[]>([])
  const [medios, setMedios] = useState<MedioPagoDTO[]>([])
  const [cajaId, setCajaId] = useState('')
  const [medioPagoId, setMedioPagoId] = useState('')
  const [numeroReferencia, setNumeroReferencia] = useState('')
  const [numeroBoleta, setNumeroBoleta] = useState('')
  const [sel, setSel] = useState<Record<string, number>>({})
  const [abono, setAbono] = useState('')
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [derivar, setDerivar] = useState(false)

  const medioSel = medios.find((m) => m.id === medioPagoId)
  const requiereRef = Boolean(medioSel?.requiereReferencia)

  const cargarDetalle = (id: string) => { if (id) planesService.obtener(id).then((d) => setDetalle(d as PlanDetalle)).catch(() => {}) }
  useEffect(() => {
    planesService.listar(pacienteId).then((p) => { const ps = p as PlanCard[]; setPlanes(ps); setPlanId((x) => x || ps[0]?.id || '') }).catch(() => {})
    cajasService.listar().then((c) => { const cc = c as { id: string; nombre: string }[]; setCajas(cc); setCajaId((x) => x || cc[0]?.id || '') }).catch(() => {})
    mediosPagoService.listar().then((m) => setMedios(m.filter((x) => x.activo))).catch(() => {})
  }, [pacienteId])
  useEffect(() => { cargarDetalle(planId); setSel({}); setAbono('') }, [planId])

  const acciones = detalle ? [...detalle.secciones.flatMap((s) => s.tratamientos), ...detalle.tratamientos] : []
  const restante = (t: TratNode) => Math.max(0, netoTrat(t) - pagadoTrat(t))
  const pendientes = acciones.filter((t) => restante(t) > 0)
  const totalSel = Object.values(sel).reduce((s, n) => s + n, 0) + (Number(abono) || 0)

  function toggle(t: TratNode) {
    setSel((s) => { const n = { ...s }; if (n[t.id] != null) delete n[t.id]; else n[t.id] = restante(t); return n })
  }

  async function recaudar() {
    const items: Record<string, unknown>[] = []
    for (const [tid, monto] of Object.entries(sel)) if (monto > 0) {
      const t = acciones.find((a) => a.id === tid)
      items.push({ tratamientoId: tid, descripcion: t?.prestacion.nombre ?? 'Acción', monto })
    }
    if (Number(abono) > 0) items.push({ planId, descripcion: 'Abono libre al plan', monto: Number(abono) })
    if (items.length === 0) { setMsg({ t: 'Selecciona acciones o ingresa un abono.', ok: false }); return }
    if (!cajaId) { setMsg({ t: 'Selecciona una caja.', ok: false }); return }
    if (requiereRef && !numeroReferencia.trim()) { setMsg({ t: `Ingresa el N° de referencia de la operación (${medioSel?.nombre}).`, ok: false }); return }
    setSaving(true); setMsg(null)
    try {
      await cobrosService.crear({
        pacienteId, cajaId, medioPagoId: medioPagoId || undefined, items,
        numeroReferencia: numeroReferencia.trim() || undefined, numeroBoleta: numeroBoleta.trim() || undefined,
      })
      setMsg({ t: `Recaudación de ${fmtCLP(totalSel)} registrada.`, ok: true })
      setSel({}); setAbono(''); setNumeroReferencia(''); setNumeroBoleta(''); cargarDetalle(planId)
    } catch (e) { setMsg({ t: e instanceof ApiError ? e.message : 'No se pudo recaudar', ok: false }) } finally { setSaving(false) }
  }

  if (planes.length === 0) return <p className="text-sm text-slate-500">Este paciente no tiene planes de tratamiento. Crea un plan con acciones clínicas antes de recaudar.</p>

  return (
    <div className="max-w-2xl space-y-4">
      {planes.length > 1 && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Plan de tratamiento</span>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm">
            {planes.map((p) => <option key={p.id} value={p.id}>#{p.id.slice(-4)} · {p.nombre}</option>)}
          </select>
        </label>
      )}

      {(detalle?.abonoLibre ?? 0) > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-emerald-800">Abono libre en este plan: {fmtCLP(detalle?.abonoLibre ?? 0)}</p>
            <p className="text-xs text-emerald-700">Monto abonado sin asignar a una acción específica.</p>
          </div>
          {planes.length > 1 && (
            <button onClick={() => setDerivar(true)} className="shrink-0 px-3 py-2 bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-sm font-semibold rounded-xl">Derivar a otro plan</button>
          )}
        </div>
      )}

      {acciones.length === 0 ? (
        <p className="text-sm text-slate-500">El plan no tiene acciones clínicas. Agrega prestaciones antes de recaudar.</p>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-2">Pagar acciones pendientes</p>
            {pendientes.length === 0 ? <p className="text-xs text-slate-400">No hay acciones pendientes de pago.</p> : (
              <div className="space-y-1.5">
                {pendientes.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={sel[t.id] != null} onChange={() => toggle(t)} />
                    <span className="flex-1 truncate text-slate-700">{t.prestacion.nombre}{t.diente ? ` · ${t.diente}` : ''}</span>
                    <span className="text-xs text-slate-400 shrink-0">resta {fmtCLP(restante(t))}</span>
                    {sel[t.id] != null && (
                      <input type="number" value={sel[t.id]} onChange={(e) => setSel((s) => ({ ...s, [t.id]: Number(e.target.value) || 0 }))} className="w-24 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800 mb-1">Abono libre al plan</p>
            <p className="text-xs text-slate-400 mb-2">Un monto que queda abonado al plan, sin asociarlo a una acción específica.</p>
            <input type="number" value={abono} onChange={(e) => setAbono(e.target.value)} placeholder="Monto" className="w-40 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Caja</span>
                <select value={cajaId} onChange={(e) => setCajaId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  {cajas.length === 0 && <option value="">Sin cajas</option>}
                  {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Medio de pago</span>
                <select value={medioPagoId} onChange={(e) => setMedioPagoId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <option value="">Efectivo / sin comisión</option>
                  {medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.comision ? ` (${m.comision}%)` : ''}</option>)}
                </select>
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {requiereRef && (
                <label className="block">
                  <span className="text-xs font-medium text-slate-500">N° de referencia de la operación *</span>
                  <input value={numeroReferencia} onChange={(e) => setNumeroReferencia(e.target.value)} placeholder="Obligatorio para tarjeta"
                    className="mt-1 w-full px-3 py-2 border border-cyan-300 bg-cyan-50/40 rounded-lg text-sm" />
                </label>
              )}
              <label className="block">
                <span className="text-xs font-medium text-slate-500">N° de boleta (opcional)</span>
                <input value={numeroBoleta} onChange={(e) => setNumeroBoleta(e.target.value)} placeholder="N° de boleta"
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Total a recaudar</span>
              <span className="text-lg font-bold text-cyan-700">{fmtCLP(totalSel)}</span>
            </div>
            <button onClick={recaudar} disabled={saving || totalSel <= 0 || (requiereRef && !numeroReferencia.trim())} className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">{saving ? 'Registrando…' : 'Recaudar'}</button>
            {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.t}</p>}
            <p className="text-[11px] text-slate-400">La caja debe estar abierta (ábrela en Cobros si hace falta).</p>
          </div>
        </>
      )}

      {derivar && (
        <DerivarAbonoModal fromPlanId={planId} disponible={detalle?.abonoLibre ?? 0}
          planes={planes.filter((p) => p.id !== planId)}
          onClose={() => setDerivar(false)}
          onDone={(t) => { setDerivar(false); setMsg({ t, ok: true }); cargarDetalle(planId); planesService.listar(pacienteId).then((p) => setPlanes(p as PlanCard[])).catch(() => {}) }}
          onError={(t) => setMsg({ t, ok: false })} />
      )}
    </div>
  )
}

// Modal: derivar el abono libre de un plan a otro plan del mismo paciente.
function DerivarAbonoModal({ fromPlanId, disponible, planes, onClose, onDone, onError }: {
  fromPlanId: string; disponible: number; planes: PlanCard[]
  onClose: () => void; onDone: (msg: string) => void; onError: (msg: string) => void
}) {
  const [toPlanId, setToPlanId] = useState(planes[0]?.id ?? '')
  const [monto, setMonto] = useState(String(Math.round(disponible)))
  const [g, setG] = useState(false)
  async function guardar() {
    const m = Number(monto)
    if (!toPlanId) { onError('Selecciona el plan de destino.'); return }
    if (!(m > 0) || m > disponible) { onError('Monto inválido (no puede superar el abono disponible).'); return }
    setG(true)
    try {
      await cobrosService.derivarAbono({ fromPlanId, toPlanId, monto: m })
      onDone(`Se derivaron ${fmtCLP(m)} al otro plan.`)
    } catch (e) { onError(e instanceof ApiError ? e.message : 'No se pudo derivar') } finally { setG(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">Derivar abono a otro plan</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <p className="text-sm text-slate-600 mb-3">Abono disponible: <span className="font-mono font-semibold">{fmtCLP(disponible)}</span></p>
        <label className="block mb-3">
          <span className="text-xs font-medium text-slate-500">Plan de destino</span>
          <select value={toPlanId} onChange={(e) => setToPlanId(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
            {planes.length === 0 && <option value="">No hay otros planes</option>}
            {planes.map((p) => <option key={p.id} value={p.id}>#{p.id.slice(-4)} · {p.nombre}</option>)}
          </select>
        </label>
        <label className="block mb-1">
          <span className="text-xs font-medium text-slate-500">Monto a derivar</span>
          <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono" />
        </label>
        <div className="flex gap-2 pt-4">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={guardar} disabled={g || planes.length === 0} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{g ? '…' : 'Derivar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Evoluciones ──
interface Evo {
  id: string; texto: string; fecha?: string; createdAt: string
  autor?: { name: string | null; username: string | null }
  tratamiento?: { prestacion?: { nombre: string }; diente: number | null } | null
}

function EvolucionesTab({ pacienteId, isAdmin }: { pacienteId: string; isAdmin: boolean }) {
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
  async function borrar(id: string) {
    if (!window.confirm('¿Eliminar esta evolución de la ficha clínica? Queda registrada en el historial de auditoría.')) return
    try { await evolucionesService.eliminar(id) } catch (e) { alert(e instanceof ApiError ? e.message : 'Error') }
    cargar()
  }
  return (
    <div>
      <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Nueva evolución clínica…"
          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={agregar} disabled={guardando || !texto.trim()} className="mt-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">Agregar</button>
      </div>
      <div className="space-y-3">
        {evos.map((e) => <EvolucionItem key={e.id} e={e} isAdmin={isAdmin} onChanged={cargar} onBorrar={() => borrar(e.id)} />)}
        {evos.length === 0 && <p className="text-sm text-slate-500">Sin evoluciones registradas.</p>}
      </div>
    </div>
  )
}

function EvolucionItem({ e, isAdmin, onChanged, onBorrar }: { e: Evo; isAdmin: boolean; onChanged: () => void; onBorrar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(e.texto)
  const fecha = e.fecha ?? e.createdAt
  async function guardar() {
    if (!txt.trim()) return
    try { await evolucionesService.actualizar(e.id, txt.trim()) } catch (err) { alert(err instanceof ApiError ? err.message : 'Error'); return }
    setEditando(false); onChanged()
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      {editando ? (
        <div>
          <textarea value={txt} onChange={(ev) => setTxt(ev.target.value)} rows={4} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <div className="flex gap-2 mt-2">
            <button onClick={guardar} className="px-3 py-1.5 bg-cyan-600 text-white text-sm rounded-lg">Guardar</button>
            <button onClick={() => { setEditando(false); setTxt(e.texto) }} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm rounded-lg">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{e.texto}</p>
          {e.tratamiento?.prestacion?.nombre && (
            <p className="text-xs text-cyan-700 mt-1">{e.tratamiento.prestacion.nombre}{e.tratamiento.diente ? ` · pieza ${e.tratamiento.diente}` : ''}</p>
          )}
          <div className="flex items-center justify-between mt-2 gap-2">
            <p className="text-xs text-slate-400">{e.autor?.name ?? e.autor?.username ?? 'Sistema'} · {new Date(fecha).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            {isAdmin && (
              <div className="flex gap-3 shrink-0">
                <button onClick={() => setEditando(true)} className="text-xs text-slate-400 hover:text-cyan-600">Editar</button>
                <button onClick={onBorrar} className="text-xs text-slate-400 hover:text-rose-600">Eliminar</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Historial / trazabilidad de la ficha clínica ──
interface PagoPaciente {
  id: string; numero: number; monto: number; estado: string; anulado: boolean
  fechaPago: string | null; concepto: string
  numeroReferencia?: string | null; numeroBoleta?: string | null
  medioPago?: { nombre: string } | null
  reciboUsuario?: { name: string | null } | null
}

function HistorialTab({ pacienteId }: { pacienteId: string }) {
  const [items, setItems] = useState<HistorialEntry[]>([])
  const [pagos, setPagos] = useState<PagoPaciente[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => {
    Promise.all([
      historialService.listar(pacienteId).then(setItems).catch(() => {}),
      cobrosService.porPaciente(pacienteId).then((c) => setPagos(c as PagoPaciente[])).catch(() => {}),
    ]).finally(() => setCargando(false))
  }, [pacienteId])
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  const ACC: Record<string, { l: string; c: string }> = {
    CREAR: { l: 'Creó', c: 'bg-emerald-50 text-emerald-700' },
    EDITAR: { l: 'Editó', c: 'bg-amber-50 text-amber-700' },
    EVOLUCIONAR: { l: 'Evolucionó', c: 'bg-cyan-50 text-cyan-700' },
    ELIMINAR: { l: 'Eliminó', c: 'bg-rose-50 text-rose-700' },
    ACCESO: { l: 'Accedió', c: 'bg-slate-100 text-slate-600' },
  }
  return (
    <div className="space-y-6">
      {/* Pagos recibidos */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Pagos recibidos</h3>
        {pagos.length === 0 ? <p className="text-sm text-slate-500">Sin pagos registrados.</p> : (
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {pagos.map((p) => (
              <div key={p.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${p.anulado ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-medium text-slate-800 truncate ${p.anulado ? 'line-through' : ''}`}>
                    #{p.numero} · {fmtCLP(p.monto)}
                    <span className="ml-2 text-xs font-normal text-slate-500">{p.medioPago?.nombre ?? 'Efectivo'}</span>
                    {p.anulado && <span className="ml-2 text-[11px] font-semibold text-rose-600">ANULADO</span>}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{p.concepto}</p>
                  {(p.numeroReferencia || p.numeroBoleta) && (
                    <p className="text-xs text-slate-500">
                      {p.numeroReferencia ? `Ref: ${p.numeroReferencia}` : ''}{p.numeroReferencia && p.numeroBoleta ? ' · ' : ''}{p.numeroBoleta ? `Boleta: ${p.numeroBoleta}` : ''}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">
                    {p.fechaPago ? new Date(p.fechaPago).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    {p.reciboUsuario?.name ? ` · recibió ${p.reciboUsuario.name}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
      <p className="text-xs text-slate-500 mb-3">Trazabilidad de la ficha clínica: quién hizo qué y cuándo. Registro inmutable, conforme a la normativa de fichas clínicas (Ley 20.584 / Ley 21.719).</p>
      {items.length === 0 ? <p className="text-sm text-slate-500">Sin movimientos registrados aún.</p> : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {items.map((h) => {
            const a = ACC[h.accion] ?? { l: h.accion, c: 'bg-slate-100 text-slate-600' }
            return (
              <div key={h.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${a.c}`}>{a.l}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700">{h.resumen}</p>
                  <p className="text-xs text-slate-400">{h.userNombre ?? 'Sistema'} · {new Date(h.fecha).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
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
