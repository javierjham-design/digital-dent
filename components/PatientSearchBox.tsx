'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRUT } from '@/lib/utils'

interface Paciente {
  id: string
  nombre: string
  apellido: string
  rut: string | null
  telefono: string | null
  numero: number | null
}

export function PatientSearchBox({
  variant = 'desktop',
  onSelect,
}: {
  variant?: 'desktop' | 'mobile'
  onSelect?: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Paciente[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  // Autofocus al montar en mobile (cuando se abre el overlay)
  useEffect(() => {
    if (variant === 'mobile') inputRef.current?.focus()
  }, [variant])

  // Debounce + fetch
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pacientes/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        })
        if (!res.ok) { setResults([]); return }
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
        setActive(0)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  // Click fuera cierra el dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Shortcut "/" para enfocar (solo cuando no se está escribiendo en otro input)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key === '/' && variant === 'desktop') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant])

  function go(id: string) {
    setOpen(false)
    setQ('')
    setResults([])
    onSelect?.()
    router.push(`/pacientes/${id}`)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[active]
      if (target) go(target.id)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showDropdown = open && (q.trim().length >= 2)
  const widthClass = useMemo(
    () => variant === 'desktop' ? 'w-56 lg:w-72' : 'w-full',
    [variant],
  )

  return (
    <div ref={containerRef} className={`relative ${variant === 'desktop' ? 'hidden md:block' : 'block w-full'} flex-shrink-0`}>
      <div className="relative">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 110-16 8 8 0 010 16z" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar paciente por nombre o RUT…"
          aria-label="Buscar paciente"
          className={`pl-9 pr-12 py-1.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-300 ${widthClass}`}
        />
        {variant === 'desktop' && q.length === 0 && (
          <kbd className="hidden lg:inline absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 bg-white">/</kbd>
        )}
        {loading && q.length > 0 && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-cyan-500 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-80 overflow-y-auto z-50">
          {loading && results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 text-center">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 text-center">Sin coincidencias para “{q}”.</p>
          ) : (
            results.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => go(p.id)}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-2.5 border-b border-slate-100 last:border-0 transition-colors ${i === active ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold">
                    {(p.nombre[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{p.nombre} {p.apellido}</p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      {p.rut ? formatRUT(p.rut) : 'Sin RUT'}{p.telefono ? ` · ${p.telefono}` : ''}
                    </p>
                  </div>
                  {p.numero != null && (
                    <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">#{p.numero}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
