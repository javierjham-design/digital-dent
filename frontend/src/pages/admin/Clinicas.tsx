import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/services/api'

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

type Estado = 'AL_DIA' | 'ATRASADO' | 'TRIAL' | 'SUSPENDIDO'
interface ClinicaResumen {
  id: string; slug: string; nombre: string; plan: string; activo: boolean
  trialHasta: string | null; proximoCobro: string | null; precioMensual: number
  estado: Estado; ultimoPago: { fecha: string; monto: number } | null; createdAt: string
  esDemo: boolean; demoExpiraEn: string | null
}
interface Kpis { totalClinicas: number; mrr: number; arr: number; alDia: number; atrasadas: number; enTrial: number; suspendidas: number; trialsPorVencer: number; demos: number }

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Clínicas</h1>
        <button onClick={() => setCrear(true)} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg">+ Nueva clínica</button>
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
            <p className="text-xl font-bold mt-1 text-white">{fmtCLP(kpis.mrr)}</p>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {cargando ? <p className="px-6 py-10 text-center text-slate-500 text-sm">Cargando…</p>
          : clinicas.length === 0 ? <p className="px-6 py-10 text-center text-slate-500 text-sm">No hay clínicas.</p>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-6 py-3">Clínica</th><th className="text-left px-6 py-3">Plan</th>
                <th className="text-left px-6 py-3">Estado</th><th className="text-right px-6 py-3">Precio/mes</th>
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
                    <td className="px-6 py-3 text-right text-slate-300 font-mono">{c.plan === 'TRIAL' ? '—' : fmtCLP(c.precioMensual)}</td>
                    <td className="px-6 py-3 text-right text-slate-400 text-xs whitespace-nowrap">{c.esDemo ? `demo · expira ${fmtFecha(c.demoExpiraEn)}` : c.estado === 'TRIAL' ? `trial ${fmtFecha(c.trialHasta)}` : fmtFecha(c.proximoCobro)}</td>
                    <td className="px-6 py-3 text-right"><Link to={`/plataforma/clinicas/${c.id}`} className="text-xs text-purple-300 hover:text-purple-200">Gestionar →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

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
