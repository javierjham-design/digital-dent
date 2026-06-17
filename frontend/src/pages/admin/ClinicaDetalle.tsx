import { useEffect, useState, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/services/api'

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtFecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const toInput = (s: string | null | undefined) => (s ? new Date(s).toISOString().slice(0, 10) : '')

interface Clinica {
  id: string; slug: string; nombre: string; email: string | null; telefono: string | null; ciudad: string | null
  plan: string; activo: boolean; trialHasta: string | null; proximoCobro: string | null
  precioAcordado: number | null; cicloFacturacion: string | null; notasInternas: string | null; createdAt: string
}
interface Pago { id: string; fechaPago: string; monto: number; periodoDesde: string; periodoHasta: string; metodoPago: string; comprobante: string | null; notas: string | null }
interface Extra { id: string; codigo: string; nombre: string; montoMensual: number; activo: boolean; notas: string | null }
interface Wa { waEnabled: boolean; waTwilioSid: string | null; waNumero: string | null; waTemplateSid: string | null; waHorasAntes: number; tokenConfigurado: boolean }

export function AdminClinicaDetalle() {
  const { id = '' } = useParams()
  const [c, setC] = useState<Clinica | null>(null)
  const [cargando, setCargando] = useState(true)
  const [aviso, setAviso] = useState('')

  const recargar = () => adminService.clinica(id).then((r) => setC(r as Clinica))
  useEffect(() => { recargar().finally(() => setCargando(false)) }, [id])
  function flash(msg: string) { setAviso(msg); setTimeout(() => setAviso(''), 4000) }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!c) return <p className="text-slate-500 text-sm">Clínica no encontrada. <Link to="/plataforma/clinicas" className="text-purple-300">Volver</Link></p>

  return (
    <div className="space-y-5">
      <div>
        <Link to="/plataforma/clinicas" className="text-xs text-slate-500 hover:text-slate-300">← Clínicas</Link>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold">{c.nombre}</h1>
          <span className="text-sm text-slate-500 font-mono">{c.slug}</span>
          {c.activo ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-300">{c.plan}</span>
            : <span className="px-2 py-0.5 rounded-full text-xs bg-rose-500/15 text-rose-300">Suspendida</span>}
        </div>
        <p className="text-xs text-slate-500 mt-1">Creada el {fmtFecha(c.createdAt)} · {c.email || 'sin email'} · {c.telefono || 'sin teléfono'}</p>
      </div>

      {aviso && <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-xl px-4 py-2">{aviso}</div>}

      <div className="grid md:grid-cols-2 gap-5">
        <PlanCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <EstadoCard c={c} onSaved={(m) => { flash(m); recargar() }} />
        <TrialCard c={c} onSaved={(m) => { flash(m); recargar() }} />
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
  const [ciclo, setCiclo] = useState(c.cicloFacturacion ?? 'MENSUAL')
  const [precio, setPrecio] = useState(c.precioAcordado != null ? String(c.precioAcordado) : '')
  const [proximo, setProximo] = useState(toInput(c.proximoCobro))
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
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
          <label><L>Plan</L><select value={plan} onChange={(e) => setPlan(e.target.value)} className={inpCls}><option value="TRIAL">Trial</option><option value="BASICO">Básico</option><option value="PRO">Pro</option></select></label>
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

function AccesoCard({ id }: { id: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [res, setRes] = useState<{ username: string; nuevaPassword: string } | null>(null)
  async function reset() {
    if (!confirm('¿Generar una nueva contraseña para el administrador de esta clínica?')) return
    setBusy(true); setErr('')
    try { const r = await adminService.resetPassword(id, { forceChange: true }) as { username: string; nuevaPassword: string }; setRes(r) }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  return (
    <Card title="Acceso del administrador">
      {res ? (
        <div className="bg-slate-800 rounded-xl p-4 text-sm font-mono space-y-1">
          <p><span className="text-slate-500">Usuario:</span> <span className="text-white">{res.username}</span></p>
          <p><span className="text-slate-500">Nueva contraseña:</span> <span className="text-emerald-300">{res.nuevaPassword}</span></p>
          <p className="text-xs text-slate-500 font-sans pt-1">Se forzará el cambio en el primer ingreso. No se vuelve a mostrar.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-400 mb-3">Genera una contraseña temporal para el usuario <span className="font-mono">Administrador</span>.</p>
          <button onClick={reset} disabled={busy} className={btnCls}>Restablecer contraseña</button>
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
        <table className="w-full text-sm">
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
      )}
    </Card>
  )
}

function ExtrasCard({ id }: { id: string }) {
  const [extras, setExtras] = useState<Extra[]>([])
  const [form, setForm] = useState({ nombre: '', montoMensual: '' })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const cargar = () => adminService.extras(id).then((r) => setExtras(r.extras as Extra[])).catch(() => {})
  useEffect(() => { cargar() }, [id])
  async function crear() {
    setBusy(true); setErr('')
    try { await adminService.crearExtra(id, { nombre: form.nombre, montoMensual: Number(form.montoMensual) }); setForm({ nombre: '', montoMensual: '' }); cargar() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }
  async function toggle(x: Extra) { await adminService.actualizarExtra(id, x.id, { activo: !x.activo }).catch(() => {}); cargar() }
  async function eliminar(xid: string) { if (!confirm('¿Eliminar este extra?')) return; await adminService.eliminarExtra(id, xid).catch(() => {}); cargar() }
  return (
    <Card title="Extras facturables">
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <label className="flex-1 min-w-[160px]"><L>Concepto</L><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Recordatorios WhatsApp" className={inpCls} /></label>
        <label><L>Monto mensual</L><input value={form.montoMensual} onChange={(e) => setForm({ ...form, montoMensual: e.target.value })} inputMode="numeric" className={`${inpCls} font-mono w-32`} /></label>
        <button onClick={crear} disabled={busy || !form.nombre} className={btnCls}>Agregar</button>
      </div>
      {err && <p className="text-rose-400 text-sm mb-2">{err}</p>}
      {extras.length === 0 ? <p className="text-slate-500 text-sm">Sin extras.</p> : (
        <div className="divide-y divide-slate-800">
          {extras.map((x) => (
            <div key={x.id} className="flex items-center justify-between py-2.5">
              <div><p className={`text-sm ${x.activo ? 'text-white' : 'text-slate-500 line-through'}`}>{x.nombre}</p><p className="text-xs text-slate-500 font-mono">{fmtCLP(x.montoMensual)}/mes</p></div>
              <div className="flex items-center gap-3 text-xs">
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
