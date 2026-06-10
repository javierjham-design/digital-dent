'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Fuse from 'fuse.js'
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpArticle } from '@/lib/help-articles'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
//  Widget flotante de ayuda
// ─────────────────────────────────────────────────────────────────────────────
//
//  Botón flotante abajo a la derecha, presente en todo el dashboard. Abre un
//  panel con buscador (Fuse.js sobre los artículos del manual) + resultados.
//  Sin LLM, sin costos por token. Solo busca y muestra texto pre-escrito.
//
//  Si el usuario no encuentra respuesta, ofrece contactar soporte.

const SUGERENCIAS_RAPIDAS = [
  '¿Cómo abro una caja?',
  '¿Cómo creo una cita?',
  '¿Cómo conecto Google Calendar?',
  '¿Cómo genero una liquidación?',
  '¿Cómo registro un cobro?',
  '¿Olvidé mi contraseña?',
]

// Configuración de Fuse: peso mayor a título y keywords; body es contenido pero
// el matching de palabras clave es lo que más importa para preguntas cortas.
const FUSE_OPTIONS = {
  keys: [
    { name: 'title',    weight: 0.55 },
    { name: 'keywords', weight: 0.35 },
    { name: 'body',     weight: 0.10 },
  ],
  threshold: 0.4,        // 0 = match exacto; 1 = match cualquier cosa. 0.4 es buen balance.
  ignoreLocation: true,  // No importa dónde matchea en el texto.
  minMatchCharLength: 2,
}

interface ChatItem {
  id: string
  kind: 'user' | 'bot'
  text?: string
  article?: HelpArticle
  related?: HelpArticle[]
  unresolved?: boolean
}

export function HelpWidget() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<ChatItem[]>([])
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fuse = useMemo(() => new Fuse(HELP_ARTICLES, FUSE_OPTIONS), [])

  // Auto-scroll al final cuando llega mensaje nuevo.
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [items, selectedArticle])

  // Foco al input cuando se abre.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  function handleSearch(q: string) {
    const text = q.trim()
    if (!text) return
    setQuery('')
    setSelectedArticle(null)

    const userItem: ChatItem = { id: `u-${Date.now()}`, kind: 'user', text }

    const results = fuse.search(text, { limit: 4 })
    if (results.length === 0) {
      setItems((prev) => [
        ...prev,
        userItem,
        { id: `b-${Date.now()}`, kind: 'bot', unresolved: true },
      ])
      return
    }

    const best = results[0].item
    const others = results.slice(1).map((r) => r.item)
    // Resolvemos los relatedIds del artículo principal a artículos reales.
    const relatedById = best.relatedIds
      ?.map((id) => HELP_ARTICLES.find((a) => a.id === id))
      .filter((a): a is HelpArticle => Boolean(a)) ?? []
    // Mezclamos hasta 3 relacionados o sugerencias del buscador (sin duplicar el best).
    const seen = new Set<string>([best.id])
    const related: HelpArticle[] = []
    for (const a of [...relatedById, ...others]) {
      if (seen.has(a.id) || related.length >= 3) continue
      seen.add(a.id)
      related.push(a)
    }

    setItems((prev) => [
      ...prev,
      userItem,
      {
        id: `b-${Date.now()}`,
        kind: 'bot',
        article: best,
        related,
      },
    ])
  }

  function reset() {
    setItems([])
    setQuery('')
    setSelectedArticle(null)
    inputRef.current?.focus()
  }

  function openArticle(article: HelpArticle) {
    setSelectedArticle(article)
  }

  function backToChat() {
    setSelectedArticle(null)
  }

  return (
    <>
      {/* Botón flotante. Visible siempre. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Cerrar ayuda' : 'Abrir ayuda'}
        className={cn(
          'fixed bottom-5 right-5 z-50 w-13 h-13 rounded-full shadow-lg transition-all flex items-center justify-center',
          'bg-cyan-600 hover:bg-cyan-700 text-white',
          open && 'rotate-90',
        )}
        style={{ width: 52, height: 52 }}
      >
        {open ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
        )}
      </button>

      {/* Panel flotante */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2rem))] h-[min(620px,calc(100vh-7rem))] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-cyan-600 to-teal-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="text-white font-semibold text-sm">Centro de ayuda</p>
              <p className="text-cyan-100 text-[11px]">Hola 👋 ¿En qué te ayudo?</p>
            </div>
            <div className="flex items-center gap-1">
              {items.length > 0 && (
                <button onClick={reset} title="Empezar de nuevo"
                  className="text-cyan-100 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              )}
              <Link href="/ayuda" onClick={() => setOpen(false)} title="Ver todo el manual"
                className="text-cyan-100 hover:text-white p-1.5 rounded-lg hover:bg-white/10">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </Link>
            </div>
          </div>

          {/* Body: o vista de artículo o chat */}
          {selectedArticle ? (
            <ArticleView article={selectedArticle} onBack={backToChat} onSelectRelated={openArticle} />
          ) : (
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50">
              {items.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">Buscá lo que necesitás o probá una de estas preguntas:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGERENCIAS_RAPIDAS.map((s) => (
                      <button key={s} onClick={() => handleSearch(s)}
                        className="text-[11px] px-2.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-cyan-400 hover:text-cyan-700 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-4">
                    ¿Querés ver el manual completo? Tocá el ícono de flecha →
                  </p>
                </div>
              ) : (
                items.map((it) => (
                  <ChatBubble key={it.id} item={it} onSelectArticle={openArticle} />
                ))
              )}
            </div>
          )}

          {/* Input fijo abajo (solo cuando no estás viendo un artículo) */}
          {!selectedArticle && (
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch(query) }}
              className="border-t border-slate-200 p-3 bg-white flex-shrink-0"
            >
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Escribí tu pregunta…"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button type="submit" disabled={!query.trim()}
                  className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 text-white rounded-xl">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                Las respuestas vienen del manual. No accedo a tus datos ni modifico nada.
              </p>
            </form>
          )}
        </div>
      )}
    </>
  )
}

