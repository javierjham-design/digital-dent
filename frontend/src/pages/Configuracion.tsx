import { useEffect, useState } from 'react'
import type { ClinicaConfigDTO, UsuarioDTO } from '@shared/types'
import { clinicaService, mediosPagoService, type MedioPagoDTO } from '@/services/catalogo.service'
import { usuariosService } from '@/services/equipo.service'
import { googleService, type GoogleCalendar } from '@/services/google.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

export function Configuracion() {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const [data, setData] = useState<ClinicaConfigDTO | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    clinicaService.obtener().then(setData).catch((e) => setError(e.message)).finally(() => setCargando(false))
  }, [])

  function set<K extends keyof ClinicaConfigDTO>(k: K, v: ClinicaConfigDTO[K]) {
    setData((d) => (d ? { ...d, [k]: v } : d))
    setOk(false)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!data) return
    setGuardando(true); setError(''); setOk(false)
    try {
      const updated = await clinicaService.actualizar({
        nombre: data.nombre, direccion: data.direccion, telefono: data.telefono,
        email: data.email, ciudad: data.ciudad, mensajeWA: data.mensajeWA, logoUrl: data.logoUrl,
      })
      setData(updated)
      setOk(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    } finally { setGuardando(false) }
  }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!data) return <p className="text-rose-600 text-sm">{error || 'No se pudo cargar la configuración'}</p>

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Configuración de la clínica</h1>
      <form onSubmit={guardar} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1">Logo de la clínica</span>
          <div className="flex items-center gap-4">
            {data.logoUrl
              ? <img src={data.logoUrl} alt="Logo" className="h-16 w-16 object-contain rounded-lg border border-slate-200 bg-white" />
              : <div className="h-16 w-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-xs">Sin logo</div>}
            <div className="flex-1 space-y-2">
              <input type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return
                if (f.size > 500_000) { setError('El logo es muy grande (máx 500 KB). Usá una imagen más liviana.'); return }
                const reader = new FileReader()
                reader.onload = () => { set('logoUrl', String(reader.result)); setError('') }
                reader.readAsDataURL(f)
              }} className="block text-sm text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-cyan-50 file:text-cyan-700 file:text-sm file:font-semibold" />
              <input value={data.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value)} placeholder="…o pega la URL de una imagen"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              {data.logoUrl && <button type="button" onClick={() => set('logoUrl', '')} className="text-xs text-slate-400 hover:text-rose-600">Quitar logo</button>}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">Aparece en el encabezado de la plataforma y en los presupuestos/imprimibles. Recordá pulsar "Guardar cambios".</p>
        </div>
        <Field label="Nombre" value={data.nombre} onChange={(v) => set('nombre', v)} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Teléfono" value={data.telefono} onChange={(v) => set('telefono', v)} />
          <Field label="Email" value={data.email} onChange={(v) => set('email', v)} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Dirección" value={data.direccion} onChange={(v) => set('direccion', v)} />
          <Field label="Ciudad" value={data.ciudad} onChange={(v) => set('ciudad', v)} />
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Plantilla de mensaje WhatsApp</span>
          <textarea value={data.mensajeWA} onChange={(e) => set('mensajeWA', e.target.value)} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <p className="text-xs text-slate-400 mt-1">Variables: {'{nombre}'}, {'{profesional}'}, {'{clinica}'}, {'{fecha}'}, {'{direccion}'}</p>
        </label>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {ok && <p className="text-sm text-emerald-600">Cambios guardados.</p>}
        <button type="submit" disabled={guardando}
          className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      <MediosPago />
      {esAdmin && <GoogleCalendarSection />}
    </div>
  )
}

