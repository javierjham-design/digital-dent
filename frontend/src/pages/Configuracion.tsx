import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ClinicaConfigDTO, UsuarioDTO } from '@shared/types'
import { clinicaService, mediosPagoService, type MedioPagoDTO } from '@/services/catalogo.service'
import { usuariosService } from '@/services/equipo.service'
import { googleService, type GoogleCalendar, type GoogleHealth } from '@/services/google.service'
import { pagosOnlineService, type PagoOnlineConfig } from '@/services/pagos-online.service'
import { tubotAgendaService, type TubotAgendaEstado } from '@/services/tubot-agenda.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

export function Configuracion() {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const puedeConfig = esAdmin || Boolean(user?.permisos?.puedeConfigurarClinica)
  const [searchParams, setSearchParams] = useSearchParams()
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
        nombre: data.nombre, direccion: data.direccion, telefono: data.telefono, whatsapp: data.whatsapp,
        email: data.email, ciudad: data.ciudad, mensajeWA: data.mensajeWA, mensajeWACrm: data.mensajeWACrm, mensajeReservaWA: data.mensajeReservaWA, logoUrl: data.logoUrl,
      })
      setData(updated)
      setOk(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar')
    } finally { setGuardando(false) }
  }

  if (!puedeConfig) return <p className="text-slate-500 text-sm max-w-md">No tienes acceso a la configuración de la clínica. Pídele a un administrador el permiso <span className="font-medium">“Configurar la clínica”</span>.</p>
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!data) return <p className="text-rose-600 text-sm">{error || 'No se pudo cargar la configuración'}</p>

  // Pestañas (la activa vive en ?tab= para poder linkear directo). Pagos online y Google
  // solo para admin (igual que antes, cuando eran bloques con `esAdmin &&`).
  const tabs: { key: string; label: string }[] = [
    { key: 'datos', label: 'Configuración general' },
    { key: 'medios', label: 'Medios de pago' },
    ...(esAdmin ? [{ key: 'pagos', label: 'Pagos online' }, { key: 'google', label: 'Google Calendar' }, { key: 'tubot', label: 'Agenda TuBot' }] : []),
  ]
  const tabParam = searchParams.get('tab') ?? 'datos'
  const tab = tabs.some((t) => t.key === tabParam) ? tabParam : 'datos'
  const setTab = (k: string) => setSearchParams({ tab: k }, { replace: true })

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Configuración de la clínica</h1>
      <div className="flex gap-1 mb-6 border-b border-slate-200 flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'datos' && (
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
        <div>
          <Field label="WhatsApp de la clínica" value={data.whatsapp} onChange={(v) => set('whatsapp', v)} />
          <p className="text-xs text-slate-400 mt-1">Con código de país (ej. +56 9 1234 5678). Es a donde se deriva al paciente tras reservar online. Si lo dejas vacío se usa el teléfono.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Dirección" value={data.direccion} onChange={(v) => set('direccion', v)} />
          <Field label="Ciudad" value={data.ciudad} onChange={(v) => set('ciudad', v)} />
        </div>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Plantilla de mensaje WhatsApp · citas</span>
          <textarea value={data.mensajeWA} onChange={(e) => set('mensajeWA', e.target.value)} rows={3}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <p className="text-xs text-slate-400 mt-1">
            Variables disponibles: {'{nombre}'} (primer nombre), {'{nombrecompleto}'}, {'{profesional}'}, {'{clinica}'}, {'{fecha}'} (día y hora), {'{dia}'}, {'{hora}'}, {'{direccion}'}, {'{telefono}'}, {'{motivo}'}
          </p>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Plantilla de mensaje WhatsApp · CRM (leads)</span>
          <textarea value={data.mensajeWACrm} onChange={(e) => set('mensajeWACrm', e.target.value)} rows={3}
            placeholder="Hola {nombre}, te contactamos de *{clinica}*. ¿Cómo podemos ayudarte?"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <p className="text-xs text-slate-400 mt-1">
            Es el mensaje que se prellena al escribirle a un lead por WhatsApp desde el CRM. Variables: {'{nombre}'} (primer nombre), {'{nombrecompleto}'}, {'{clinica}'}, {'{telefono}'}. Deja el campo vacío para no prellenar ningún texto.
          </p>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Mensaje de confirmación WhatsApp · reserva online</span>
          <textarea value={data.mensajeReservaWA} onChange={(e) => set('mensajeReservaWA', e.target.value)} rows={2}
            placeholder="¡Hola! Ya agendé mi hora para el {dia} a las {hora} h. Quedo atento/a a la confirmación."
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <p className="text-xs text-slate-400 mt-1">
            Al terminar de reservar por el link online, el paciente ve un botón que lo deriva al WhatsApp de la clínica con este mensaje. El día y la hora se completan solos. Variables: {'{dia}'}, {'{hora}'}, {'{profesional}'}, {'{clinica}'}.
          </p>
        </label>

        {error && <p className="text-sm text-rose-600">{error}</p>}
        {ok && <p className="text-sm text-emerald-600">Cambios guardados.</p>}
        <button type="submit" disabled={guardando}
          className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors">
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>
      )}

      {tab === 'medios' && <MediosPago />}
      {tab === 'pagos' && esAdmin && <PagosOnlineSection />}
      {tab === 'google' && esAdmin && <GoogleCalendarSection />}
      {tab === 'tubot' && esAdmin && <TubotAgendaSection />}
    </div>
  )
}

