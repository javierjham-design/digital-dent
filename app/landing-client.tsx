'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'

type PlanLanding = {
  id: string
  nombre: string
  descripcion: string | null
  precioMensual: number
  precioAnual: number | null
  caracteristicas: string[]
  destacado: boolean
}

const fmtCLP = (n: number) =>
  '$' + new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(n)

// ─── Animación de aparición al hacer scroll ──────────────────────────────────
function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); obs.disconnect() } },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}>
      {children}
    </div>
  )
}

const FEATURES = [
  { t: 'Agenda inteligente', d: 'Vista semanal por profesional y diaria tipo planilla. Arrastra para reagendar, evita choques de horario y bloquea espacios.', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { t: 'Confirmación por WhatsApp', d: 'Recordatorios automáticos con botones. El paciente confirma o cancela y la cita se actualiza sola. Menos inasistencias.', icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
  { t: 'Ficha clínica y odontograma', d: 'Historial completo, odontograma interactivo, alertas médicas y evoluciones por paciente.', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { t: 'Presupuestos profesionales', d: 'Arma presupuestos por sección, imprímelos con tu logo y conviértelos en tratamientos con un clic.', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { t: 'Cobros y caja', d: 'Registra cobros con medios de pago y comisiones, abre y cierra caja, y controla el flujo diario.', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { t: 'Liquidaciones de profesionales', d: 'Calcula honorarios por profesional, período y comisión. Cada doctor ve solo lo suyo.', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { t: 'Sincronización con Google', d: 'Conecta el calendario de Google de tu clínica: la agenda se mantiene en ambos lados.', icon: 'M21 12.1H3M16 6l-4-4-4 4M8 18l4 4 4-4' },
  { t: 'Reportes y métricas', d: 'Ingresos, citas por estado, morosidad y rendimiento por profesional, en gráficos claros.', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { t: 'App instalable y segura', d: 'Funciona como app en el celular o el computador. Datos cifrados, accesos por rol y respaldos en la nube.', icon: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z' },
]

const PASOS = [
  { n: '1', t: 'Crea tu clínica', d: 'En minutos tienes tu espacio con tu equipo, horarios y catálogo de prestaciones.' },
  { n: '2', t: 'Carga tu agenda', d: 'Agenda pacientes, confirma por WhatsApp y lleva la ficha clínica de cada uno.' },
  { n: '3', t: 'Cobra y mide', d: 'Registra cobros, liquida a tus profesionales y revisa tus números en tiempo real.' },
]

const FAQS = [
  { q: '¿Necesito instalar algo?', a: 'No. Cláriva funciona desde el navegador y también puedes instalarla como app en tu celular o computador con un toque. No requiere servidores ni mantención de tu parte.' },
  { q: '¿Mis datos están seguros?', a: 'Sí. Los datos viajan cifrados (HTTPS), las credenciales sensibles se guardan encriptadas, hay control de acceso por rol y respaldos automáticos en la nube. Cada clínica está aislada de las demás.' },
  { q: '¿Puedo migrar mis pacientes?', a: 'Sí. Puedes importar tu base de pacientes desde Excel y partir con todo cargado. Te acompañamos en el proceso.' },
  { q: '¿Cómo funcionan las confirmaciones por WhatsApp?', a: 'Es un servicio adicional. Configuramos el envío automático de recordatorios con botones de Confirmar, Reagendar o Cancelar; la respuesta del paciente actualiza la cita sola. Se cobra aparte según el volumen de tu clínica.' },
  { q: '¿Hay permanencia o contrato forzoso?', a: 'No hay permanencia. El plan es mensual y puedes cambiarlo o cancelarlo cuando quieras.' },
]

const TESTIMONIOS = [
  { n: 'Dra. Carolina Méndez', r: 'Clínica dental, Temuco', t: 'Bajamos las inasistencias casi a la mitad con las confirmaciones automáticas. La recepción dejó de perder tiempo llamando uno por uno.' },
  { n: 'Dr. Rodrigo Salas', r: 'Centro odontológico, Valdivia', t: 'Tener la agenda, las fichas y los cobros en un mismo lugar nos ordenó por completo. Las liquidaciones que antes me tomaban un día ahora salen solas.' },
  { n: 'Javiera Torres', r: 'Administradora, Pucón', t: 'Lo instalamos en el celular y se siente como una app de verdad. Súper simple para todo el equipo, sin capacitaciones eternas.' },
]

export function LandingClient({ desde, planes }: { desde: number; planes: PlanLanding[] }) {
  const [anual, setAnual] = useState(false)
  const [faqAbierta, setFaqAbierta] = useState<number | null>(0)
  const [demoOpen, setDemoOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      {/* ── NAV ── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-800 text-white font-bold flex items-center justify-center">C</div>
            <span className="text-lg font-bold tracking-tight">Cláriva</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#funciones" className="hover:text-slate-900 transition-colors">Funciones</a>
            <a href="#como" className="hover:text-slate-900 transition-colors">Cómo funciona</a>
            <a href="#planes" className="hover:text-slate-900 transition-colors">Planes</a>
            <a href="#faq" className="hover:text-slate-900 transition-colors">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="/login" className="hidden sm:inline-flex px-3.5 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors">
              Iniciar sesión
            </a>
            <button onClick={() => setDemoOpen(true)}
              className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl shadow-sm transition-colors">
              Probar demo gratis
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-cyan-50/70 via-white to-white" />
        <div className="absolute top-20 -left-32 -z-10 w-96 h-96 bg-cyan-200/30 rounded-full blur-3xl" />
        <div className="absolute top-40 -right-24 -z-10 w-80 h-80 bg-teal-200/30 rounded-full blur-3xl" />
        <div className="max-w-6xl mx-auto px-5 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-semibold tracking-wide uppercase mb-5">
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
                Software dental · desde {fmtCLP(desde)}/mes
              </span>
            </Reveal>
            <Reveal delay={60}>
              <h1 className="text-4xl sm:text-5xl font-bold leading-[1.1] tracking-tight">
                La clínica dental que se{' '}
                <span className="bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">ordena sola</span>
              </h1>
            </Reveal>
            <Reveal delay={120}>
              <p className="text-lg text-slate-600 leading-relaxed mt-5 max-w-xl">
                Agenda, fichas clínicas, presupuestos, cobros y liquidaciones en un solo lugar —
                con confirmaciones automáticas por WhatsApp para que dejes de perder horas con inasistencias.
              </p>
            </Reveal>
            <Reveal delay={180}>
              <div className="flex flex-col sm:flex-row gap-3 mt-8">
                <button onClick={() => setDemoOpen(true)}
                  className="px-6 py-3.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl shadow-lg shadow-cyan-600/20 transition-all hover:-translate-y-0.5">
                  Probar la demo en vivo →
                </button>
                <a href="#planes"
                  className="px-6 py-3.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold rounded-xl transition-colors text-center">
                  Ver planes
                </a>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-7 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><Check /> Sin instalar nada</span>
                <span className="flex items-center gap-1.5"><Check /> Sin permanencia</span>
                <span className="flex items-center gap-1.5"><Check /> Datos cifrados</span>
              </div>
            </Reveal>
          </div>

          {/* Mockup de agenda */}
          <Reveal delay={200}>
            <AgendaMockup />
          </Reveal>
        </div>
      </section>

      {/* ── FUNCIONES ── */}
      <section id="funciones" className="max-w-6xl mx-auto px-5 py-20">
        <Reveal className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Todo lo que tu clínica necesita</h2>
          <p className="text-lg text-slate-600 mt-4">Una sola plataforma, pensada para el día a día de una clínica dental real.</p>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={(i % 3) * 80}>
              <div className="h-full bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md hover:border-cyan-200 transition-all">
                <div className="w-11 h-11 rounded-xl bg-cyan-50 flex items-center justify-center mb-4">
                  <svg className="w-5 h-5 text-cyan-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} />
                  </svg>
                </div>
                <h3 className="font-bold text-slate-900 mb-1.5">{f.t}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section id="como" className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Empieza en 3 pasos</h2>
            <p className="text-lg text-slate-600 mt-4">Sin instalaciones ni configuraciones eternas.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {PASOS.map((p, i) => (
              <Reveal key={p.n} delay={i * 100}>
                <div className="bg-white rounded-2xl p-7 border border-slate-100 h-full">
                  <div className="w-10 h-10 rounded-xl bg-cyan-600 text-white font-bold flex items-center justify-center mb-4">{p.n}</div>
                  <h3 className="font-bold text-lg text-slate-900 mb-2">{p.t}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{p.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANES ── */}
      <section id="planes" className="max-w-6xl mx-auto px-5 py-20">
        <Reveal className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Planes simples y transparentes</h2>
          <p className="text-lg text-slate-600 mt-4">Sin costos ocultos. Cambia o cancela cuando quieras.</p>
        </Reveal>

        <Reveal className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-sm font-medium ${!anual ? 'text-slate-900' : 'text-slate-400'}`}>Mensual</span>
          <button onClick={() => setAnual((v) => !v)}
            className="relative w-12 h-6 rounded-full bg-cyan-600 transition-colors"
            aria-label="Cambiar a facturación anual">
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${anual ? 'left-6' : 'left-0.5'}`} />
          </button>
          <span className={`text-sm font-medium ${anual ? 'text-slate-900' : 'text-slate-400'}`}>
            Anual <span className="text-cyan-600 font-semibold">(2 meses gratis)</span>
          </span>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {planes.map((p, i) => {
            const mensual = anual
              ? Math.round((p.precioAnual ?? p.precioMensual * 10) / 12)
              : p.precioMensual
            return (
              <Reveal key={p.id} delay={i * 80}>
                <div className={`relative rounded-2xl p-7 h-full flex flex-col ${p.destacado
                  ? 'bg-slate-900 text-white border-2 border-cyan-500 shadow-xl' : 'bg-white text-slate-900 border border-slate-200 shadow-sm'}`}>
                  {p.destacado && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 text-white text-xs font-bold rounded-full uppercase tracking-wide">
                      Más popular
                    </span>
                  )}
                  <h3 className={`font-bold text-lg ${p.destacado ? 'text-white' : 'text-slate-900'}`}>{p.nombre}</h3>
                  {p.descripcion && <p className={`text-sm mt-1 ${p.destacado ? 'text-slate-300' : 'text-slate-500'}`}>{p.descripcion}</p>}
                  <div className="mt-5 mb-1 flex items-end gap-1">
                    <span className="text-4xl font-bold tracking-tight">{fmtCLP(mensual)}</span>
                    <span className={`text-sm mb-1 ${p.destacado ? 'text-slate-400' : 'text-slate-500'}`}>/mes</span>
                  </div>
                  <p className={`text-xs ${p.destacado ? 'text-slate-400' : 'text-slate-400'}`}>
                    {anual ? 'facturado anual · IVA incl.' : 'facturación mensual · IVA incl.'}
                  </p>
                  <ul className="mt-6 space-y-2.5 flex-1">
                    {p.caracteristicas.map((c) => (
                      <li key={c} className="flex items-start gap-2 text-sm">
                        <Check className={p.destacado ? 'text-cyan-400' : 'text-cyan-600'} />
                        <span className={p.destacado ? 'text-slate-200' : 'text-slate-700'}>{c}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => setDemoOpen(true)}
                    className={`mt-7 w-full py-3 rounded-xl font-semibold transition-colors ${p.destacado
                      ? 'bg-cyan-500 hover:bg-cyan-400 text-white' : 'bg-cyan-600 hover:bg-cyan-700 text-white'}`}>
                    Probar gratis
                  </button>
                </div>
              </Reveal>
            )
          })}
        </div>

        <Reveal className="mt-8">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-3 max-w-3xl mx-auto">
            <svg className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" />
            </svg>
            <div>
              <p className="font-semibold text-emerald-900">Confirmaciones por WhatsApp — servicio adicional</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Recordatorios automáticos que confirman, reagendan o cancelan citas solas. Se cobra aparte según el volumen de tu clínica. Lo activamos cuando quieras.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── TESTIMONIOS ── */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <Reveal className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Clínicas que ya se ordenaron</h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIOS.map((t, i) => (
              <Reveal key={t.n} delay={i * 90}>
                <figure className="bg-white rounded-2xl p-7 border border-slate-100 h-full flex flex-col">
                  <div className="flex gap-0.5 mb-4 text-amber-400">
                    {Array.from({ length: 5 }).map((_, k) => (
                      <svg key={k} className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.36 4.18a1 1 0 00.95.69h4.4c.97 0 1.37 1.24.59 1.81l-3.56 2.59a1 1 0 00-.36 1.12l1.36 4.18c.3.92-.76 1.69-1.54 1.12l-3.56-2.59a1 1 0 00-1.18 0l-3.56 2.59c-.78.57-1.84-.2-1.54-1.12l1.36-4.18a1 1 0 00-.36-1.12L1.4 9.61c-.78-.57-.38-1.81.59-1.81h4.4a1 1 0 00.95-.69L9.05 2.93z" /></svg>
                    ))}
                  </div>
                  <blockquote className="text-slate-700 leading-relaxed flex-1">“{t.t}”</blockquote>
                  <figcaption className="mt-5 pt-4 border-t border-slate-100">
                    <p className="font-semibold text-slate-900 text-sm">{t.n}</p>
                    <p className="text-xs text-slate-500">{t.r}</p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">Testimonios ilustrativos — reemplazar por reseñas reales de clientes.</p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="max-w-3xl mx-auto px-5 py-20">
        <Reveal className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Preguntas frecuentes</h2>
        </Reveal>
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <button onClick={() => setFaqAbierta(faqAbierta === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="font-semibold text-slate-900">{f.q}</span>
                  <svg className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${faqAbierta === i ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {faqAbierta === i && (
                  <p className="px-5 pb-5 text-sm text-slate-600 leading-relaxed">{f.a}</p>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-600 to-teal-700 px-8 py-14 text-center">
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight relative">Pruébala con datos de ejemplo, ahora</h2>
            <p className="text-cyan-50 text-lg mt-4 max-w-xl mx-auto relative">
              Creamos una clínica de demostración con pacientes y citas ficticias para que la recorras sin compromiso.
            </p>
            <button onClick={() => setDemoOpen(true)}
              className="relative mt-8 px-7 py-3.5 bg-white text-cyan-700 font-bold rounded-xl shadow-lg hover:-translate-y-0.5 transition-all">
              Crear mi demo gratis →
            </button>
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-800 text-white font-bold text-sm flex items-center justify-center">C</div>
            <span className="font-bold">Cláriva</span>
          </div>
          <p className="text-sm text-slate-500">Gestión dental para clínicas modernas · {new Date().getFullYear()}</p>
          <a href="mailto:soporte@clariva.cl" className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">soporte@clariva.cl</a>
        </div>
      </footer>

      {demoOpen && <DemoModal onClose={() => setDemoOpen(false)} />}
    </div>
  )
}

function Check({ className = 'text-cyan-600' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 flex-shrink-0 ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

// Mockup decorativo de una agenda (no funcional, solo visual).
function AgendaMockup() {
  const rows = [
    { h: '09:30', n: 'Cristina Riffo', e: 'bg-cyan-100 text-cyan-700', s: 'Confirmada' },
    { h: '10:30', n: 'Juan Muñoz', e: 'bg-emerald-100 text-emerald-700', s: 'Atendida' },
    { h: '11:00', n: 'Sara Catalán', e: 'bg-violet-100 text-violet-700', s: 'En espera' },
    { h: '11:45', n: 'Carlos Vega', e: 'bg-amber-100 text-amber-700', s: 'Agendada' },
    { h: '12:30', n: 'José Vidal', e: 'bg-cyan-100 text-cyan-700', s: 'Confirmada' },
  ]
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-300/40 overflow-hidden rotate-1 hover:rotate-0 transition-transform duration-500">
      <div className="bg-slate-50 border-b border-slate-100 px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
        </div>
        <span className="text-xs font-semibold text-slate-500 ml-2">Agenda · Hoy</span>
      </div>
      <div className="divide-y divide-slate-50">
        {rows.map((r) => (
          <div key={r.h} className="flex items-center gap-3 px-4 py-3">
            <span className="font-mono text-xs font-bold text-slate-400 w-12">{r.h}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{r.n}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.e}`}>{r.s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Modal de generación de demo ─────────────────────────────────────────────
function DemoModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', nombreClinica: '' })
  const [estado, setEstado] = useState<'form' | 'creando' | 'listo' | 'error'>('form')
  const [error, setError] = useState('')
  const [cred, setCred] = useState<{ slug: string; loginUrl: string; usuario: string; password: string } | null>(null)

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    setEstado('creando'); setError('')
    try {
      const res = await fetch('/api/demo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'No se pudo crear la demo. Intenta nuevamente.')
        setEstado('error')
        return
      }
      setCred(data)
      setEstado('listo')
      // Intento de auto-login. Si funciona, entra directo; si no, queda la
      // tarjeta con credenciales como respaldo.
      try {
        const r = await signIn('credentials', {
          slug: data.slug, username: data.usuario, password: data.password, redirect: false,
        })
        if (r && !r.error) {
          window.location.href = `/c/${data.slug}/agenda`
        }
      } catch { /* respaldo: tarjeta con credenciales */ }
    } catch {
      setError('Hubo un problema de conexión. Intenta nuevamente.')
      setEstado('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {estado === 'listo' && cred ? (
          <div className="p-7 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900">¡Tu demo está lista!</h3>
            <p className="text-sm text-slate-600 mt-2">Te estamos llevando a tu clínica de prueba…</p>
            <div className="mt-5 bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-sm">
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold mb-2">Por si necesitas volver a entrar</p>
              <p className="text-slate-700">Usuario: <span className="font-mono font-semibold">{cred.usuario}</span></p>
              <p className="text-slate-700">Contraseña: <span className="font-mono font-semibold">{cred.password}</span></p>
            </div>
            <a href={`${cred.loginUrl}`}
              className="mt-5 inline-block w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl transition-colors">
              Entrar a la demo →
            </a>
          </div>
        ) : (
          <form onSubmit={crear} className="p-7">
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-xl font-bold text-slate-900">Probá Cláriva gratis</h3>
              <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 -mt-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-5">Creamos una clínica de demostración con pacientes y citas de ejemplo. Entras al instante.</p>

            <div className="space-y-3">
              <Field label="Tu nombre" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} placeholder="Dra. María Pérez" required />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="maria@clinica.cl" required />
              <Field label="Teléfono / WhatsApp" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} placeholder="+56 9 1234 5678" />
              <Field label="Nombre de tu clínica" value={form.nombreClinica} onChange={(v) => setForm({ ...form, nombreClinica: v })} placeholder="Clínica Dental Sonríe" required />
            </div>

            {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mt-4">{error}</p>}

            <button type="submit" disabled={estado === 'creando'}
              className="mt-5 w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
              {estado === 'creando' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" /></svg>
                  Creando tu clínica de prueba…
                </>
              ) : 'Crear mi demo →'}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-3">La demo es gratuita y se elimina automáticamente a los 7 días.</p>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label} {required && <span className="text-rose-500">*</span>}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required}
        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
    </label>
  )
}
