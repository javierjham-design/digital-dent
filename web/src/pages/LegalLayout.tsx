import type { ReactNode } from 'react'

// Chrome compartido de las páginas legales (Privacidad / Términos): mismo header y
// footer que el landing, con un contenedor de lectura para el texto.
export function LegalLayout({ title, actualizado, children }: { title: string; actualizado: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900 antialiased flex flex-col">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center">
            <img src="/logo.png" alt="Cláriva" className="h-8 w-auto" />
          </a>
          <a href="/" className="text-sm font-medium text-cyan-600 hover:text-cyan-700">← Volver al inicio</a>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-5 py-12 w-full">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 mt-2">Última actualización: {actualizado}</p>
        <div className="mt-8 space-y-6">{children}</div>
      </main>

      <footer className="border-t border-slate-100 bg-white">
        <div className="max-w-3xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/icon.png" alt="Cláriva" className="w-7 h-7 rounded-lg" />
            <span className="font-bold">Cláriva</span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-slate-500">
            <a href="/privacidad" className="hover:text-slate-900">Privacidad</a>
            <a href="/terminos" className="hover:text-slate-900">Términos</a>
            <a href="mailto:soporte@clariva.cl" className="text-cyan-600 hover:text-cyan-700 font-medium">soporte@clariva.cl</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}

// Helpers de tipografía para el cuerpo legal (sin depender de @tailwindcss/typography).
export function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-bold text-slate-900 mt-10 mb-3">{children}</h2>
}
export function P({ children }: { children: ReactNode }) {
  return <p className="text-slate-600 leading-relaxed">{children}</p>
}
export function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-6 space-y-1.5 text-slate-600 leading-relaxed">{children}</ul>
}