// Integración con Google Calendar: conectar/desconectar, mapear cada doctor a un
// calendario y sincronizar. El flujo OAuth redirige a /configuracion?google=...
function GoogleCalendarSection() {
  const [estado, setEstado] = useState<'cargando' | 'conectado' | 'desconectado'>('cargando')
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([])
  const [doctores, setDoctores] = useState<UsuarioDTO[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  function cargarDoctores() {
    usuariosService.listar().then((us) => setDoctores(us.filter((u) => u.role === 'doctor' || u.role === 'medico'))).catch(() => {})
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const g = params.get('google')
    if (g === 'connected') setMsg('✓ Google Calendar conectado.')
    else if (g === 'error') setMsg('No se pudo conectar Google: ' + (params.get('reason') ?? 'error'))
    if (g) window.history.replaceState({}, '', '/configuracion')
    googleService.calendarios().then((cs) => { setCalendars(cs); setEstado('conectado') }).catch(() => setEstado('desconectado'))
    cargarDoctores()
  }, [])

  async function conectar() {
    try { const { authUrl } = await googleService.conectar(); window.location.href = authUrl }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') }
  }
  async function desconectar() {
    if (!window.confirm('¿Desconectar Google Calendar de la clínica?')) return
    await googleService.desconectar().catch(() => {})
    setEstado('desconectado'); setCalendars([]); setMsg('Google Calendar desconectado.')
  }
  async function sincronizar() {
    setBusy(true); setMsg('Sincronizando…')
    try { await googleService.sincronizar(); setMsg('Sincronización completa.') }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error al sincronizar') } finally { setBusy(false) }
  }
  async function reconciliar() {
    setBusy(true); setMsg('Reconciliando bloqueos…')
    try { const r = await googleService.reconciliarBloqueos(); setMsg(`Reconciliados: ${r.converted} de ${r.total} (omitidos ${r.skippedCount}).`) }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  async function mapear(u: UsuarioDTO, calId: string) {
    await usuariosService.actualizar(u.id, { googleCalendarId: calId || null }).catch(() => {})
    cargarDoctores()
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-bold text-slate-900">Google Calendar</h2>
        {estado === 'conectado'
          ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Conectado</span>
          : estado === 'desconectado'
          ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">No conectado</span>
          : <span className="text-xs text-slate-400">Verificando…</span>}
      </div>
      <p className="text-slate-500 text-sm mt-1 mb-4">Sincroniza la agenda de cada profesional con un calendario de Google.</p>

      {estado === 'desconectado' && (
        <button onClick={conectar} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Conectar Google Calendar</button>
      )}

      {estado === 'conectado' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Calendario por profesional</p>
            <div className="divide-y divide-slate-100">
              {doctores.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-slate-700">{u.name ?? u.username}</span>
                  <select value={u.googleCalendarId ?? ''} onChange={(e) => mapear(u, e.target.value)}
                    className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm max-w-[60%]">
                    <option value="">Sin sincronizar</option>
                    {calendars.map((c) => <option key={c.id} value={c.id}>{c.summary}{c.primary ? ' (principal)' : ''}</option>)}
                  </select>
                </div>
              ))}
              {doctores.length === 0 && <p className="text-sm text-slate-400 py-2">No hay profesionales con agenda.</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={sincronizar} disabled={busy} className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">Sincronizar ahora</button>
            <button onClick={reconciliar} disabled={busy} className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm rounded-xl" title="Convierte eventos de Google que coinciden con un paciente en citas reales">Reconciliar bloqueos</button>
            <button onClick={desconectar} className="px-3 py-2 border border-slate-200 text-slate-600 hover:text-rose-600 text-sm rounded-xl">Desconectar</button>
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-slate-600 mt-3">{msg}</p>}
    </div>
  )
}

// Medios de pago (con % de comisión que alimenta el cálculo de liquidaciones).
function MediosPago() {
  const [medios, setMedios] = useState<MedioPagoDTO[]>([])
  const [nombre, setNombre] = useState('')
  const [comision, setComision] = useState('0')
  const [reqRef, setReqRef] = useState(false)
  const [msg, setMsg] = useState('')
  const cargar = () => mediosPagoService.listar().then(setMedios).catch(() => {})
  useEffect(() => { cargar() }, [])
  async function crear() {
    if (!nombre.trim()) return
    try { await mediosPagoService.crear({ nombre: nombre.trim(), comision: Number(comision) || 0, requiereReferencia: reqRef }); setNombre(''); setComision('0'); setReqRef(false); setMsg(''); cargar() }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') }
  }
  const setComisionMedio = (m: MedioPagoDTO, v: string) => { mediosPagoService.actualizar(m.id, { comision: Number(v) || 0 }).then(cargar).catch(() => {}) }
  const setReqRefMedio = (m: MedioPagoDTO, v: boolean) => { mediosPagoService.actualizar(m.id, { requiereReferencia: v }).then(cargar).catch(() => {}) }
  const toggle = (m: MedioPagoDTO) => { mediosPagoService.actualizar(m.id, { activo: !m.activo }).then(cargar).catch(() => {}) }
  const eliminar = (m: MedioPagoDTO) => { if (window.confirm(`¿Eliminar el medio de pago "${m.nombre}"?`)) mediosPagoService.eliminar(m.id).then(cargar).catch(() => {}) }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 mt-5">
      <h2 className="text-lg font-bold text-slate-900">Medios de pago</h2>
      <p className="text-slate-500 text-sm mt-1 mb-4">El % de comisión se descuenta del monto liquidado a los profesionales. Marca “Requiere referencia” en los medios con tarjeta para exigir el N° de operación al cobrar.</p>
      <div className="divide-y divide-slate-100 mb-4">
        {medios.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
            <span className={`text-sm font-medium ${m.activo ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{m.nombre}</span>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-1 text-sm text-slate-500">
                Comisión
                <input type="number" defaultValue={m.comision} step="0.01" onBlur={(e) => setComisionMedio(m, e.target.value)}
                  className="w-20 px-2 py-1 border border-slate-200 rounded-lg text-sm text-right" /> %
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-500" title="Exige el N° de referencia de la operación al cobrar (tarjetas)">
                <input type="checkbox" checked={m.requiereReferencia} onChange={(e) => setReqRefMedio(m, e.target.checked)} />
                Requiere referencia
              </label>
              <button onClick={() => toggle(m)} className="text-xs text-slate-500 hover:text-slate-800">{m.activo ? 'Desactivar' : 'Activar'}</button>
              <button onClick={() => eliminar(m)} className="text-xs text-slate-300 hover:text-rose-600">Eliminar</button>
            </div>
          </div>
        ))}
        {medios.length === 0 && <p className="text-sm text-slate-400 py-2">Sin medios de pago.</p>}
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Nuevo medio</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Transbank débito"
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Comisión %</span>
          <input type="number" value={comision} step="0.01" onChange={(e) => setComision(e.target.value)}
            className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 pb-2.5">
          <input type="checkbox" checked={reqRef} onChange={(e) => setReqRef(e.target.checked)} />
          Requiere referencia (tarjeta)
        </label>
        <button onClick={crear} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Agregar</button>
        {msg && <span className="text-sm text-rose-600">{msg}</span>}
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
