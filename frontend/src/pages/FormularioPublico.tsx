import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicCrm, type PublicFormDTO } from '@/services/crm.service'
import { initPixel, trackPixel, fbCookies, trackingParams, genEventId, captureTracking } from '@/lib/pixel'

export function FormularioPublico() {
  const { slug = '', token = '' } = useParams()
  const [data, setData] = useState<PublicFormDTO | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', email: '', motivo: '' })
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  useEffect(() => {
    captureTracking() // fija la primera visita + persiste UTM/click-ids apenas carga
    publicCrm.form(slug, token)
      .then((d) => { setData(d); if (d.pixelId) initPixel(d.pixelId) })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
      .finally(() => setCargando(false))
  }, [slug, token])

  async function enviar() {
    if (!form.nombre.trim() || form.telefono.replace(/\D/g, '').length < 8) { setError('Completa tu nombre y un teléfono válido.'); return }
    setEnviando(true); setError('')
    const eventId = genEventId()
    const fb = fbCookies()
    try {
      // Pixel (navegador) + intake (server-side, con el mismo event_id para dedup).
      if (data?.pixelId) trackPixel('Lead', { content_name: form.motivo || undefined }, eventId)
      await publicCrm.enviar(slug, token, { ...form, ...trackingParams(), fbp: fb.fbp, fbc: fb.fbc, eventId })
      setOk(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar') } finally { setEnviando(false) }
  }

  if (cargando) return <Centro><p className="text-slate-500 text-sm">Cargando…</p></Centro>
  if (error && !data) return <Centro><p className="text-rose-600 text-sm text-center">{error}</p></Centro>
  if (!data) return null
  const { clinica } = data

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white">
        <div className="max-w-lg mx-auto px-4 py-6 flex items-center gap-3">
          {clinica.logoUrl
            ? <img src={clinica.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain bg-white p-1" />
            : <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">{clinica.nombre.charAt(0)}</div>}
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{clinica.nombre}</h1>
            <p className="text-cyan-100 text-xs">{[clinica.direccion, clinica.ciudad].filter(Boolean).join(', ')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {ok ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-3">✓</div>
            <h2 className="text-lg font-bold text-slate-900">¡Gracias! Recibimos tus datos.</h2>
            <p className="text-sm text-slate-600 mt-2">Te vamos a contactar a la brevedad para coordinar.</p>
            <p className="text-sm text-slate-500 mt-1">{clinica.nombre}{clinica.telefono ? ` · ${clinica.telefono}` : ''}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-bold text-slate-900 mb-1">Déjanos tus datos</h2>
            <p className="text-sm text-slate-500 mb-4">Completa el formulario y te contactamos.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <input value={form.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Nombre *" className={inp} />
              <input value={form.apellido} onChange={(e) => set({ apellido: e.target.value })} placeholder="Apellido" className={inp} />
              <input value={form.telefono} onChange={(e) => set({ telefono: e.target.value })} placeholder="Teléfono *" inputMode="tel" className={inp} />
              <input value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email" inputMode="email" className={inp} />
              <input value={form.motivo} onChange={(e) => set({ motivo: e.target.value })} placeholder="¿En qué te podemos ayudar?" className={`${inp} sm:col-span-2`} />
            </div>
            {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
            <button onClick={enviar} disabled={enviando} className="w-full mt-4 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        )}
        <p className="text-center text-[11px] text-slate-400 mt-6">{clinica.nombre} · vía Cláriva</p>
      </div>
    </div>
  )
}

const inp = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
function Centro({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">{children}</div>
}
