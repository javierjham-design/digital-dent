import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/services/api'
import { PAISES_LISTA, getPais } from '@shared/constants/paises'
import { MODULOS, MODULOS_CODES } from '@shared/constants/modulos'

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtFecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const toInput = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 10) : '')
const fmtAcceso = (s: string | null | undefined) => {
  if (!s) return 'Nunca ha ingresado'
  const d = new Date(s); const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'Hace instantes'
  if (min < 60) return `Hace ${min} min`
  const esHoy = d.toDateString() === new Date().toDateString()
  if (esHoy) return `Hoy a las ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const fmtBytes = (b?: number | null) => {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  const kb = b / 1024; if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024; if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

interface Clinica {
  id: string; slug: string; nombre: string; email: string | null; telefono: string | null; ciudad: string | null
  plan: string; activo: boolean; trialHasta: string | null; proximoCobro: string | null
  precioAcordado: number | null; cicloFacturacion: string | null; notasInternas: string | null; createdAt: string
  esDemo: boolean; demoExpiraEn: string | null; pais: string; sizeBytes?: number | null; modulos?: string[]
  ultimoAccesoAt?: string | null; ultimoAccesoAdminAt?: string | null
  enLinea?: number; adminEnLinea?: boolean; usuariosEnLinea?: { name: string; admin: boolean; at: string }[]
  profesionales?: { activos: number; limite: number; base: number; extra: number; planNombre: string; precioExtra: number }
}
interface Pago { id: string; fechaPago: string; monto: number; periodoDesde: string; periodoHasta: string; metodoPago: string; comprobante: string | null; notas: string | null }
interface Extra { id: string; codigo: string; nombre: string; montoMensual: number; activo: boolean; notas: string | null }
interface Plan { id: string; nombre: string; precioMensual: number; orden: number; activo: boolean }
interface Wa { waEnabled: boolean; waTwilioSid: string | null; waNumero: string | null; waTemplateSid: string | null; waHorasAntes: number; tokenConfigurado: boolean }

export function AdminClinicaDetalle() {
  const { id = '' } = useParams()
  const [c, setC] = useState<Clinica | null>(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')

  const recargar = () => adminService.clinica(id).then((r) => setC(r as Clinica))
  useEffect(() => { recargar().finally(() => setCargando(false)) }, [id])
  // Refresca cada 30s para mantener al día "usuarios en línea".
  useEffect(() => { const t = setInterval(() => { recargar().catch(() => {}) }, 30000); return () => clearInterval(t) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  function flash(msg: string) { setAviso(msg); setTimeout(() => setAviso(''), 4000) }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!c) return <p className="text-slate-500 text-sm">Clínica no encontrada. <Link to="/plataforma/clinicas" className="text-purple-300">Volver</Link></p>

  return (
    <div className="space-y-5">
      <div>
        <Link to="/plataforma/clinicas" className="text-xs text-slate-500 hover:text-slate-300">← Clínicas</Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
          <h1 className="text-2xl md:text-3xl font-bold">{c.nombre}</h1>
          <span className="text-sm text-slate-500 font-mono">{c.slug}</span>
          {c.activo ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-300">{c.plan}</span>
            : <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500/15 text-rose-300">Suspendida</span>}
          {c.esDemo && <span className="px-2 py-0.5 rounded-full text-xs bg-sky-500/15 text-sky-300">DEMO{c.demoExpiraEn ? ` · expira ${fmtFecha(c.demoExpiraEn)}` : ''}</span>}
        </div>
        <p className="text-xs text-slate-500 mt-1">Creada el {fmtFecha(c.createdAt)} · {c.email || 'sin email'} · {c.telefono || 'sin teléfono'} · <span className="text-sky-300/80">BD {fmtBytes(c.sizeBytes)}</span></p>
      </div>

      {aviso && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl px-4 py-2">{aviso}</div>}

      {c.esDemo && <ConvertirCard c={c} onSaved={(m) => { flash(m); recargar() }} />}

      <ActividadCard c={c} />

      <div className="grid md:grid-cols-2 gap-5">
        <PlanCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <EstadoCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <TrialCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <PaisCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <ProfesionalesCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <ModulosCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <LinkCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <AccesoCard id={c.id} />
      </div>
      <PagosCard id={c.id} onChange={() => { flash('Pago registrado'); recargar() }} />
      <ExtrasCard id={c.id} />
      <WhatsappCard id={c.id} onSaved={() => flash('Configuración de WhatsApp guardada')} />
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}
function L({ children }: { children: ReactNode }) { return <span className="block text-xs text-slate-400 mb-1">{children}</span> }
const inpCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500'
const btnCls = 'px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg'

function PlanCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const [plan, setPlan] = useState(c.plan)
  const [planes, setPlanes] = useState<Plan[]>([])
  const [ciclo, setCiclo] = useState(c.cicloFacturacion ?? 'MENSUAL')
  const [precio, setPrecio] = useState(c.precioAcordado != null ? String(c.precioAcordado) : '')
  const [proximo, setProximo] = useState(toInput(c.proximoCobro))
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  // Trae los planes creados en la sección "Planes" (los mismos de la página de venta).
  useEffect(() => { adminService.planes().then((r) => setPlanes((r.planes as Plan[]).slice().sort((a, b) => a.orden - b.orden))).catch(() => {}) }, [])
  // Planes activos + el plan actual de la clínica (aunque esté inactivo) para no perderlo.
  const opciones = planes.filter((p) => p.activo || p.id === c.plan)
  const actualEnLista = opciones.some((p) => p.id === c.plan)
  async function guardar() {
    setBusy(true); setErr('')
    try {
      await adminService.cambiarPlan(c.id, {
        plan, cicloFacturacion: ciclo,
        precioAcordado: precio === '' ? null : Number(precio),
        proximoCobro: proximo || null,
      })
      onSaved('Plan actualizado')
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  return (
    <Card title="Plan y facturación">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label><L>Plan</L>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inpCls}>
              {!actualEnLista && c.plan && <option value={c.plan}>{c.plan}</option>}
              {opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.precioMensual > 0 ? ` · ${fmtCLP(p.precioMensual)}/mes` : ''}</option>)}
              {opciones.length === 0 && <option value={c.plan}>{c.plan}</option>}
            </select>
          </label>
          <label><L>Ciclo</L><select value={ciclo} onChange={(e) => setCiclo(e.target.value)} className={inpCls}><option value="MENSUAL">Mensual</option><option value="ANUAL">Anual</option></select></label>
        </div>
        <label><L>Precio acordado (opcional, sobrescribe el del plan)</L><input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" placeholder="usar precio del plan" className={`${inpCls} font-mono`} /></label>
        <label><L>Próximo cobro</L><input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} className={inpCls} /></label>
      </div>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      <button onClick={guardar} disabled={busy} className={`${btnCls} mt-4`}>Guardar plan</button>
    </Card>
  )
}

function EstadoCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const [notas, setNotas] = useState(c.notasInternas ?? '')
  const [busy, setBusy] = useState(false)
  async function cambiar(activo: boolean) {
    setBusy(true)
    try { await adminService.estado(c.id, { activo, notasInternas: notas }); onSaved(activo ? 'Clínica reactivada' : 'Clínica suspendida') }
    finally { setBusy(false) }
  }
  return (
    <Card title="Estado de la cuenta">
      <p className="text-sm text-slate-400 mb-3">Estado actual: {c.activo ? <span className="text-emerald-300 font-medium">Activa</span> : <span className="text-rose-300 font-medium">Suspendida</span>}</p>
      <label><L>Notas internas</L><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={inpCls} /></label>
      <div className="flex gap-2 mt-4">
        {c.activo
          ? <button onClick={() => cambiar(false)} disabled={busy} className="px-4 py-2 bg-rose-600/90 hover:bg-rose-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">Suspender</button>
          : <button onClick={() => cambiar(true)} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">Reactivar</button>}
        <button onClick={() => cambiar(c.activo)} disabled={busy} className="px-4 py-2 border border-slate-700 text-slate-300 text-sm rounded-lg">Guardar notas</button>
      </div>
    </Card>
  )
}

function TrialCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const [dias, setDias] = useState('15')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  async function extender() {
    setBusy(true); setErr('')
    try { await adminService.extenderTrial(c.id, { dias: Number(dias) }); onSaved(`Trial extendido ${dias} días`) }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  return (
    <Card title="Trial">
      <p className="text-sm text-slate-400 mb-3">Vence: <span className="text-white">{fmtFecha(c.trialHasta)}</span></p>
      <div className="flex items-end gap-2">
        <label className="flex-1"><L>Extender (días)</L><input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className={`${inpCls} font-mono`} /></label>
        <button onClick={extender} disabled={busy} className={btnCls}>Extender</button>
      </div>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
    </Card>
  )
}

// Deriva el dominio base (ej. clariva.cl) desde el host actual del panel.
function baseDomain(): string {
  const h = window.location.hostname
  const parts = h.split('.')
  return parts.length >= 2 ? parts.slice(-2).join('.') : h
}

function ConvertirCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const base = baseDomain()
  const [slug, setSlug] = useState(c.slug)
  const [plan, setPlan] = useState(c.plan === 'TRIAL' ? 'BASICO' : c.plan)
  const [precio, setPrecio] = useState(c.precioAcordado != null ? String(c.precioAcordado) : '')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')

  async function convertir() {
    if (!slug.trim()) { setErr('Ingresa el link definitivo'); return }
    if (!confirm(`Convertir "${c.nombre}" en clínica definitiva con el link ${slug.trim()}.${base}?`)) return
    setBusy(true); setErr('')
    try {
      await adminService.convertir(c.id, { slug: slug.trim(), plan, precioAcordado: precio ? Number(precio) : undefined })
      onSaved('Clínica convertida a definitiva ✓')
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <div className="bg-sky-500/5 border border-sky-500/30 rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-sky-300 mb-1 uppercase tracking-wider">Convertir demo a definitiva</h2>
      <p className="text-sm text-slate-400 mb-4">Quita el estado de demo y asigna el link definitivo + el plan. No se pierde ningún dato de la clínica.</p>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="block md:col-span-1"><L>Link definitivo</L>
          <div className="flex items-center gap-1">
            <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inpCls} />
            <span className="text-xs text-slate-500 shrink-0">.{base}</span>
          </div>
        </label>
        <label className="block"><L>Plan</L>
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inpCls}>
            <option value="BASICO">Básico</option><option value="PRO">Pro</option><option value="TRIAL">Trial</option>
          </select>
        </label>
        <label className="block"><L>Precio mensual (opcional)</L>
          <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" placeholder="0" className={`${inpCls} font-mono`} />
        </label>
      </div>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      <button onClick={convertir} disabled={busy} className={`${btnCls} mt-4`}>{busy ? 'Convirtiendo…' : 'Convertir a definitiva'}</button>
    </div>
  )
}

function PaisCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const [pais, setPais] = useState(c.pais || 'CL')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const actual = getPais(c.pais)

  async function guardar() {
    if (pais === c.pais) return
    if (!confirm(`¿Cambiar el país de operación a ${getPais(pais).nombre}? Afecta el documento, el teléfono y la moneda de la clínica.`)) return
    setBusy(true); setErr('')
    try { await adminService.cambiarPais(c.id, pais); onSaved('País de operación actualizado ✓') }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <Card title="País de operación">
      <p className="text-sm text-slate-400 mb-3">Define el documento, el formato de teléfono y la moneda de la clínica. La base es Chile.</p>
      <p className="text-sm mb-3"><span className="text-slate-500">Actual:</span> <span className="text-white font-medium">{actual.bandera} {actual.nombre}</span> <span className="text-xs text-slate-500">· {actual.moneda.simbolo} {actual.moneda.code} · {actual.doc.label}</span></p>
      <label className="block"><L>País</L>
        <select value={pais} onChange={(e) => setPais(e.target.value)} className={inpCls}>
          {PAISES_LISTA.map((p) => <option key={p.code} value={p.code}>{p.bandera} {p.nombre} · {p.moneda.simbolo} {p.moneda.code}</option>)}
        </select>
      </label>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      <button onClick={guardar} disabled={busy || pais === c.pais} className={`${btnCls} mt-3`}>{busy ? 'Guardando…' : 'Cambiar país'}</button>
    </Card>
  )
}

// Registro de uso: último acceso a la plataforma + usuarios en línea ahora mismo.
function ActividadCard({ c }: { c: Clinica }) {
  const enLinea = c.enLinea ?? 0
  const usuarios = c.usuariosEnLinea ?? []
  return (
    <Card title="Actividad y uso">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div>
          <p className="text-xs text-slate-500 mb-1">Usuarios en línea</p>
          {enLinea > 0 ? (
            <p className="flex items-center gap-2 text-emerald-300 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              {enLinea} conectado{enLinea === 1 ? '' : 's'}{c.adminEnLinea && <span className="text-[11px] font-medium text-amber-300">· admin presente</span>}
            </p>
          ) : <p className="text-slate-400 font-medium">Nadie conectado</p>}
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Último acceso (cualquier usuario)</p>
          <p className="text-white font-medium">{fmtAcceso(c.ultimoAccesoAt)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Último acceso del administrador</p>
          <p className="text-white font-medium">{fmtAcceso(c.ultimoAccesoAdminAt)}</p>
        </div>
      </div>
      {usuarios.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {usuarios.map((u, i) => (
            <span key={i} className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 border ${u.admin ? 'bg-amber-500/10 text-amber-200 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${u.admin ? 'bg-amber-400' : 'bg-emerald-400'}`} /> {u.name}{u.admin ? ' · admin' : ''}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-500 mt-3">"En línea" = actividad en los últimos 5 minutos. Se actualiza solo cada 30 s. El acceso del administrador se registra aparte para ver si el dueño está usando la plataforma.</p>
    </Card>
  )
}

