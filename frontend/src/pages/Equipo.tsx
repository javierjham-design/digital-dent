import { useEffect, useState } from 'react'
import type { UsuarioDTO, HorarioDTO } from '@shared/types'
import { usuariosService, horariosService } from '@/services/equipo.service'
import { contratosService } from '@/services/caja.service'
import { ApiError } from '@/services/api'

const ROLES = [
  { v: 'doctor', l: 'Doctor / Médico' },
  { v: 'staff', l: 'Recepción / Staff' },
  { v: 'admin', l: 'Administrador' },
]
const ROL_LABEL: Record<string, string> = { admin: 'Administrador', doctor: 'Doctor', medico: 'Médico', staff: 'Staff' }
const conAgenda = (role: string) => role === 'doctor' || role === 'medico'

const PERMISOS: [keyof UsuarioDTO, string][] = [
  ['puedeRecibirPagos', 'Recibir pagos (cobros)'],
  ['puedeEditarPagos', 'Editar / anular pagos'],
  ['puedeModificarPrecio', 'Modificar precios'],
  ['puedeAplicarDescuento', 'Aplicar descuentos'],
  ['puedeRevertirCompletado', 'Revertir acciones ya realizadas'],
  ['puedeGestionarLiquidaciones', 'Gestionar liquidaciones (de todo el equipo)'],
]
const DIAS: [number, string][] = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo']]
const hoyISO = () => new Date().toISOString().slice(0, 10)
const fmtCLP = (n: number) => '$' + new Intl.NumberFormat('es-CL').format(n)

interface ContratoLite {
  id: string; doctorId: string; tipo: string; porcentaje: number | null; montoFijo: number | null
  descripcion: string | null; fechaInicio: string; fechaFin: string | null; activo: boolean
}

