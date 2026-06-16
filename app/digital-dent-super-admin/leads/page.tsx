export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getVertical } from '@/lib/verticales'

const RUBRO_BADGE: Record<string, string> = {
  dental: 'bg-cyan-500/15 text-cyan-300',
  medico: 'bg-blue-500/15 text-blue-300',
  estetica: 'bg-fuchsia-500/15 text-fuchsia-300',
}

export default async function LeadsPage() {
  const [leads, demosActivas] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.clinica.findMany({
      where: { esDemo: true },
      select: { id: true, slug: true, demoExpiraEn: true },
    }),
  ])

  const demoPorSlug = new Map(demosActivas.map((d) => [d.slug, d]))
  const ahora = Date.now()

  const fmtFecha = (d: Date) =>
    d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Leads / Demos</h1>
        <p className="text-slate-400 mt-1 text-sm">
          Prospectos que generaron una demo desde la landing. {leads.length} registro{leads.length === 1 ? '' : 's'} ·{' '}
          {demosActivas.length} demo{demosActivas.length === 1 ? '' : 's'} activa{demosActivas.length === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {leads.length === 0 ? (
          <p className="px-6 py-12 text-center text-slate-500 text-sm">Aún no hay leads. Cuando alguien pruebe la demo aparecerá acá.</p>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                  <th className="text-left px-6 py-3">Contacto</th>
                  <th className="text-left px-6 py-3">Negocio</th>
                  <th className="text-left px-6 py-3">Rubro</th>
                  <th className="text-left px-6 py-3">Demo</th>
                  <th className="text-right px-6 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {leads.map((l) => {
                  const demo = l.clinicaSlug ? demoPorSlug.get(l.clinicaSlug) : null
                  const activa = demo?.demoExpiraEn && demo.demoExpiraEn.getTime() > ahora
                  return (
                    <tr key={l.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-3">
                        <p className="text-white font-medium">{l.nombre}</p>
                        <a href={`mailto:${l.email}`} className="text-xs text-purple-300 hover:text-purple-200">{l.email}</a>
                        {l.telefono && (
                          <p className="text-xs text-slate-500">
                            <a href={`https://wa.me/${l.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-300">
                              {l.telefono}
                            </a>
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-300">{l.nombreClinica ?? '—'}</td>
                      <td className="px-6 py-3">
                        {l.rubro ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RUBRO_BADGE[l.rubro] ?? 'bg-slate-800 text-slate-300'}`}>
                            {getVertical(l.rubro).nombreCorto}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        {!l.clinicaSlug ? (
                          <span className="text-slate-600 text-xs">—</span>
                        ) : activa && demo ? (
                          <Link href={`/c/${demo.slug}/login`} className="text-xs text-emerald-300 hover:text-emerald-200">
                            Activa ·{' '}
                            {Math.max(0, Math.ceil((demo.demoExpiraEn!.getTime() - ahora) / 86400000))}d restantes →
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">Expirada / eliminada</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-400 text-xs whitespace-nowrap">{fmtFecha(l.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