// Tope de profesionales (usuarios CON agenda) = máximo del plan + extras.
// Cada profesional extra cuesta $9.990/mes. Los usuarios sin agenda no cuentan.
function ProfesionalesCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const p = c.profesionales
  const [extra, setExtra] = useState(String(p?.extra ?? 0))
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  useEffect(() => { setExtra(String(p?.extra ?? 0)) }, [p?.extra])
  const nExtra = Math.max(0, Math.round(Number(extra) || 0))
  const dirty = nExtra !== (p?.extra ?? 0)
  const limitePreview = (p?.base ?? 0) + nExtra
  const excedido = p ? p.activos > p.limite : false

  async function guardar() {
    if (!dirty) return
    setBusy(true); setErr('')
    try { await adminService.cambiarProfesionalesExtra(c.id, nExtra); onSaved('Profesionales extra actualizados ✓') }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <Card title="Profesionales con agenda">
      <p className="text-sm text-slate-400 mb-3">Usuarios <span className="text-slate-200">con agenda</span> (doctores/médicos). Los usuarios sin agenda (recepción, asistentes) no tienen límite.</p>
      {p ? (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-3 text-sm">
            <span><span className="text-slate-500">En uso:</span> <span className={`font-semibold ${excedido ? 'text-rose-300' : 'text-white'}`}>{p.activos}</span> / {limitePreview}</span>
            <span className="text-xs text-slate-500">Plan {p.planNombre}: {p.base} · Extras: {nExtra}</span>
          </div>
          {excedido && <p className="text-xs text-rose-300 mb-2">⚠️ La clínica tiene más profesionales activos que su tope. Aumenta los extras o desactiva profesionales.</p>}
          <label className="block"><L>Profesionales extra ({fmtCLP(p.precioExtra)}/mes c/u)</L>
            <input type="number" min={0} max={100} value={extra} onChange={(e) => setExtra(e.target.value)} className={`${inpCls} w-32`} />
          </label>
          {nExtra > 0 && <p className="text-[11px] text-slate-400 mt-1">+{fmtCLP(nExtra * p.precioExtra)} al mes por {nExtra} profesional{nExtra === 1 ? '' : 'es'} extra.</p>}
          {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
          <button onClick={guardar} disabled={busy || !dirty} className={`${btnCls} mt-3`}>{busy ? 'Guardando…' : 'Guardar profesionales'}</button>
        </>
      ) : <p className="text-sm text-slate-500">Sin datos.</p>}
    </Card>
  )
}

function ModulosCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const [sel, setSel] = useState<string[]>(c.modulos ?? MODULOS_CODES)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify([...(c.modulos ?? MODULOS_CODES)].sort())

  function toggle(code: string) {
    setSel((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]))
  }
  async function guardar() {
    if (!dirty) return
    setBusy(true); setErr('')
    try { await adminService.cambiarModulos(c.id, sel); onSaved('Módulos actualizados ✓') }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <Card title="Módulos habilitados">
      <p className="text-sm text-slate-400 mb-3">Activa sólo los módulos que la clínica contrató. Al desactivar uno, deja de verse en su menú y de operar (formularios, agenda pública, API de Claude/MCP).</p>
      <div className="space-y-2">
        {MODULOS.map((m) => {
          const on = sel.includes(m.code)
          return (
            <label key={m.code} className="flex items-start gap-3 rounded-lg border border-white/10 px-3 py-2 cursor-pointer hover:bg-white/5">
              <input type="checkbox" checked={on} onChange={() => toggle(m.code)} className="mt-1 accent-purple-500" />
              <span>
                <span className="text-sm text-white font-medium">{m.nombre}</span>
                <span className="block text-xs text-slate-500">{m.descripcion}</span>
              </span>
            </label>
          )
        })}
      </div>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      <button onClick={guardar} disabled={busy || !dirty} className={`${btnCls} mt-3`}>{busy ? 'Guardando…' : 'Guardar módulos'}</button>
    </Card>
  )
}