// Pagos online a pacientes vía Flow (link de pago). Las credenciales son de la
// clínica (el dinero cae en su cuenta). El secreto se guarda cifrado y no se
// vuelve a mostrar; solo se indica si está cargado.
function PagosOnlineSection() {
  const [cfg, setCfg] = useState<PagoOnlineConfig | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [sandbox, setSandbox] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { pagosOnlineService.config().then((c) => { setCfg(c); setEnabled(c.enabled); setSandbox(c.sandbox) }).catch(() => {}) }, [])

  async function guardar() {
    setBusy(true); setMsg('')
    try {
      const payload: { enabled: boolean; sandbox: boolean; apiKey?: string; secretKey?: string } = { enabled, sandbox }
      if (apiKey.trim()) payload.apiKey = apiKey.trim()
      if (secretKey.trim()) payload.secretKey = secretKey.trim()
      const c = await pagosOnlineService.guardarConfig(payload)
      setCfg(c); setApiKey(''); setSecretKey(''); setMsg('Configuración de pagos guardada')
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 mt-5">
      <h2 className="text-lg font-bold text-slate-900 mb-1">Pagos online a pacientes (Flow)</h2>
      <p className="text-sm text-slate-500 mb-4">Genera links de pago para tus cobros. El dinero llega a la cuenta bancaria de tu clínica configurada en Flow. Crea tu cuenta en flow.cl y pega aquí tus credenciales (API Key y Secret Key).</p>
      <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Habilitar pagos online por link
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700 mb-4">
        <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} /> Modo pruebas (sandbox de Flow)
      </label>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">API Key {cfg?.hasApiKey && <span className="text-emerald-600 text-xs">· cargada ✓</span>}</span>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={cfg?.hasApiKey ? '•••••• (dejar vacío para no cambiar)' : 'Pega tu API Key de Flow'} autoComplete="off"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Secret Key {cfg?.hasSecretKey && <span className="text-emerald-600 text-xs">· cargada ✓</span>}</span>
          <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={cfg?.hasSecretKey ? '•••••• (dejar vacío para no cambiar)' : 'Pega tu Secret Key de Flow'} autoComplete="new-password"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={guardar} disabled={busy} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{busy ? 'Guardando…' : 'Guardar'}</button>
        {cfg && <span className={`text-xs font-medium ${cfg.configurado ? 'text-emerald-600' : 'text-amber-600'}`}>{cfg.configurado ? '✓ Listo para cobrar' : 'Faltan credenciales'}</span>}
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </section>
  )
}

// Integración con Google Calendar: conectar/desconectar, mapear cada doctor a un
// calendario y sincronizar. El flujo OAuth redirige a /configuracion?google=...
function GoogleCalendarSection() {
  const [estado, setEstado] = useState<'cargando' | 'conectado' | 'desconectado'>('cargando')
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([])
  const [doctores, setDoctores] = useState<UsuarioDTO[]>([])
  const [health, setHealth] = useState<GoogleHealth | null>(null)
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
    googleService.estado().then(setHealth).catch(() => {})
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

      {health?.problema && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {health.problema === 'error' ? (
            <p><span className="font-semibold">⚠️ Google se desconectó.</span>{' '}
              La agenda de tus profesionales dejó de sincronizarse{health.desde ? ` (desde el ${new Date(health.desde).toLocaleString('es-CL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })})` : ''}.
              Las citas que se creen o muevan en Google no van a bajar a Cláriva. Volvé a conectar la cuenta abajo.</p>
          ) : (
            <p><span className="font-semibold">⚠️ La sincronización con Google está atrasada.</span>{' '}
              El último sincronismo exitoso fue {health.ultimoSync ? `el ${new Date(health.ultimoSync).toLocaleString('es-CL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })}` : 'hace mucho'} (esperado: cada {health.staleMinutos} min como máximo).
              Si recién conectaste la cuenta, dale unos minutos; si persiste, probá reconectar.</p>
          )}
        </div>
      )}

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

