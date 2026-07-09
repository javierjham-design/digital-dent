import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/services/api'
import { fmtCobro, type MonedaCobro } from '@shared/constants/cobro'

const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
// Último acceso en formato relativo compacto (nunca · hace 3 min · hoy 14:30 · 05 jul).
const fmtAcceso = (s: string | null) => {
  if (!s) return 'Nunca'
  const d = new Date(s); const min = Math.floor((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'Ahora'
  if (min < 60) return `Hace ${min} min`
  const hoy = new Date(); const esHoy = d.toDateString() === hoy.toDateString()
  if (esHoy) return `Hoy ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
  if (min < 60 * 24 * 2) return `Ayer ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}
// Tamaño de la base (lo que se factura en Railway).
const fmtBytes = (b?: number | null) => {
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  const kb = b / 1024; if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024; if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

type Estado = 'AL_DIA' | 'ATRASADO' | 'TRIAL' | 'SUSPENDIDO'
interface ClinicaResumen {
  id: string; slug: string; nombre: string; plan: string; activo: boolean
  trialHasta: string | null; proximoCobro: string | null; precioMensual: number
  estado: Estado; ultimoPago: { fecha: string; monto: number } | null; createdAt: string
  esDemo: boolean; demoExpiraEn: string | null; sizeBytes: number | null
  ultimoAccesoAt: string | null; ultimoAccesoAdminAt: string | null; enLinea: number
  moneda: MonedaCobro
}

// Indicador de actividad: punto verde + "en línea" si hay usuarios conectados,
// si no, el último acceso registrado.
function Actividad({ c }: { c: ClinicaResumen }) {
  if (c.enLinea > 0) return (
    <span className="inline-flex items-center gap-1.5 text-emerald-300">
      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      {c.enLinea} en línea
    </span>
  )
  return <span className="text-slate-400">{fmtAcceso(c.ultimoAccesoAt)}</span>
}
interface Kpis { totalClinicas: number; mrrCLP: number; mrrUSD: number; arrCLP: number; arrUSD: number; alDia: number; atrasadas: number; enTrial: number; suspendidas: number; trialsPorVencer: number; demos: number; almacenamientoBytes: number; usuariosEnLinea: number }

const ESTADO_TONE: Record<Estado, string> = {
  AL_DIA: 'bg-emerald-500/15 text-emerald-300',
  ATRASADO: 'bg-rose-500/15 text-rose-300',
  TRIAL: 'bg-amber-500/15 text-amber-300',
  SUSPENDIDO: 'bg-slate-600/40 text-slate-300',
}
const ESTADO_LABEL: Record<Estado, string> = { AL_DIA: 'Al día', ATRASADO: 'Atrasado', TRIAL: 'Trial', SUSPENDIDO: 'Suspendido' }

export function AdminClinicas() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [clinicas, setClinicas] = useState<ClinicaResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [crear, setCrear] = useState(false)

  function cargar() {
    setCargando(true)
    adminService.resumen()
      .then((r) => { const d = r as { kpis: Kpis; clinicas: ClinicaResumen[] }; setKpis(d.kpis); setClinicas(d.clinicas) })
      .finally(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])
  // Refresco silencioso (sin spinner) para mantener "en línea" al día.
  useEffect(() => {
    const t = setInterval(() => {
      adminService.resumen().then((r) => { const d = r as { kpis: Kpis; clinicas: ClinicaResumen[] }; setKpis(d.kpis); setClinicas(d.clinicas) }).catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [])

  const cards = kpis ? [
    { l: 'Total', v: kpis.totalClinicas },
    { l: 'Al día', v: kpis.alDia },
    { l: 'Atrasadas', v: kpis.atrasadas },
    { l: 'En trial', v: kpis.enTrial },
    { l: 'Suspendidas', v: kpis.suspendidas },
    { l: 'Demos', v: kpis.demos },
  ] : []

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Clínicas</h1>
        <button onClick={() => setCrear(true)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg shrink-0">+ Nueva clínica</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.l} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">{c.l}</p>
            <p className="text-2xl font-bold mt-1">{c.v}</p>
          </div>
        ))}
        {kpis && (
          <div className="bg-gradient-to-br from-teal-500/10 to-emerald-500/10 border border-teal-500/30 rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-teal-300/80">MRR</p>
            <p className="text-lg font-bold mt-1 text-white">{fmtCobro(kpis.mrrCLP, 'CLP')}</p>
            {kpis.mrrUSD > 0 && <p className="text-sm font-semibold text-sky-200">{fmtCobro(kpis.mrrUSD, 'USD')}</p>}
          </div>
        )}
        {kpis && (
          <div className="bg-gradient-to-br from-sky-500/10 to-indigo-500/10 border border-sky-500/30 rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-sky-300/80">Almacenamiento</p>
            <p className="text-xl font-bold mt-1 text-white">{fmtBytes(kpis.almacenamientoBytes)}</p>
            <p className="text-[10px] text-slate-500">total en Railway</p>
          </div>
        )}
        {kpis && (
          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
            <p className="text-xs uppercase tracking-wider text-emerald-300/80 flex items-center gap-1.5">
              {kpis.usuariosEnLinea > 0 && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />} En línea
            </p>
            <p className="text-2xl font-bold mt-1 text-white">{kpis.usuariosEnLinea}</p>
            <p className="text-[10px] text-slate-500">usuarios ahora</p>
          </div>
        )}
      </div>

      {cargando ? <p className="px-6 py-10 text-center text-slate-500 text-sm">Cargando…</p>
        : clinicas.length === 0 ? <p className="px-6 py-10 text-center text-slate-500 text-sm">No hay clínicas.</p>
        : (
          <>
            {/* Móvil: tarjetas (la tabla se desborda en pantallas chicas) */}
            <div className="md:hidden space-y-3">
              {clinicas.map((c) => (
                <Link key={c.id} to={`/plataforma/clinicas/${c.id}`} className="block bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white font-medium flex items-center gap-2">
                        <span className="truncate">{c.nombre}</span>
                        {c.esDemo && <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300">DEMO</span>}
                      </p>
                      <span className="text-xs text-slate-500 font-mono">{c.slug}</span>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_TONE[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div><span className="text-slate-500">Plan</span><p className="text-slate-300">{c.plan}</p></div>
                    <div className="text-right"><span className="text-slate-500">Precio/mes</span><p className="text-slate-300 font-mono">{c.plan === 'TRIAL' ? '—' : `${fmtCobro(c.precioMensual, c.moneda)}`}</p></div>
                    <div className="col-span-2 flex items-center justify-between"><span className="text-slate-500">Actividad</span> <span className="font-medium"><Actividad c={c} /></span></div>
                    <div className="col-span-2"><span className="text-slate-500">Almacenamiento (BD)</span> <span className="text-slate-300 font-mono">{fmtBytes(c.sizeBytes)}</span></div>
                    <div className="col-span-2 border-t border-slate-800 pt-2 flex items-center justify-between">
                      <span className="text-slate-400">{c.esDemo ? `demo · expira ${fmtFecha(c.demoExpiraEn)}` : c.estado === 'TRIAL' ? `trial ${fmtFecha(c.trialHasta)}` : `cobro ${fmtFecha(c.proximoCobro)}`}</span>
                      <span className="text-purple-300 font-medium">Gestionar →</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: tabla */}
            <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                  <th className="text-left px-6 py-3">Clínica</th><th className="text-left px-6 py-3">Plan</th>
                  <th className="text-left px-6 py-3">Estado</th>
                  <th className="text-left px-6 py-3">Actividad</th>
                  <th className="text-right px-6 py-3">Precio/mes</th>
                  <th className="text-right px-6 py-3">BD</th>
                  <th className="text-right px-6 py-3">Próx. cobro</th><th className="px-6 py-3"></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {clinicas.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/40">
                      <td className="px-6 py-3">
                        <p className="text-white font-medium flex items-center gap-2">
                          {c.nombre}
                          {c.esDemo && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300">DEMO</span>}
                        </p>
                        <span className="text-xs text-slate-500 font-mono">{c.slug}</span>
                      </td>
                      <td className="px-6 py-3 text-slate-300">{c.plan}</td>
                      <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_TONE[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span></td>
                      <td className="px-6 py-3 text-xs whitespace-nowrap"><Actividad c={c} /></td>
                      <td className="px-6 py-3 text-right text-slate-300 font-mono whitespace-nowrap">{c.plan === 'TRIAL' ? '—' : fmtCobro(c.precioMensual, c.moneda)} <span className="text-[10px] text-slate-500">{c.moneda}</span></td>
                      <td className="px-6 py-3 text-right text-slate-400 font-mono text-xs whitespace-nowrap">{fmtBytes(c.sizeBytes)}</td>
                      <td className="px-6 py-3 text-right text-slate-400 text-xs whitespace-nowrap">{c.esDemo ? `demo · expira ${fmtFecha(c.demoExpiraEn)}` : c.estado === 'TRIAL' ? `trial ${fmtFecha(c.trialHasta)}` : fmtFecha(c.proximoCobro)}</td>
                      <td className="px-6 py-3 text-right"><Link to={`/plataforma/clinicas/${c.id}`} className="text-xs text-purple-300 hover:text-purple-200">Gestionar →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

      {crear && <CrearClinicaModal onClose={() => setCrear(false)} onCreada={() => { setCrear(false); cargar() }} />}
    </div>
  )
}

function CrearClinicaModal({ onClose, onCreada }: { onClose: () => void; onCreada: () => void }) {
  const [form, setForm] = useState({ clinicaNombre: '', clinicaEmail: '', clinicaTelefono: '', clinicaCiudad: 'Temuco', plan: 'TRIAL', trialDias: '30' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [creds, setCreds] = useState<{ usuario: string; contrasena: string; url_fallback: string } | null>(null)

  async function submit() {
    setGuardando(true); setError('')
    try {
      const r = await adminService.crearClinica({
        clinicaNombre: form.clinicaNombre, clinicaEmail: form.clinicaEmail || undefined, clinicaTelefono: form.clinicaTelefono || undefined,
        clinicaCiudad: form.clinicaCiudad || undefined, plan: form.plan, trialDias: Number(form.trialDias) || undefined,
      }) as { credenciales: { usuario: string; contrasena: string; url_fallback: string } }
      setCreds(r.credenciales)
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo crear la clínica') }
    finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {creds ? (
          <div>
            <h2 className="text-lg font-bold text-emerald-300 mb-2">Clínica creada ✓</h2>
            <p className="text-sm text-slate-400 mb-4">Guarda estas credenciales: la contraseña no se vuelve a mostrar.</p>
            <div className="bg-slate-800 rounded-xl p-4 space-y-2 text-sm font-mono">
              <p><span className="text-slate-500">Usuario:</span> <span className="text-white">{creds.usuario}</span></p>
              <p><span className="text-slate-500">Contraseña:</span> <span className="text-white">{creds.contrasena}</span></p>
              <p><span className="text-slate-500">Acceso:</span> <span className="text-white">{creds.url_fallback}</span></p>
            </div>
            <button onClick={onCreada} className="w-full mt-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl">Listo</button>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-bold mb-4">Nueva clínica</h2>
            <div className="space-y-3">
              <Inp label="Nombre de la clínica" value={form.clinicaNombre} onChange={(v) => setForm({ ...form, clinicaNombre: v })} />
              <div className="grid grid-cols-2 gap-3">
                <Inp label="Email" value={form.clinicaEmail} onChange={(v) => setForm({ ...form, clinicaEmail: v })} />
                <Inp label="Teléfono" value={form.clinicaTelefono} onChange={(v) => setForm({ ...form, clinicaTelefono: v })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Inp label="Ciudad" value={form.clinicaCiudad} onChange={(v) => setForm({ ...form, clinicaCiudad: v })} />
                <label className="block">
                  <span className="block text-xs text-slate-400 mb-1">Plan</span>
                  <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white">
                    <option value="TRIAL">Trial</option><option value="BASICO">Básico</option><option value="PRO">Pro</option>
                  </select>
                </label>
              </div>
              {form.plan === 'TRIAL' && <Inp label="Días de trial" value={form.trialDias} onChange={(v) => setForm({ ...form, trialDias: v })} />}
            </div>
            {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button onClick={onClose} className="flex-1 py-2.5 border border-slate-700 text-slate-300 rounded-xl text-sm">Cancelar</button>
              <button onClick={submit} disabled={guardando || !form.clinicaNombre} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm">{guardando ? 'Creando…' : 'Crear'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Inp({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
    </label>
  )
}
