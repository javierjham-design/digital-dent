export const dynamic = 'force-dynamic'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/50 to-teal-50/50">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-900 tracking-tight">Cláriva</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-semibold mb-6 tracking-wider uppercase">
            <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
            Próximamente
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6 tracking-tight">
            Gestión dental<br />
            <span className="bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">
              inteligente y simple
            </span>
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed mb-10">
            Agenda, fichas clínicas, presupuestos, cobros y liquidaciones —
            todo en un solo lugar, diseñado para clínicas dentales modernas.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:contacto@plataforma-dental.cl"
              className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors"
            >
              Solicitar demo
            </a>
            <a
              href="#caracteristicas"
              className="px-6 py-3 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold rounded-xl transition-colors"
            >
              Ver características
            </a>
          </div>
        </div>

        <div id="caracteristicas" className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24">
          <Feature
            title="Agenda inteligente"
            desc="Calendario por doctor, confirmaciones por WhatsApp, gestión de salas y bloqueos."
            icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
          <Feature
            title="Ficha clínica completa"
            desc="Odontograma interactivo, historial médico, alertas y planes de tratamiento."
            icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
          <Feature
            title="Cobros y liquidaciones"
            desc="Cobros con comisiones, medios de pago configurables y liquidación automática a doctores."
            icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8 text-center">
          <p className="text-xs text-slate-500">
            Cláriva © {new Date().getFullYear()} — Multi-tenant para clínicas dentales
          </p>
        </div>
      </footer>
    </div>
  )
}

function Feature({ title, desc, icon }: { title: string; desc: string; icon: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center mb-4">
        <svg className="w-5 h-5 text-cyan-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <h3 className="font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
    </div>
  )
}
