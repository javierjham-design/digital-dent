import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { platformService, type PlanPublico } from '@/services/platform.service'
import { tokenStore } from '@/services/api'
import { captureTracking, trackingParams, initPixel } from '@/lib/pixel'

// WhatsApp de ventas de Cláriva (opcional, se configura por env). Si no está, se
// oculta el botón de WhatsApp y queda la demo como CTA principal.
const WHATSAPP_VENTAS = (import.meta.env.VITE_WHATSAPP_VENTAS as string | undefined) ?? ''
const LANDING_PIXEL = (import.meta.env.VITE_LANDING_PIXEL_ID as string | undefined) ?? ''

interface PaisLanding { code: string; nombre: string; bandera: string; ciudades: string }
const PAISES: Record<string, PaisLanding> = {
  cr: { code: 'CR', nombre: 'Costa Rica', bandera: '🇨🇷', ciudades: 'San José, Heredia, Alajuela y Cartago' },
  pa: { code: 'PA', nombre: 'Panamá', bandera: '🇵🇦', ciudades: 'Ciudad de Panamá, David y Colón' },
  co: { code: 'CO', nombre: 'Colombia', bandera: '🇨🇴', ciudades: 'Bogotá, Medellín, Cali y Barranquilla' },
}

const usd = (n: number) => `US$${n.toLocaleString('en-US')}`

const FEATURES: { icon: string; titulo: string; texto: string }[] = [
  { icon: '📅', titulo: 'Agenda inteligente', texto: 'Agenda por profesional, recordatorios por WhatsApp y reserva online para tus pacientes.' },
  { icon: '🦷', titulo: 'Ficha clínica y odontograma', texto: 'Historia clínica completa, odontograma interactivo, evoluciones y consentimientos firmados.' },
  { icon: '💳', titulo: 'Cobros y cajas', texto: 'Presupuestos, cobros, cajas por profesional y reportes claros de todo lo recaudado.' },
  { icon: '📈', titulo: 'CRM y campañas', texto: 'Captura y seguimiento de pacientes potenciales con métricas de tus anuncios.' },
  { icon: '🧑‍⚕️', titulo: 'Liquidaciones', texto: 'Cálculo automático de honorarios y liquidaciones por profesional, sin planillas.' },
  { icon: '🔒', titulo: 'Datos aislados y seguros', texto: 'Cada clínica con su propia base de datos. Tu información nunca se mezcla con otra.' },
]