function LinkCard({ c, onSaved }: { c: Clinica; onSaved: (m: string) => void }) {
  const base = baseDomain()
  const [slug, setSlug] = useState(c.slug)
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const loginUrl = `https://${c.slug}.${base}`
  const copiar = (t: string) => { navigator.clipboard.writeText(t).then(() => onSaved('Copiado')).catch(() => {}) }

  async function guardar() {
    const nuevo = slug.trim()
    if (!nuevo || nuevo === c.slug) return
    if (!confirm(`Cambiar el link de acceso a ${nuevo}.${base}? El link anterior dejará de funcionar.`)) return
    setBusy(true); setErr('')
    try { await adminService.cambiarSlug(c.id, nuevo); onSaved('Link de acceso actualizado ✓') }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <Card title="Link de acceso">
      <p className="text-xs text-slate-500 mb-1">Enlace de ingreso de la clínica:</p>
      <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2 mb-4">
        <span className="text-xs font-mono text-slate-300 truncate flex-1">{loginUrl}</span>
        <button onClick={() => copiar(loginUrl)} className="text-xs font-semibold text-purple-300 shrink-0">Copiar</button>
        <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-500 shrink-0">Abrir</a>
      </div>
      <label className="block"><L>Cambiar link (subdominio)</L>
        <div className="flex items-center gap-1">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className={inpCls} />
          <span className="text-xs text-slate-500 shrink-0">.{base}</span>
        </div>
      </label>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      <button onClick={guardar} disabled={busy || !slug.trim() || slug.trim() === c.slug} className={`${btnCls} mt-3`}>{busy ? 'Guardando…' : 'Actualizar link'}</button>
    </Card>
  )
}

