'use client'

import { useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpArticle, type HelpCategory } from '@/lib/help-articles'
import { cn } from '@/lib/utils'

const FUSE_OPTIONS = {
  keys: [
    { name: 'title',    weight: 0.55 },
    { name: 'keywords', weight: 0.35 },
    { name: 'body',     weight: 0.10 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

export function AyudaClient() {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<HelpCategory | 'all'>('all')
  const [selected, setSelected] = useState<HelpArticle | null>(null)

  const fuse = useMemo(() => new Fuse(HELP_ARTICLES, FUSE_OPTIONS), [])

  const filtrados = useMemo(() => {
    if (query.trim().length >= 2) {
      const res = fuse.search(query.trim()).map((r) => r.item)
      if (activeCategory === 'all') return res
      return res.filter((a) => a.category === activeCategory)
    }
    if (activeCategory === 'all') return HELP_ARTICLES
    return HELP_ARTICLES.filter((a) => a.category === activeCategory)
  }, [query, activeCategory, fuse])

  const articlesByCategory = useMemo(() => {
    const map = new Map<HelpCategory, HelpArticle[]>()
    for (const a of filtrados) {
      const list = map.get(a.category) ?? []
      list.push(a)
      map.set(a.category, list)
    }
    return map
  }, [filtrados])

  if (selected) {
    return <ArticleDetail article={selected} onBack={() => setSelected(null)} onSelect={setSelected} />
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Centro de ayuda</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manual completo de la plataforma. Buscá tu duda o navegá por categoría.
        </p>
      </div>

      {/* Buscador grande */}
      <div className="relative mb-6">
        <svg className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá: cómo crear una cita, abrir caja, conectar Google…"
          autoFocus
          className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-cyan-500 shadow-sm"
        />
      </div>

      {/* Filtros por categoría */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button onClick={() => setActiveCategory('all')}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            activeCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-cyan-400')}>
          Todos ({HELP_ARTICLES.length})
        </button>
        {HELP_CATEGORIES.map((c) => {
          const count = HELP_ARTICLES.filter((a) => a.category === c.id).length
          return (
            <button key={c.id} onClick={() => setActiveCategory(c.id)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
                activeCategory === c.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-cyan-400')}>
              <span>{c.emoji}</span>{c.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Resultados */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm mb-2">No encontramos artículos para esa búsqueda 😕</p>
          <p className="text-xs text-slate-400 mb-6">Intentá con otra palabra o contactá soporte.</p>
          <a href="mailto:soporte@clariva.cl?subject=Consulta%20plataforma"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Contactar soporte
          </a>
        </div>
      ) : query.trim().length >= 2 ? (
        // Resultados de búsqueda: lista plana
        <div className="space-y-2">
          {filtrados.map((a) => <ArticleRow key={a.id} article={a} onClick={() => setSelected(a)} />)}
        </div>
      ) : (
        // Browse por categoría
        <div className="space-y-8">
          {HELP_CATEGORIES.map((c) => {
            const list = articlesByCategory.get(c.id)
            if (!list || list.length === 0) return null
            return (
              <section key={c.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{c.emoji}</span>
                  <div>
                    <h2 className="font-semibold text-slate-900">{c.label}</h2>
                    <p className="text-xs text-slate-400">{c.description}</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-2">
                  {list.map((a) => <ArticleRow key={a.id} article={a} onClick={() => setSelected(a)} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ArticleRow({ article, onClick }: { article: HelpArticle; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-cyan-400 hover:shadow-sm transition-all">
      <p className="text-sm font-semibold text-slate-900">{article.title}</p>
      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
        {article.body.trim().slice(0, 130)}…
      </p>
    </button>
  )
}

function ArticleDetail({
  article, onBack, onSelect,
}: {
  article: HelpArticle
  onBack: () => void
  onSelect: (a: HelpArticle) => void
}) {
  const related = (article.relatedIds ?? [])
    .map((id) => HELP_ARTICLES.find((a) => a.id === id))
    .filter((a): a is HelpArticle => Boolean(a))

  const category = HELP_CATEGORIES.find((c) => c.id === article.category)

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button onClick={onBack}
        className="text-xs text-cyan-600 hover:underline mb-4 inline-flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Volver al centro de ayuda
      </button>

      {category && (
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-2">
          {category.emoji} {category.label}
        </p>
      )}
      <h1 className="text-2xl font-bold text-slate-900 mb-6">{article.title}</h1>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <ArticleBody body={article.body} />
      </div>

      {related.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold mb-3">Ver también</p>
          <div className="space-y-2">
            {related.map((r) => (
              <button key={r.id} onClick={() => onSelect(r)}
                className="text-left w-full p-3 bg-white border border-slate-200 rounded-xl hover:border-cyan-400 transition-all">
                <p className="text-sm font-semibold text-cyan-700">{r.title} →</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
        <p className="text-xs text-slate-500 mb-2">¿Esto no resuelve tu duda?</p>
        <a href="mailto:soporte@clariva.cl?subject=Consulta%20plataforma"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-700 hover:text-cyan-800">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          Contactar soporte
        </a>
      </div>
    </div>
  )
}

function ArticleBody({ body }: { body: string }) {
  const lines = body.trim().split('\n')
  const blocks: { kind: 'p' | 'li' | 'h2' | 'space'; content: string; index?: number }[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { blocks.push({ kind: 'space', content: '' }); continue }
    if (line.startsWith('## ')) { blocks.push({ kind: 'h2', content: line.slice(3) }); continue }
    const numMatch = line.match(/^(\d+)\.\s+(.*)$/)
    if (numMatch) { blocks.push({ kind: 'li', content: numMatch[2], index: Number(numMatch[1]) }); continue }
    if (line.startsWith('- ')) { blocks.push({ kind: 'li', content: line.slice(2) }); continue }
    blocks.push({ kind: 'p', content: line })
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {blocks.map((b, i) => {
        if (b.kind === 'space') return null
        if (b.kind === 'h2') {
          return <h3 key={i} className="text-base font-semibold text-slate-900 mt-3">{b.content}</h3>
        }
        if (b.kind === 'li') {
          return (
            <div key={i} className="flex gap-2.5 pl-1">
              <span className="text-cyan-600 font-semibold flex-shrink-0 min-w-[1rem]">
                {b.index ? `${b.index}.` : '•'}
              </span>
              <span dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />
            </div>
          )
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />
      })}
    </div>
  )
}

function renderInline(s: string): string {
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-cyan-700 underline" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-slate-100 rounded text-[12px] font-mono text-cyan-700">$1</code>')
}
