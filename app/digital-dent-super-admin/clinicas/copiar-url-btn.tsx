'use client'

import { useState } from 'react'

type Props = {
  slug: string
  platformDomain: string | null
}

export function CopiarUrlButton({ slug, platformDomain }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [open, setOpen] = useState(false)

  function urlPath(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/c/${slug}/login`
  }
  function urlSubdomain(): string | null {
    return platformDomain ? `https://${slug}.${platformDomain}/login` : null
  }

  async function copiar(url: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setOpen(false)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // ignorar
    }
  }

  const sub = urlSubdomain()

  // Si no hay dominio, un solo click copia la URL path.
  if (!sub) {
    return (
      <button
        onClick={(e) => copiar(urlPath(), e)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
        title="Copiar URL de acceso"
      >
        {copiado ? (
          <>
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copiado
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 015.656 0l1.415 1.415a4 4 0 010 5.656l-3.535 3.535a4 4 0 01-5.657 0l-1.414-1.414M10.172 13.828a4 4 0 01-5.657 0L3.1 12.414a4 4 0 010-5.657L6.636 3.222a4 4 0 015.657 0l1.414 1.415" />
            </svg>
            Copiar URL
          </>
        )}
      </button>
    )
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
      >
        {copiado ? (
          <>
            <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Copiado
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 015.656 0l1.415 1.415a4 4 0 010 5.656l-3.535 3.535a4 4 0 01-5.657 0l-1.414-1.414M10.172 13.828a4 4 0 01-5.657 0L3.1 12.414a4 4 0 010-5.657L6.636 3.222a4 4 0 015.657 0l1.414 1.415" />
            </svg>
            URL ▾
          </>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-20 py-1">
            <button
              onClick={(e) => copiar(sub, e)}
              className="w-full px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <p className="font-medium">URL final (dominio)</p>
              <p className="text-slate-500 font-mono truncate mt-0.5">{sub}</p>
            </button>
            <div className="border-t border-slate-800" />
            <button
              onClick={(e) => copiar(urlPath(), e)}
              className="w-full px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <p className="font-medium">URL alternativa (path)</p>
              <p className="text-slate-500 font-mono truncate mt-0.5">/c/{slug}/login</p>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
