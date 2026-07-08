import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { suscripcionService, type EstadoSuscripcion, type ResultadoEnlace } from '@/services/suscripcion.service'
import { fmtCobro } from '@shared/constants/cobro'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')
const ESTADO: Record<string, { l: string; c: string }> = {
  TRIAL: { l: 'Período de prueba', c: 'bg-amber-100 text-amber-700' },
  AL_DIA: { l: 'Al día', c: 'bg-emerald-100 text-emerald-700' },
  ATRASADO: { l: 'Pago pendiente', c: 'bg-rose-100 text-rose-700' },
  SUSPENDIDO: { l: 'Suspendida', c: 'bg-slate-200 text-slate-600' },
}

export function Suscripcion() {
  const { user } = useAuth()
  const [s, setS] = useState<EstadoSuscripcion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState(false)
  const [res, setRes] = useState<ResultadoEnlace | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => { suscripcionService.estado().then(setS).catch(() => {}).finally(() => setCargando(false)) }, [])

  if (user?.role !== 'admin') return (
    <div className="max-w-md mx-auto text-center py-16">
      <p className="text-slate-500 text-sm">Solo el administrador de la clínica puede ver la suscripción y los pagos.</p>
      <Link to="/agenda" className="inline-block mt-3 text-sm text-cyan-700 font-semibold">Volver</Link>
    </div>
  )
  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>
  if (!s) return <p className="text-slate-500 text-sm">No se pudo cargar la suscripción.</p>

  const est = ESTADO[s.estado] ?? { l: s.estado, c: 'bg-slate-100 text-slate-600' }
  const fmt = (n: number) => fmtCobro(n, s.moneda)

  async function pagar(recurrente: boolean) {
    setPagando(true); setErr(''); setRes(null)
    try {
      const r = await suscripcionService.enlacePago(recurrente)
      setRes(r)
      if (r.estado === 'ok') window.open(r.url, '_blank', 'noopener,noreferrer')
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo generar el pago') } finally { setPagando(false) }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Suscripción y pagos</h1>
      <p className="text-sm text-slate-500 mb-5">Tu plan, lo que se cobra cada mes y el estado de tu suscripción.</p>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Plan actual</p>
            <p className="text-xl font-bold text-slate-900">{s.plan}</p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${est.c}`}>{est.l}</span>
        </div>

        <dl className="text-sm divide-y divide-slate-100">
          <Row k="Plan" v={fmt(s.precioPlan)} />
          {s.profesionalesExtra > 0 && <Row k={`Profesionales extra (${s.profesionalesExtra})`} v={fmt(s.montoProfesionales)} />}
          {s.montoExtras > 0 && <Row k="Otros adicionales" v={fmt(s.montoExtras)} />}
          <div className="flex justify-between py-2 font-semibold text-slate-900">
            <dt>Total mensual</dt><dd>{fmt(s.total)} <span className="text-xs font-normal text-slate-400">/ mes ({s.moneda})</span></dd>
          </div>
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-400">Próximo cobro</p><p className="text-slate-700 font-medium">{s.estado === 'TRIAL' ? `Fin de prueba: ${fmtFecha(s.trialHasta)}` : fmtFecha(s.proximoCobro)}</p></div>
          <div><p className="text-xs text-slate-400">Cobro automático</p><p className="text-slate-700 font-medium">{s.cobroAutomatico ? 'Activado' : 'Desactivado'}</p></div>
        </div>
      </div>

      {/* Medio de pago */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
        <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">Medio de pago</p>
        {s.metodo
          ? <p className="text-sm text-slate-700">{s.metodo.marca ?? s.metodo.provider} terminada en ····{s.metodo.ultimos4 ?? '????'}{s.metodo.exp ? ` · vence ${s.metodo.exp}` : ''}</p>
          : <p className="text-sm text-slate-500">Aún no tienes un medio de pago guardado.</p>}
        <p className="text-[11px] text-slate-400 mt-1">Los pagos se procesan con <span className="font-medium">{s.proveedor}</span> ({s.moneda}).</p>
      </div>

      {/* Pagar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-800 mb-1">Pagar mi suscripción</p>
        <p className="text-xs text-slate-500 mb-3">Genera un pago por {fmt(s.total)} ({s.moneda}). Puedes pagar una vez o dejar el cobro automático mensual.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => pagar(false)} disabled={pagando} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">{pagando ? 'Generando…' : 'Pagar ahora'}</button>
          <button onClick={() => pagar(true)} disabled={pagando} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-sm font-semibold rounded-xl">Activar cobro automático</button>
        </div>

        {err && <p className="text-rose-600 text-sm mt-3">{err}</p>}
        {res && res.estado === 'ok' && (
          <p className="text-emerald-700 text-sm mt-3">Se abrió el enlace de pago. Si no se abrió, <a href={res.url} target="_blank" rel="noopener noreferrer" className="underline font-medium">haz clic aquí</a>.</p>
        )}
        {res && res.estado !== 'ok' && (
          <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-3 py-2">
            {res.mensaje} Escríbenos y coordinamos el pago mientras tanto.
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-2"><dt className="text-slate-500">{k}</dt><dd className="text-slate-800">{v}</dd></div>
}
