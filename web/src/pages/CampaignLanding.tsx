import { useState } from 'react'
import { appLoginUrl } from '@/lib/api'
import { Check, DemoModal } from '@/pages/Landing'
import type { Campaign } from '@/landings/registry'

// Plantilla de landing page de campaña. Enfocada en una sola conversión: la demo.
export function CampaignLanding({ campaign }: { campaign: Campaign }) {
  const [demoOpen, setDemoOpen] = useState(false)
  const cta = campaign.ctaTexto ?? 'Probar la demo gratis'

  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased">
      <header className="border-b border-slate-100">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-800 text-white font-bold flex items-center justify-center">C</div>
            <span className="text-lg font-bold tracking-tight">Cláriva</span>
          </a>
          <a href={appLoginUrl()} className="text-sm font-semibold text-slate-700 hover:text-slate-900">Iniciar sesión</a>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-cyan-50/70 via-white to-white" />
        <div className="max-w-3xl mx-auto px-5 pt-20 pb-16 text-center">
          {campaign.badge && (
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-semibold tracking-wide uppercase mb-5">
              <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />{campaign.badge}
            </span>
          )}
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.1] tracking-tight">
            {campaign.titulo}
            <span className="bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">{campaign.destacado}</span>
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed mt-5 max-w-xl mx-auto">{campaign.subtitulo}</p>
          <button onClick={() => setDemoOpen(true)} className="mt-8 px-7 py-3.5 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl shadow-lg shadow-cyan-600/20 transition-all hover:-translate-y-0.5">{cta} →</button>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-5 pb-20">
        <ul className="grid sm:grid-cols-2 gap-4">
          {campaign.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <Check /><span className="text-slate-700">{b}</span>
            </li>
          ))}
        </ul>
        <div className="text-center mt-10">
          <button onClick={() => setDemoOpen(true)} className="px-7 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors">{cta} →</button>
          <p className="text-xs text-slate-400 mt-3">La demo es gratuita y se elimina automáticamente a los 7 días.</p>
        </div>
      </section>

      <footer className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-5 py-8 flex items-center justify-between text-sm text-slate-500">
          <span>Cláriva · {new Date().getFullYear()}</span>
          <a href="/" className="text-cyan-600 hover:text-cyan-700 font-medium">Ver todo Cláriva →</a>
        </div>
      </footer>

      {demoOpen && <DemoModal vertical={campaign.vertical} onClose={() => setDemoOpen(false)} />}
    </div>
  )
}