// Conexión de AGENDA con TuBot (self-serve de la clínica): token dedicado + webhooks.
// Con esto TuBot agenda solo en tu agenda y te avisa cambios firmados.
function TubotAgendaSection() {
  const [estado, setEstado] = useState<TubotAgendaEstado | null>(null)
  const [token, setToken] = useState('')
  const [connectionId, setConnectionId] = useState('')
  const [secret, setSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const inp = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
  const cargar = () => tubotAgendaService.estado().then((r) => {
    setEstado(r); setConnectionId(r.webhook.connectionId ?? ''); setEnabled(r.webhook.enabled)
  }).catch(() => {})
  useEffect(() => { cargar() }, [])
  async function generar() {
    if (estado?.hasToken && !confirm('Ya hay un token. Generar uno nuevo invalida el anterior. ¿Continuar?')) return
    setBusy(true); setMsg('')
    try { const r = await tubotAgendaService.generarToken(); setToken(r.token); await cargar() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }
  async function revocar() {
    if (!confirm('¿Revocar el token? TuBot dejará de poder agendar hasta generar uno nuevo.')) return
    setBusy(true); setMsg('')
    try { await tubotAgendaService.revocarToken(); setToken(''); await cargar() }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Error') } finally { setBusy(false) }
  }
  async function guardarWebhook() {
    setBusy(true); setMsg('')
    try {
      await tubotAgendaService.guardarWebhook({ enabled, connectionId: connectionId.trim() || null, secret: secret.trim() || undefined })
      setSecret(''); await cargar(); setMsg('Guardado')
    } catch (e) { setMsg(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setBusy(false) }
  }
  const btn = 'px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl'
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Token de acceso</h2>
        <p className="text-sm text-slate-500 mb-4">TuBot usa este token para leer tu agenda y agendar. Base: <span className="font-mono text-xs">https://api.clariva.cl/api/v1</span>. Se muestra completo sólo al generarlo — copialo y pegalo en TuBot.</p>
        {token && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <p className="text-xs text-emerald-700 mb-1">Token generado — copialo ahora (no se vuelve a mostrar):</p>
            <div className="flex gap-2">
              <input readOnly value={token} onFocus={(e) => e.currentTarget.select()} className={`${inp} font-mono`} />
              <button onClick={() => navigator.clipboard?.writeText(token)} className="shrink-0 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">Copiar</button>
            </div>
          </div>
        )}
        <p className="text-sm text-slate-600 mb-3">Estado: {estado?.hasToken ? <span className="text-emerald-600 font-semibold">token configurado</span> : <span className="text-slate-400">sin token</span>}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={generar} disabled={busy} className={btn}>{estado?.hasToken ? 'Regenerar token' : 'Generar token'}</button>
          {estado?.hasToken && <button onClick={revocar} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50">Revocar</button>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Avisos a TuBot (webhooks)</h2>
        <p className="text-sm text-slate-500 mb-4">Cuando conectás la clínica en TuBot, te entrega un <span className="font-mono text-xs">connectionId</span> y un secreto. Cargalos acá y activá para que cada cambio de cita/paciente en tu panel se le avise a TuBot (firmado).</p>
        <div className="space-y-4 max-w-md">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Connection ID</span>
            <input value={connectionId} onChange={(e) => setConnectionId(e.target.value)} placeholder="conn_…" className={inp} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Secreto del webhook {estado?.webhook.secretConfigurado && <span className="text-emerald-600 font-normal">(configurado — dejá vacío para conservarlo)</span>}</span>
            <input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" placeholder={estado?.webhook.secretConfigurado ? '••••••••' : 'secreto'} className={inp} />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
            Activar avisos a TuBot
          </label>
          <div className="flex items-center gap-3">
            <button onClick={guardarWebhook} disabled={busy} className={btn}>Guardar</button>
            {msg && <span className="text-xs text-slate-500">{msg}</span>}
          </div>
        </div>
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
