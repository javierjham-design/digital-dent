'use client'

import { useState } from 'react'

type Props = {
  slug: string
  platformDomain: string | null
  /** Si true, el Administrador todavía usa la contraseña por defecto. */
  passwordPendiente?: boolean
}

export function AccesoClinicaCard({ slug, platformDomain, passwordPendiente }: Props) {
  const [origin, setOrigin] = useState<string>('')
  if (typeof window !== 'undefined' && origin === '') setOrigin(window.location.origin)

  const urlPath = origin ? `${origin}/c/${slug}/login` : `/c/${slug}/login`
  const urlSubdomain = platformDomain ? `https://${slug}.${platformDomain}/login` : null

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 015.656 0l1.415 1.415a4 4 0 010 5.656l-3.535 3.535a4 4 0 01-5.657 0l-1.414-1.414M10.172 13.828a4 4 0 01-5.657 0L3.1 12.414a4 4 0 010-5.657L6.636 3.222a4 4 0 015.657 0l1.414 1.415" />
        </svg>
        Acceso de la clínica
      </h2>
      <p className="text-xs text-slate-500 mb-5">URL que debes entregar a la clínica para iniciar sesión.</p>

      <div className="space-y-4">
        {urlSubdomain && (
          <UrlRow
            label="URL final (con dominio)"
            badge="Recomendada"
            url={urlSubdomain}
          />
        )}
        <UrlRow
          label={urlSubdomain ? 'URL alternativa (path)' : 'URL de acceso'}
          badge={urlSubdomain ? undefined : 'Activa hoy'}
          url={urlPath}
        />
        {!urlSubdomain && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            ⚠️ Para activar la URL bonita con dominio propio, configura{' '}
            <code className="font-mono">PLATFORM_DOMAIN</code> en las variables de Railway. Ver{' '}
            <code className="font-mono">docs/DNS_SETUP.md</code>.
          </p>
        )}
      </div>

      {passwordPendiente && (
        <div className="mt-5 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl">
          <p className="text-sm font-medium text-cyan-200 mb-2">Credenciales iniciales</p>
          <p className="text-xs text-cyan-300/80 mb-3">
            El usuario Administrador todavía no ha cambiado la contraseña por defecto.
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-cyan-400/60 uppercase tracking-wider mb-1">Usuario</p>
              <code className="block px-3 py-2 bg-slate-950 border border-cyan-500/30 rounded font-mono text-white">Administrador</code>
            </div>
            <div>
              <p className="text-cyan-400/60 uppercase tracking-wider mb-1">Contraseña</p>
              <code className="block px-3 py-2 bg-slate-950 border border-cyan-500/30 rounded font-mono text-white">ADMIN22</code>
            </div>
          </div>
          <p className="text-xs text-cyan-300/60 mt-3">
            Se le pedirá cambiarla la primera vez que inicie sesión.
          </p>
        </div>
      )}
    </section>
  )
}

function UrlRow({ label, badge, url }: { label: string; badge?: string; url: string }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // ignorar
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-xs uppercase tracking-wider text-slate-500 font-medium">{label}</p>
        {badge && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 uppercase tracking-wider">
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white font-mono break-all">
          {url}
        </code>
        <button
          onClick={copiar}
          className="flex-shrink-0 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5"
          title="Copiar URL"
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              Copiar
            </>
          )}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 px-3 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-xs font-medium transition-colors flex items-center gap-1.5"
          title="Abrir en nueva pestaña"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Abrir
        </a>
      </div>
    </div>
  )
}