function AccesoCard({ id }: { id: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [res, setRes] = useState<{ username: string; nuevaPassword: string } | null>(null)
  const [modo, setModo] = useState<'auto' | 'manual'>('auto')
  const [pass, setPass] = useState('')

  async function aplicar() {
    if (modo === 'manual' && pass.trim().length < 8) { setErr('La clave debe tener al menos 8 caracteres'); return }
    if (!confirm('¿Asignar una nueva contraseña al administrador de esta clínica?')) return
    setBusy(true); setErr('')
    try {
      const input: Record<string, unknown> = { forceChange: modo === 'auto' } // manual = clave definitiva (no forzar cambio)
      if (modo === 'manual') input.newPassword = pass.trim()
      const r = await adminService.resetPassword(id, input) as { username: string; nuevaPassword: string }
      setRes(r); setPass('')
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  return (
    <Card title="Acceso del administrador">
      {res ? (
        <div>
          <div className="bg-slate-800 rounded-xl p-4 text-sm font-mono space-y-1">
            <p><span className="text-slate-500">Usuario:</span> <span className="text-white">{res.username}</span></p>
            <p><span className="text-slate-500">Nueva contraseña:</span> <span className="text-emerald-300">{res.nuevaPassword}</span></p>
          </div>
          <p className="text-xs text-slate-500 mt-2">{modo === 'auto' ? 'Se forzará el cambio en el primer ingreso. ' : ''}Guárdala: no se vuelve a mostrar.</p>
          <button onClick={() => setRes(null)} className="mt-3 text-xs text-slate-400 hover:text-white">Asignar otra</button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-400 mb-3">Contraseña del usuario <span className="font-mono">Administrador</span> de esta clínica.</p>
          <div className="flex gap-2 mb-3">
            {(['auto', 'manual'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setModo(m); setErr('') }}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border ${modo === m ? 'border-purple-500 bg-purple-500/10 text-purple-200' : 'border-slate-700 text-slate-400'}`}>
                {m === 'auto' ? 'Generar automática' : 'Asignar una clave'}
              </button>
            ))}
          </div>
          {modo === 'manual' && (
            <label className="block mb-3"><L>Nueva clave (mín. 8 caracteres)</L>
              <input type="text" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" placeholder="Escribe la clave" className={`${inpCls} font-mono`} />
            </label>
          )}
          <button onClick={aplicar} disabled={busy} className={btnCls}>{busy ? 'Aplicando…' : modo === 'auto' ? 'Generar y aplicar' : 'Asignar clave'}</button>
          {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
        </>
      )}
    </Card>
  )
}

function PagosCard({ id, onChange }: { id: string; onChange: () => void }) {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [form, setForm] = useState({ monto: '', metodoPago: 'TRANSFERENCIA', fechaPago: toInput(new Date().toISOString()), comprobante: '' })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const cargar = () => adminService.pagos(id).then((r) => setPagos(r.pagos as Pago[])).catch(() => {})
  useEffect(() => { cargar() }, [id])
  async function registrar() {
    setBusy(true); setErr('')
    try {
      await adminService.registrarPago(id, { monto: Number(form.monto), metodoPago: form.metodoPago, fechaPago: form.fechaPago || undefined, comprobante: form.comprobante || undefined })
      setForm({ ...form, monto: '', comprobante: '' }); cargar(); onChange()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  async function eliminar(pagoId: string) { if (!confirm('¿Eliminar este pago?')) return; await adminService.eliminarPago(id, pagoId).catch(() => {}); cargar() }
  return (
    <Card title="Pagos de suscripción">
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label><L>Monto</L><input value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} inputMode="numeric" className={`${inpCls} font-mono w-32`} /></label>
        <label><L>Método</L><select value={form.metodoPago} onChange={(e) => setForm({ ...form, metodoPago: e.target.value })} className={inpCls}><option>TRANSFERENCIA</option><option>WEBPAY</option><option>EFECTIVO</option><option>OTRO</option></select></label>
        <label><L>Fecha</L><input type="date" value={form.fechaPago} onChange={(e) => setForm({ ...form, fechaPago: e.target.value })} className={inpCls} /></label>
        <label className="flex-1 min-w-[140px]"><L>Comprobante (opcional)</L><input value={form.comprobante} onChange={(e) => setForm({ ...form, comprobante: e.target.value })} className={inpCls} /></label>
        <button onClick={registrar} disabled={busy || !form.monto} className={btnCls}>Registrar pago</button>
      </div>
      {err && <p className="text-rose-400 text-sm mb-2">{err}</p>}
      {pagos.length === 0 ? <p className="text-slate-500 text-sm">Sin pagos registrados.</p> : (
        <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm min-w-[440px]">
          <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500"><th className="text-left py-2">Fecha</th><th className="text-left py-2">Período</th><th className="text-left py-2">Método</th><th className="text-right py-2">Monto</th><th></th></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {pagos.map((p) => (
              <tr key={p.id}>
                <td className="py-2 text-slate-300">{fmtFecha(p.fechaPago)}</td>
                <td className="py-2 text-slate-400 text-xs">{fmtFecha(p.periodoDesde)} → {fmtFecha(p.periodoHasta)}</td>
                <td className="py-2 text-slate-400">{p.metodoPago}</td>
                <td className="py-2 text-right text-white font-mono">{fmtCLP(p.monto)}</td>
                <td className="py-2 text-right"><button onClick={() => eliminar(p.id)} className="text-xs text-rose-400 hover:text-rose-300">Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </Card>
  )
}

function ExtrasCard({ id }: { id: string }) {
  const [extras, setExtras] = useState<Extra[]>([])
  const [form, setForm] = useState({ nombre: '', montoMensual: '' })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [editId, setEditId] = useState<string | null>(null); const [editVal, setEditVal] = useState('')
  const cargar = () => adminService.extras(id).then((r) => setExtras(r.extras as Extra[])).catch(() => {})
  useEffect(() => { cargar() }, [id])
  async function crear() {
    setBusy(true); setErr('')
    try { await adminService.crearExtra(id, { nombre: form.nombre, montoMensual: Number(form.montoMensual) || 0 }); setForm({ nombre: '', montoMensual: '' }); cargar() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  async function toggle(x: Extra) { await adminService.actualizarExtra(id, x.id, { activo: !x.activo }).catch(() => {}); cargar() }
  async function eliminar(xid: string) { if (!confirm('¿Eliminar este extra?')) return; await adminService.eliminarExtra(id, xid).catch(() => {}); cargar() }
  async function guardarMonto(x: Extra) {
    const m = Number(editVal); setEditId(null)
    if (Number.isFinite(m) && m >= 0 && m !== x.montoMensual) { await adminService.actualizarExtra(id, x.id, { montoMensual: m }).catch(() => {}); cargar() }
  }
  return (
    <Card title="Extras facturables">
      <p className="text-xs text-slate-500 -mt-2 mb-3">Cargos mensuales adicionales para esta clínica (se suman al MRR). Ej: recordatorios WhatsApp, módulos extra.</p>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="flex-1 min-w-[160px]"><L>Concepto</L><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Recordatorios WhatsApp" className={inpCls} /></label>
        <label><L>Monto mensual</L><input value={form.montoMensual} onChange={(e) => setForm({ ...form, montoMensual: e.target.value })} inputMode="numeric" placeholder="0" className={`${inpCls} font-mono w-32`} /></label>
        <button onClick={crear} disabled={busy || !form.nombre} className={btnCls}>Agregar</button>
      </div>
      {err && <p className="text-rose-400 text-sm mb-2">{err}</p>}
      {extras.length === 0 ? <p className="text-slate-500 text-sm">Sin extras.</p> : (
        <div className="divide-y divide-slate-800">
          {extras.map((x) => (
            <div key={x.id} className="flex items-center justify-between py-2.5 gap-3">
              <div className="min-w-0">
                <p className={`text-sm ${x.activo ? 'text-white' : 'text-slate-500 line-through'}`}>{x.nombre}</p>
                {editId === x.id ? (
                  <input autoFocus type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => guardarMonto(x)}
                    onKeyDown={(e) => { if (e.key === 'Enter') guardarMonto(x); if (e.key === 'Escape') setEditId(null) }}
                    className="mt-1 w-28 px-2 py-1 bg-slate-800 border border-purple-500 rounded-lg text-xs text-white font-mono" />
                ) : (
                  <button onClick={() => { setEditId(x.id); setEditVal(String(x.montoMensual)) }} className="text-xs text-slate-500 font-mono hover:text-white" title="Editar monto">{fmtCLP(x.montoMensual)}/mes ✎</button>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs shrink-0">
                <button onClick={() => toggle(x)} className="text-slate-400 hover:text-white">{x.activo ? 'Pausar' : 'Activar'}</button>
                <button onClick={() => eliminar(x.id)} className="text-rose-400 hover:text-rose-300">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function WhatsappCard({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [wa, setWa] = useState<Wa | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  useEffect(() => { adminService.whatsapp(id).then((r) => setWa(r as Wa)).catch(() => {}) }, [id])
  if (!wa) return <Card title="WhatsApp (Twilio)"><p className="text-slate-500 text-sm">Cargando…</p></Card>
  const set = (patch: Partial<Wa>) => setWa({ ...wa, ...patch })
  async function guardar() {
    setBusy(true); setErr('')
    try {
      await adminService.guardarWhatsapp(id, {
        waEnabled: wa!.waEnabled, waTwilioSid: wa!.waTwilioSid, waNumero: wa!.waNumero,
        waTemplateSid: wa!.waTemplateSid, waHorasAntes: wa!.waHorasAntes,
        ...(token.trim() ? { waTwilioToken: token.trim() } : {}),
      })
      setToken(''); onSaved()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  return (
    <Card title="WhatsApp (Twilio) — recordatorios de cita">
      <label className="flex items-center gap-2 mb-4 text-sm text-slate-300">
        <input type="checkbox" checked={wa.waEnabled} onChange={(e) => set({ waEnabled: e.target.checked })} className="w-4 h-4 accent-purple-500" />
        Servicio habilitado
      </label>
      <div className="grid md:grid-cols-2 gap-3">
        <label><L>Account SID (AC…)</L><input value={wa.waTwilioSid ?? ''} onChange={(e) => set({ waTwilioSid: e.target.value })} className={`${inpCls} font-mono`} /></label>
        <label><L>Número emisor (E.164)</L><input value={wa.waNumero ?? ''} onChange={(e) => set({ waNumero: e.target.value })} placeholder="+56912345678" className={`${inpCls} font-mono`} /></label>
        <label><L>Template / Content SID (HX…)</L><input value={wa.waTemplateSid ?? ''} onChange={(e) => set({ waTemplateSid: e.target.value })} className={`${inpCls} font-mono`} /></label>
        <label><L>Horas de anticipación</L><input value={wa.waHorasAntes} onChange={(e) => set({ waHorasAntes: Number(e.target.value) || 0 })} inputMode="numeric" className={`${inpCls} font-mono`} /></label>
        <label className="md:col-span-2"><L>Auth Token {wa.tokenConfigurado ? '(configurado — dejar vacío para mantener)' : '(no configurado)'}</L><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={wa.tokenConfigurado ? '••••••••' : 'Pegar token de Twilio'} className={`${inpCls} font-mono`} /></label>
      </div>
      {err && <p className="text-rose-400 text-sm mt-2">{err}</p>}
      <button onClick={guardar} disabled={busy} className={`${btnCls} mt-4`}>Guardar configuración</button>
    </Card>
  )
}