export function Equipo() {
  const [usuarios, setUsuarios] = useState<UsuarioDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'doctor', especialidad: '', telefono: '' })
  const [guardando, setGuardando] = useState(false)
  const [formError, setFormError] = useState('')
  const [editar, setEditar] = useState<UsuarioDTO | null>(null)

  function cargar() {
    setCargando(true)
    usuariosService.listar().then(setUsuarios).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }
  useEffect(cargar, [])

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setFormError('')
    try {
      await usuariosService.crear(form)
      setForm({ name: '', username: '', password: '', role: 'doctor', especialidad: '', telefono: '' })
      setShowForm(false)
      cargar()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario')
    } finally { setGuardando(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Equipo</h1>
          <p className="text-slate-500 text-sm mt-1">{usuarios.length} usuario{usuarios.length === 1 ? '' : 's'}</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl transition-colors">
          {showForm ? 'Cerrar' : '+ Nuevo usuario'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={crear} className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 grid sm:grid-cols-2 gap-3">
          <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="Usuario (login)" value={form.username} onChange={(v) => setForm({ ...form, username: v.toLowerCase() })} required />
          <Field label="Contraseña" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required />
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Rol</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
          <Field label="Especialidad" value={form.especialidad} onChange={(v) => setForm({ ...form, especialidad: v })} />
          <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
          {formError && <p className="sm:col-span-2 text-sm text-rose-600">{formError}</p>}
          <div className="sm:col-span-2">
            <button type="submit" disabled={guardando}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">
              {guardando ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? (
          <p className="px-5 py-10 text-center text-slate-500 text-sm">Cargando…</p>
        ) : error ? (
          <p className="px-5 py-10 text-center text-rose-600 text-sm">{error}</p>
        ) : usuarios.map((u) => (
          <div key={u.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 truncate">{u.name ?? u.username}</p>
              <p className="text-xs text-slate-500">
                @{u.username} · {ROL_LABEL[u.role] ?? u.role}{u.especialidad ? ` · ${u.especialidad}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {u.activo ? 'Activo' : 'Inactivo'}
              </span>
              <button onClick={() => setEditar(u)} className="text-sm text-cyan-600 hover:text-cyan-800 font-medium">Editar</button>
            </div>
          </div>
        ))}
      </div>

      {editar && <UsuarioEditor user={editar} onClose={() => setEditar(null)} onSaved={cargar} />}
    </div>
  )
}

// ── Editor de usuario (datos, permisos, horario, contrato) ───────────────────
type TabKey = 'datos' | 'permisos' | 'horario' | 'contrato'
function UsuarioEditor({ user, onClose, onSaved }: { user: UsuarioDTO; onClose: () => void; onSaved: () => void }) {
  const tabs: TabKey[] = conAgenda(user.role) ? ['datos', 'permisos', 'horario', 'contrato'] : ['datos', 'permisos']
  const [tab, setTab] = useState<TabKey>('datos')
  const LABEL: Record<string, string> = { datos: 'Datos', permisos: 'Permisos', horario: 'Horario', contrato: 'Contrato' }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{user.name ?? user.username}</h3>
            <p className="text-xs text-slate-500">@{user.username} · {ROL_LABEL[user.role] ?? user.role}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div className="flex gap-1 border-b border-slate-100 px-3">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium ${tab === t ? 'text-cyan-700 border-b-2 border-cyan-600' : 'text-slate-500 hover:text-slate-700'}`}>{LABEL[t]}</button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'datos' && <DatosForm user={user} onSaved={onSaved} />}
          {tab === 'permisos' && <PermisosForm user={user} onSaved={onSaved} />}
          {tab === 'horario' && <HorarioForm doctorId={user.id} />}
          {tab === 'contrato' && <ContratoForm doctorId={user.id} />}
        </div>
      </div>
    </div>
  )
}

function DatosForm({ user, onSaved }: { user: UsuarioDTO; onSaved: () => void }) {
  const [f, setF] = useState({ name: user.name ?? '', role: user.role, especialidad: user.especialidad ?? '', telefono: user.telefono ?? '', rut: user.rut ?? '', activo: user.activo })
  const [pwd, setPwd] = useState('')
  const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false)
  async function guardar() {
    setSaving(true); setMsg('')
    try {
      await usuariosService.actualizar(user.id, { ...f, ...(pwd ? { password: pwd } : {}) })
      setPwd(''); setMsg('Cambios guardados'); onSaved()
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') } finally { setSaving(false) }
  }
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Nombre" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Rol</span>
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
        </label>
        <Field label="Especialidad" value={f.especialidad} onChange={(v) => setF({ ...f, especialidad: v })} />
        <Field label="Teléfono" value={f.telefono} onChange={(v) => setF({ ...f, telefono: v })} />
        <Field label="RUT" value={f.rut} onChange={(v) => setF({ ...f, rut: v })} />
        <Field label="Restablecer contraseña" type="password" value={pwd} onChange={setPwd} placeholder="(dejar vacío para no cambiar)" />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Usuario activo
      </label>
      <div className="flex items-center gap-3">
        <button onClick={guardar} disabled={saving} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{saving ? 'Guardando…' : 'Guardar'}</button>
        {msg && <span className={`text-sm ${msg === 'Cambios guardados' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
      </div>
    </div>
  )
}

function PermisosForm({ user, onSaved }: { user: UsuarioDTO; onSaved: () => void }) {
  const [p, setP] = useState<Record<string, boolean>>(() => Object.fromEntries(PERMISOS.map(([k]) => [k, Boolean(user[k])])))
  const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false)
  async function guardar() {
    setSaving(true); setMsg('')
    try { await usuariosService.actualizar(user.id, p as Partial<UsuarioDTO>); setMsg('Permisos guardados'); onSaved() }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') } finally { setSaving(false) }
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Si el usuario es administrador tiene todos los permisos por defecto. Estos permisos finos aplican al resto del equipo.</p>
      <div className="space-y-2">
        {PERMISOS.map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.checked })} /> {l}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={guardar} disabled={saving} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{saving ? 'Guardando…' : 'Guardar permisos'}</button>
        {msg && <span className={`text-sm ${msg === 'Permisos guardados' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
      </div>
    </div>
  )
}

interface DiaHorario { activo: boolean; horaInicio: string; horaFin: string; recesoActivo: boolean; recesoInicio: string; recesoFin: string }
function HorarioForm({ doctorId }: { doctorId: string }) {
  const def = (): DiaHorario => ({ activo: false, horaInicio: '09:00', horaFin: '18:00', recesoActivo: false, recesoInicio: '13:00', recesoFin: '14:00' })
  const [dias, setDias] = useState<Record<number, DiaHorario>>(() => Object.fromEntries(DIAS.map(([d]) => [d, def()])))
  const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false)
  useEffect(() => {
    horariosService.listar(doctorId).then((hs) => {
      setDias((prev) => {
        const next = { ...prev }
        for (const h of hs as (HorarioDTO & { recesoActivo?: boolean; recesoInicio?: string | null; recesoFin?: string | null })[]) {
          next[h.diaSemana] = {
            activo: h.activo, horaInicio: h.horaInicio, horaFin: h.horaFin,
            recesoActivo: Boolean(h.recesoActivo), recesoInicio: h.recesoInicio ?? '13:00', recesoFin: h.recesoFin ?? '14:00',
          }
        }
        return next
      })
    }).catch(() => {})
  }, [doctorId])
  const set = (d: number, patch: Partial<DiaHorario>) => setDias((p) => ({ ...p, [d]: { ...p[d], ...patch } }))
  async function guardar() {
    setSaving(true); setMsg('')
    const days = DIAS.map(([d]) => ({
      diaSemana: d, horaInicio: dias[d].horaInicio, horaFin: dias[d].horaFin, activo: dias[d].activo,
      recesoActivo: dias[d].recesoActivo,
      recesoInicio: dias[d].recesoActivo ? dias[d].recesoInicio : null,
      recesoFin: dias[d].recesoActivo ? dias[d].recesoFin : null,
    }))
    try { await horariosService.guardar(doctorId, days); setMsg('Horario guardado') }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') } finally { setSaving(false) }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 mb-1">Define los días y horas de atención (con receso opcional). Esto alimenta la agenda.</p>
      {DIAS.map(([d, l]) => {
        const dia = dias[d]
        return (
          <div key={d} className="flex items-center gap-2 flex-wrap text-sm border-b border-slate-50 py-1.5">
            <label className="flex items-center gap-2 w-28 shrink-0">
              <input type="checkbox" checked={dia.activo} onChange={(e) => set(d, { activo: e.target.checked })} />
              <span className={dia.activo ? 'text-slate-800 font-medium' : 'text-slate-400'}>{l}</span>
            </label>
            {dia.activo ? (
              <div className="flex items-center gap-2 flex-wrap text-slate-600">
                <input type="time" value={dia.horaInicio} onChange={(e) => set(d, { horaInicio: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg" />
                <span>a</span>
                <input type="time" value={dia.horaFin} onChange={(e) => set(d, { horaFin: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg" />
                <label className="flex items-center gap-1 ml-2 text-xs text-slate-500">
                  <input type="checkbox" checked={dia.recesoActivo} onChange={(e) => set(d, { recesoActivo: e.target.checked })} /> Receso
                </label>
                {dia.recesoActivo && (
                  <>
                    <input type="time" value={dia.recesoInicio} onChange={(e) => set(d, { recesoInicio: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                    <span className="text-xs">a</span>
                    <input type="time" value={dia.recesoFin} onChange={(e) => set(d, { recesoFin: e.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs" />
                  </>
                )}
              </div>
            ) : <span className="text-xs text-slate-400">No atiende</span>}
          </div>
        )
      })}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={guardar} disabled={saving} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{saving ? 'Guardando…' : 'Guardar horario'}</button>
        {msg && <span className={`text-sm ${msg === 'Horario guardado' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
      </div>
    </div>
  )
}

function ContratoForm({ doctorId }: { doctorId: string }) {
  const [contrato, setContrato] = useState<ContratoLite | null>(null)
  const [f, setF] = useState({ tipo: 'PORCENTAJE', porcentaje: '50', montoFijo: '', descripcion: '', fechaInicio: hoyISO(), fechaFin: '' })
  const [msg, setMsg] = useState(''); const [saving, setSaving] = useState(false)
  function cargar() {
    contratosService.listar().then((cs) => {
      const mio = (cs as ContratoLite[]).find((c) => c.doctorId === doctorId && c.activo) ?? null
      setContrato(mio)
      if (mio) setF({
        tipo: mio.tipo, porcentaje: String(mio.porcentaje ?? ''), montoFijo: String(mio.montoFijo ?? ''),
        descripcion: mio.descripcion ?? '', fechaInicio: mio.fechaInicio.slice(0, 10), fechaFin: mio.fechaFin?.slice(0, 10) ?? '',
      })
    }).catch(() => {})
  }
  useEffect(cargar, [doctorId])
  async function guardar() {
    setSaving(true); setMsg('')
    const body = {
      doctorId, tipo: f.tipo,
      porcentaje: f.tipo === 'PORCENTAJE' ? Number(f.porcentaje) : null,
      montoFijo: f.tipo === 'MONTO_FIJO' ? Number(f.montoFijo) : null,
      descripcion: f.descripcion || null,
      fechaInicio: f.fechaInicio || undefined, fechaFin: f.fechaFin || null,
    }
    try {
      if (contrato) await contratosService.actualizar(contrato.id, body)
      else await contratosService.crear(body)
      setMsg('Contrato guardado'); cargar()
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') } finally { setSaving(false) }
  }
  async function eliminar() {
    if (!contrato || !window.confirm('¿Desactivar el contrato actual del profesional?')) return
    try { await contratosService.eliminar(contrato.id) } catch { /* noop */ }
    setF({ tipo: 'PORCENTAJE', porcentaje: '50', montoFijo: '', descripcion: '', fechaInicio: hoyISO(), fechaFin: '' })
    cargar()
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Contrato vigente del profesional para el cálculo de liquidaciones. Crear uno nuevo desactiva el anterior.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Tipo</span>
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm">
            <option value="PORCENTAJE">Porcentaje de lo realizado</option>
            <option value="MONTO_FIJO">Monto fijo por acción</option>
          </select>
        </label>
        {f.tipo === 'PORCENTAJE' ? (
          <Field label="Porcentaje (%)" value={f.porcentaje} onChange={(v) => setF({ ...f, porcentaje: v })} />
        ) : (
          <Field label="Monto fijo (CLP)" value={f.montoFijo} onChange={(v) => setF({ ...f, montoFijo: v })} />
        )}
        <Field label="Vigente desde" type="date" value={f.fechaInicio} onChange={(v) => setF({ ...f, fechaInicio: v })} />
        <Field label="Vigente hasta (opcional)" type="date" value={f.fechaFin} onChange={(v) => setF({ ...f, fechaFin: v })} />
        <div className="sm:col-span-2">
          <Field label="Descripción (opcional)" value={f.descripcion} onChange={(v) => setF({ ...f, descripcion: v })} />
        </div>
      </div>
      {contrato && (
        <p className="text-xs text-slate-500">
          Actual: {contrato.tipo === 'PORCENTAJE' ? `${contrato.porcentaje}%` : fmtCLP(contrato.montoFijo ?? 0)} · desde {new Date(contrato.fechaInicio).toLocaleDateString('es-CL')}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button onClick={guardar} disabled={saving} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{saving ? 'Guardando…' : contrato ? 'Actualizar contrato' : 'Crear contrato'}</button>
        {contrato && <button onClick={eliminar} className="px-3 py-2 border border-slate-200 text-slate-600 hover:text-rose-600 text-sm rounded-xl">Desactivar</button>}
        {msg && <span className={`text-sm ${msg === 'Contrato guardado' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