export function Landing() {
  const { pais = '' } = useParams()
  const cfg = PAISES[pais.toLowerCase()]
  const [planes, setPlanes] = useState<PlanPublico[]>([])

  useEffect(() => {
    if (!cfg) return
    captureTracking()
    if (LANDING_PIXEL) initPixel(LANDING_PIXEL)
    document.title = `Cláriva — Software para clínicas dentales en ${cfg.nombre}`
    platformService.planes().then((r) => setPlanes(r.planes.filter((p) => p.precioMensualUSD > 0).sort((a, b) => a.orden - b.orden))).catch(() => {})
  }, [cfg])

  if (!cfg) return <Navigate to="/landing/cr" replace />

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  const waLink = WHATSAPP_VENTAS ? `https://wa.me/${WHATSAPP_VENTAS.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, me interesa Cláriva para mi clínica en ${cfg.nombre}.`)}` : null

  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white font-bold flex items-center justify-center">C</div>
            <span className="text-lg font-bold text-slate-900">Cláriva</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">Iniciar sesión</a>
            <button onClick={() => scrollTo('demo')} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Prueba gratis</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-14 pb-10 text-center">
        <span className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-cyan-50 text-cyan-700 mb-4">
          {cfg.bandera} Para clínicas dentales en {cfg.nombre}
        </span>
        <h1 className="text-3xl sm:text-5xl font-bold text-slate-900 leading-tight max-w-3xl mx-auto">
          El software que ordena y hace crecer tu clínica dental
        </h1>
        <p className="text-base sm:text-lg text-slate-500 mt-4 max-w-2xl mx-auto">
          Agenda, ficha clínica, cobros, liquidaciones y captación de pacientes en un solo lugar.
          Pensado para clínicas de {cfg.ciudades}. Precios en dólares, sin sorpresas.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-7">
          <button onClick={() => scrollTo('demo')} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl shadow-sm">Comenzar prueba gratis de 7 días</button>
          <button onClick={() => scrollTo('planes')} className="px-6 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl">Ver planes</button>
        </div>
        <p className="text-xs text-slate-400 mt-3">Sin tarjeta para la prueba · Configúrala en minutos</p>
      </section>

      {/* Features */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-14">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Todo lo que tu clínica necesita</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.titulo} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="font-semibold text-slate-900">{f.titulo}</p>
                <p className="text-sm text-slate-500 mt-1">{f.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planes (USD) */}
      <section id="planes" className="max-w-5xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-slate-900 text-center">Planes en dólares</h2>
        <p className="text-sm text-slate-500 text-center mt-2 mb-8">Cobro en USD para {cfg.nombre}. Cambia de plan o cancela cuando quieras.</p>
        {planes.length === 0 ? <p className="text-center text-slate-400 text-sm">Cargando planes…</p> : (
          <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {planes.map((p) => (
              <div key={p.id} className={`rounded-2xl border p-6 ${p.destacado ? 'border-cyan-500 ring-2 ring-cyan-100' : 'border-slate-200'}`}>
                {p.destacado && <span className="text-[11px] font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">Más elegido</span>}
                <p className="text-lg font-bold text-slate-900 mt-2">{p.nombre}</p>
                <p className="text-sm text-slate-500 mt-0.5">{p.descripcion}</p>
                <p className="mt-4"><span className="text-3xl font-bold text-slate-900">{usd(p.precioMensualUSD)}</span> <span className="text-slate-400 text-sm">/ mes</span></p>
                <p className="text-xs text-slate-400 mt-0.5">Hasta {p.maxProfesionales} profesionales</p>
                <ul className="mt-4 space-y-1.5">
                  {p.caracteristicas.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm text-slate-600"><span className="text-cyan-600 mt-0.5">✓</span> {c}</li>
                  ))}
                </ul>
                <button onClick={() => scrollTo('demo')} className={`mt-5 w-full py-2.5 rounded-xl text-sm font-semibold ${p.destacado ? 'bg-cyan-600 hover:bg-cyan-700 text-white' : 'border border-slate-200 hover:bg-slate-50 text-slate-700'}`}>Probar gratis</button>
              </div>
            ))}
          </div>
        )}
        <p className="text-center text-xs text-slate-400 mt-4">¿Más profesionales? Cada profesional adicional US$12/mes. Impuestos según tu país.</p>
      </section>

      {/* Demo CTA */}
      <section id="demo" className="bg-gradient-to-b from-cyan-600 to-cyan-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-14 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Prueba Cláriva gratis por 7 días</h2>
            <p className="text-cyan-100 mt-3">Creamos tu clínica de prueba al instante, con datos de ejemplo para que la explores. Sin tarjeta, sin compromiso.</p>
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-sm font-semibold">
                💬 ¿Prefieres hablar? Escríbenos por WhatsApp
              </a>
            )}
          </div>
          <DemoForm paisCode={cfg.code} />
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 py-10 text-center text-sm text-slate-400">
        <p>Cláriva — Software de gestión para clínicas dentales · {cfg.bandera} {cfg.nombre}</p>
        <p className="mt-1"><a href="/login" className="hover:text-slate-600">Iniciar sesión</a></p>
      </footer>
    </div>
  )
}

// Formulario de demo: crea la clínica de prueba y entra directo a la app.
function DemoForm({ paisCode }: { paisCode: string }) {
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', nombreClinica: '' })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))
  const puede = form.nombre.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) && form.nombreClinica.trim()

  async function crear() {
    if (!puede || enviando) return
    setEnviando(true); setError('')
    try {
      const res = await platformService.crearDemo({
        nombre: form.nombre.trim(), email: form.email.trim(), telefono: form.telefono.trim() || undefined,
        nombreClinica: form.nombreClinica.trim(), pais: paisCode, tracking: trackingParams(),
      })
      tokenStore.set(res.token)
      window.location.assign('/agenda')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la demo. Intenta de nuevo.')
      setEnviando(false)
    }
  }

  const inp = 'w-full px-3.5 py-2.5 rounded-xl text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-white'
  return (
    <div className="bg-white rounded-2xl p-6 shadow-lg">
      <p className="text-slate-900 font-semibold mb-3">Crea tu demo ahora</p>
      <div className="space-y-2.5">
        <input value={form.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Tu nombre *" className={inp} />
        <input value={form.nombreClinica} onChange={(e) => set({ nombreClinica: e.target.value })} placeholder="Nombre de tu clínica *" className={inp} />
        <input value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="Correo *" inputMode="email" className={inp} />
        <input value={form.telefono} onChange={(e) => set({ telefono: e.target.value })} placeholder="WhatsApp (opcional)" className={inp} />
      </div>
      {error && <p className="text-rose-600 text-xs mt-2">{error}</p>}
      <button onClick={crear} disabled={!puede || enviando} className="mt-3 w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-semibold rounded-xl">
        {enviando ? 'Creando tu clínica…' : 'Comenzar prueba gratis'}
      </button>
      <p className="text-[11px] text-slate-400 mt-2 text-center">Al continuar aceptas explorar una clínica de prueba de 7 días.</p>
    </div>
  )
}
