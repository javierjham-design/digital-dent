import { useMemo, useState } from 'react'
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpArticle, type HelpCategory } from '@/data/help-articles'
import { ArticleBody } from '@/components/HelpWidget'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function Ayuda() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<HelpCategory | 'all'>('all')
  const [sel, setSel] = useState<HelpArticle | null>(null)

  const filtrados = useMemo(() => {
    const needle = norm(q.trim())
    return HELP_ARTICLES.filter((a) => {
      if (cat !== 'all' && a.category !== cat) return false
      if (!needle) return true
      return norm(`${a.title} ${a.keywords.join(' ')} ${a.body}`).includes(needle)
    })
  }, [q, cat])

  const catInfo = (id: HelpCategory) => HELP_CATEGORIES.find((c) => c.id === id)

  if (sel) {
    const info = catInfo(sel.category)
    const related = (sel.relatedIds ?? []).map((id) => HELP_ARTICLES.find((a) => a.id === id)).filter((a): a is HelpArticle => Boolean(a))
    return (
      <div className="max-w-3xl">
        <button onClick={() => setSel(null)} className="text-sm text-cyan-600 hover:underline">← Volver al centro de ayuda</button>
        <article className="mt-4 bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-xs uppercase tracking-wider text-cyan-600 font-semibold">{info?.emoji} {info?.label}</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 mb-4">{sel.title}</h1>
          <ArticleBody body={sel.body} />
          {related.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">Ver también</p>
              <div className="space-y-1">
                {related.map((r) => (
                  <button key={r.id} onClick={() => setSel(r)} className="text-sm text-cyan-700 hover:text-cyan-800 hover:underline text-left block w-full">→ {r.title}</button>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">Centro de ayuda</h1>
      <p className="text-slate-500 text-sm mt-1 mb-5">Guías y respuestas a las dudas más comunes. Busca tu duda o navega por categoría. También tienes el chat de ayuda flotante abajo a la derecha.</p>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ayuda… (ej: configurar agenda, abrir caja)"
        className="w-full max-w-lg mb-4 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />

      <div className="flex flex-wrap gap-2 mb-5">
        <Chip activo={cat === 'all'} onClick={() => setCat('all')}>Todas</Chip>
        {HELP_CATEGORIES.map((c) => <Chip key={c.id} activo={cat === c.id} onClick={() => setCat(c.id)}>{c.emoji} {c.label}</Chip>)}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {filtrados.map((a) => {
          const info = catInfo(a.category)
          return (
            <button key={a.id} onClick={() => setSel(a)} className="text-left bg-white rounded-2xl border border-slate-200 hover:border-cyan-300 p-4 transition-colors">
              <p className="text-xs uppercase tracking-wider text-cyan-600 font-semibold">{info?.emoji} {info?.label}</p>
              <p className="font-semibold text-slate-800 mt-0.5">{a.title}</p>
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{a.body.trim().slice(0, 120)}…</p>
            </button>
          )
        })}
        {filtrados.length === 0 && <p className="text-sm text-slate-500">No se encontraron artículos para "{q}".</p>}
      </div>
    </div>
  )
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activo ? 'bg-cyan-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
      {children}
    </button>
  )
}
