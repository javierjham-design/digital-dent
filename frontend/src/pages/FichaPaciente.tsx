import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { CitaDTO, PacienteDTO, PrestacionDTO } from '@shared/types'
import { CITA_ESTADOS } from '@shared/constants/cita-estados'
import { pacientesService, type FichaClinica } from '@/services/clinica.service'
import { planesService, tratamientosService, evolucionesService, odontogramaService } from '@/services/clinico.service'
import { prestacionesService } from '@/services/catalogo.service'

const TABS = ['Datos', 'Citas', 'Planes', 'Evoluciones', 'Odontograma'] as const
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
  const [error, setError] = useState('')

  useEffect(() => { pacientesService.obtener(id).then(setPaciente).catch((e) => setError(e.message)) }, [id])

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

// ── Planes de tratamiento ──
interface TratNode { id: string; estado: string; precio: number; diente: number | null; cara: string | null; prestacion: { nombre: string } }
interface PlanLite { id: string; nombre: string; estado: string; _count?: { tratamientos: number } }
interface PlanDetalle { id: string; nombre: string; estado: string; secciones: { id: string; titulo: string; tratamientos: TratNode[] }[]; tratamientos: TratNode[] }

function PlanesTab({ pacienteId }: { pacienteId: string }) {
  const [planes, setPlanes] = useState<PlanLite[]>([])
  const [detalle, setDetalle] = useState<PlanDetalle | null>(null)
  const [prestaciones, setPrestaciones] = useState<PrestacionDTO[]>([])
  const [agregando, setAgregando] = useState(false)
  const [nuevoPrest, setNuevoPrest] = useState('')
  const [pieza, setPieza] = useState('')

  const cargarPlanes = () => planesService.listar(pacienteId).then((p) => setPlanes(p as PlanLite[]))
  useEffect(() => { cargarPlanes(); prestacionesService.listar().then(setPrestaciones) }, [pacienteId])

  async function crearPlan() {
    await planesService.crear({ pacienteId })
    cargarPlanes()
  }
  async function abrir(planId: string) {
    setDetalle(await planesService.obtener(planId) as PlanDetalle)
  }
  async function agregarTrat() {
    if (!detalle || !nuevoPrest) return
    const prest = prestaciones.find((p) => p.id === nuevoPrest)
    await tratamientosService.crear({ pacienteId, prestacionId: nuevoPrest, planId: detalle.id, precio: prest?.precio, piezas: pieza ? [Number(pieza)] : undefined })
    setNuevoPrest(''); setPieza(''); setAgregando(false)
    abrir(detalle.id)
  }
  async function cambiarEstadoTrat(tId: string, estado: string) {
    await tratamientosService.actualizar(tId, { estado, ...(estado === 'COMPLETADO' ? { fechaCompletado: new Date().toISOString() } : {}) })
    if (detalle) abrir(detalle.id)
  }

  const trats = detalle ? [...detalle.secciones.flatMap((s) => s.tratamientos), ...detalle.tratamientos] : []

  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-4">
      <div>
        <button onClick={crearPlan} className="w-full mb-3 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Nuevo plan</button>
        <div className="space-y-2">
          {planes.map((p) => (
            <button key={p.id} onClick={() => abrir(p.id)}
              className={`w-full text-left p-3 rounded-xl border ${detalle?.id === p.id ? 'border-cyan-400 bg-cyan-50' : 'border-slate-200 bg-white hover:border-cyan-300'}`}>
              <p className="text-sm font-semibold text-slate-800">{p.nombre}</p>
              <p className="text-xs text-slate-500">{p.estado}{p._count ? ` · ${p._count.tratamientos} acciones` : ''}</p>
            </button>
          ))}
          {planes.length === 0 && <p className="text-sm text-slate-500">Sin planes.</p>}
        </div>
      </div>
      <div>
        {!detalle ? (
          <p className="text-sm text-slate-500">Selecciona o crea un plan.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">{detalle.nombre}</h3>
              <button onClick={() => setAgregando((v) => !v)} className="text-xs font-semibold text-cyan-700">{agregando ? 'Cancelar' : '+ Acción'}</button>
            </div>
            {agregando && (
              <div className="flex gap-2 mb-4">
                <select value={nuevoPrest} onChange={(e) => setNuevoPrest(e.target.value)} className="flex-1 px-2 py-2 border border-slate-200 rounded-lg text-sm">
                  <option value="">Prestación…</option>
                  {prestaciones.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {fmtCLP(p.precio)}</option>)}
                </select>
                <input value={pieza} onChange={(e) => setPieza(e.target.value)} placeholder="Pieza" className="w-20 px-2 py-2 border border-slate-200 rounded-lg text-sm" />
                <button onClick={agregarTrat} disabled={!nuevoPrest} className="px-3 py-2 bg-cyan-600 disabled:opacity-50 text-white text-sm rounded-lg">Añadir</button>
              </div>
            )}
            <div className="divide-y divide-slate-100">
              {trats.length === 0 ? <p className="text-sm text-slate-500 py-3">Sin acciones en este plan.</p> : trats.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.prestacion.nombre}{t.diente ? ` · pieza ${t.diente}` : ''}</p>
                    <p className="text-xs text-slate-500 font-mono">{fmtCLP(t.precio)}</p>
                  </div>
                  <select value={t.estado} onChange={(e) => cambiarEstadoTrat(t.id, e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1">
                    {['PLANIFICADO', 'EN_PROGRESO', 'COMPLETADO'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