function ChatBubble({ item, onSelectArticle }: { item: ChatItem; onSelectArticle: (a: HelpArticle) => void }) {
  if (item.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-cyan-600 text-white px-3 py-2 rounded-2xl rounded-br-sm text-sm shadow-sm">
          {item.text}
        </div>
      </div>
    )
  }

  if (item.unresolved) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-3 shadow-sm space-y-2.5">
          <p className="text-sm text-slate-800">
            No encontré una respuesta específica en el manual 😕
          </p>
          <p className="text-xs text-slate-500">
            Podés intentar reformular la pregunta o contactar al soporte de Cláriva.
          </p>
          <a href="mailto:soporte@clariva.cl?subject=Consulta%20plataforma"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-700 hover:text-cyan-800">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Contactar soporte
          </a>
        </div>
      </div>
    )
  }

  if (item.article) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] bg-white border border-slate-200 rounded-2xl rounded-bl-sm p-3 shadow-sm space-y-2">
          <button onClick={() => onSelectArticle(item.article!)}
            className="text-left w-full">
            <p className="text-sm font-semibold text-slate-900 hover:text-cyan-700 transition-colors">
              {item.article.title}
            </p>
            <p className="text-xs text-slate-500 mt-1 line-clamp-3 whitespace-pre-wrap">
              {item.article.body.trim().slice(0, 140)}…
            </p>
            <p className="text-[11px] text-cyan-700 mt-1.5 font-medium">Ver respuesta completa →</p>
          </button>

          {item.related && item.related.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">Ver también</p>
              <div className="space-y-1">
                {item.related.map((r) => (
                  <button key={r.id} onClick={() => onSelectArticle(r)}
                    className="text-xs text-slate-600 hover:text-cyan-700 text-left block w-full truncate">
                    · {r.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

function ArticleView({
  article, onBack, onSelectRelated,
}: {
  article: HelpArticle
  onBack: () => void
  onSelectRelated: (a: HelpArticle) => void
}) {
  const related = (article.relatedIds ?? [])
    .map((id) => HELP_ARTICLES.find((a) => a.id === id))
    .filter((a): a is HelpArticle => Boolean(a))

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 sticky top-0 bg-white">
        <button onClick={onBack} title="Volver"
          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <p className="text-sm font-semibold text-slate-900 truncate">{article.title}</p>
      </div>
      <div className="px-4 py-4">
        <ArticleBody body={article.body} />

        {related.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">Ver también</p>
            <div className="space-y-1">
              {related.map((r) => (
                <button key={r.id} onClick={() => onSelectRelated(r)}
                  className="text-sm text-cyan-700 hover:text-cyan-800 hover:underline text-left block w-full">
                  → {r.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Render minimal de markdown: párrafos, listas numeradas, negritas, código inline.
// Suficiente para el formato de los artículos.
function ArticleBody({ body }: { body: string }) {
  const lines = body.trim().split('\n')
  const blocks: { kind: 'p' | 'li' | 'h2' | 'space'; content: string; index?: number }[] = []
  let liIndex = 0

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      blocks.push({ kind: 'space', content: '' })
      liIndex = 0
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'h2', content: line.slice(3) })
      continue
    }
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/)
    if (numMatch) {
      liIndex = Number(numMatch[1])
      blocks.push({ kind: 'li', content: numMatch[2], index: liIndex })
      continue
    }
    if (line.startsWith('- ')) {
      blocks.push({ kind: 'li', content: line.slice(2) })
      continue
    }
    blocks.push({ kind: 'p', content: line })
  }

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        if (b.kind === 'space') return null
        if (b.kind === 'h2') {
          return <h3 key={i} className="text-base font-semibold text-slate-900 mt-3">{b.content}</h3>
        }
        if (b.kind === 'li') {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-cyan-600 font-semibold flex-shrink-0">
                {b.index ? `${b.index}.` : '•'}
              </span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />
            </div>
          )
        }
        return (
          <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />
        )
      })}
    </div>
  )
}

// Render inline mini-markdown: **negrita**, `código`, [texto](url).
// Sanitizamos el input (sin HTML directo del usuario; los artículos son
// estáticos en código, así que el riesgo es solo accidental).
function renderInline(s: string): string {
  // Escapar primero todo HTML del texto plano.
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-700 underline" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 rounded text-[12px] font-mono text-cyan-700">$1</code>')
}
