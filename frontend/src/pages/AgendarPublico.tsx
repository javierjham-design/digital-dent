import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { publicAgenda, type PublicAgendaDTO, type ReservaResult } from '@/services/agenda-online.service'

const diaLabel = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`)
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function AgendarPublico() {
  const { slug = '', token = '' } = useParams()
  const [data, setData] = useState<PublicAgendaDTO | null>(null)
  const [dias, setDias] = useState<PublicAgendaDTO['dias']>([])
  const [doctorSel, setDoctorSel] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [diaSel, setDiaSel] = useState<string>('')
  const [slotSel, setSlotSel] = useState<{ inicio: string; hora: string } | null>(null)
  const [verCal, setVerCal] = useState(false)
  const [mesCal, setMesCal] = useState<{ y: number; m: number } | null>(null)
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', email: '', rut: '', motivo: '' })
  const [enviando, setEnviando] = useState(false)
  const [result, setResult] = useState<ReservaResult | null>(null)
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }))

  useEffect(() => {
    publicAgenda.obtener(slug, token)
      .then((d) => { setData(d); setDoctorSel(d.doctorId); setDias(d.dias); setDiaSel(d.dias[0]?.dia ?? '') })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
      .finally(() => setCargando(false))
  }, [slug, token])

  // Al cambiar de profesional, recarga la disponibilidad de ese profesional.
  function cambiarProfesional(id: string) {
    if (id === doctorSel) return
    setDoctorSel(id); setSlotSel(null); setDias([])
    publicAgenda.obtener(slug, token, id).then((d) => { setDias(d.dias); setDiaSel(d.dias[0]?.dia ?? '') }).catch(() => {})
  }

  async function reservar() {
    if (!slotSel) return
    if (!form.nombre.trim() || !form.apellido.trim() || form.telefono.replace(/\D/g, '').length < 8) {
      setError('Completa tu nombre, apellido y un teléfono válido.'); return
    }
    setEnviando(true); setError('')
    try {
      const r = await publicAgenda.reservar(slug, token, { inicio: slotSel.inicio, doctorId: doctorSel, ...form })
      setResult(r)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo reservar') } finally { setEnviando(false) }
  }

  if (cargando) return <Centro><p className="text-slate-500 text-sm">Cargando disponibilidad…</p></Centro>
  if (error && !data) return <Centro><p className="text-rose-600 text-sm text-center">{error}</p></Centro>
  if (!data) return null

  const { clinica, link } = data
  const profeSel = link.profesionales.find((p) => p.id === doctorSel)
  const diaActual = dias.find((d) => d.dia === diaSel)

  // Calendario "Ver más fechas": días con cupo resaltados; navegación acotada al rango disponible.
  const dispSet = new Set(dias.map((d) => d.dia))
  const ym = (s?: string) => { if (!s) return null; const [y, m] = s.split('-').map(Number); return { y, m: m - 1 } }
  const minYM = ym(dias[0]?.dia), maxYM = ym(dias[dias.length - 1]?.dia)
  const cmp = (a: { y: number; m: number }, b: { y: number; m: number }) => (a.y !== b.y ? a.y - b.y : a.m - b.m)
  const puedeAnterior = Boolean(mesCal && minYM && cmp(mesCal, minYM) > 0)
  const puedeSiguiente = Boolean(mesCal && maxYM && cmp(mesCal, maxYM) < 0)
  function abrirCal() {
    const base = ym(diaSel) ?? minYM
    if (base) setMesCal(base)
    setVerCal(true)
  }
  function moverMes(dir: -1 | 1) {
    setMesCal((p) => { if (!p) return p; let m = p.m + dir, y = p.y; if (m < 0) { m = 11; y-- } if (m > 11) { m = 0; y++ } return { y, m } })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Encabezado de la clínica */}
      <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 text-white">
        <div className="max-w-2xl mx-auto px-4 py-6 flex items-center gap-3">
          {clinica.logoUrl
            ? <img src={clinica.logoUrl} alt="" className="h-12 w-12 rounded-xl object-contain bg-white p-1" />
            : <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">{clinica.nombre.charAt(0)}</div>}
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{clinica.nombre}</h1>
            <p className="text-cyan-100 text-xs">{[clinica.direccion, clinica.ciudad].filter(Boolean).join(', ')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {result ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-3">✓</div>
            <h2 className="text-lg font-bold text-slate-900">¡Hora reservada!</h2>
            <p className="text-sm text-slate-600 mt-2">
              {new Date(result.inicio).toLocaleString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false })} h
              {result.profesional ? ` · ${result.profesional}` : ''}
            </p>
            <p className="text-sm text-slate-500 mt-1">{clinica.nombre}{clinica.telefono ? ` · ${clinica.telefono}` : ''}</p>
            {result.mensaje && <p className="text-sm text-slate-700 mt-4 bg-slate-50 rounded-xl px-4 py-3">{result.mensaje}</p>}
            <p className="text-xs text-slate-400 mt-4">Te contactaremos para confirmar. Si necesitas cambiarla, escríbenos.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4">
              <h2 className="font-bold text-slate-900">{link.nombre}</h2>
              <p className="text-sm text-slate-500">
                {link.profesionales.length > 1 ? `${link.profesionales.length} profesionales` : (profeSel?.nombre ?? '')}
                {link.profesionales.length === 1 && profeSel?.especialidad ? ` · ${profeSel.especialidad}` : ''} · {link.duracionMin} min
              </p>
              {link.descripcion && <p className="text-sm text-slate-600 mt-2">{link.descripcion}</p>}
            </div>

            {link.profesionales.length > 1 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">Elige profesional</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {link.profesionales.map((p) => (
                    <button key={p.id} onClick={() => cambiarProfesional(p.id)}
                      className={`shrink-0 px-3 py-2 rounded-xl text-sm border ${doctorSel === p.id ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                      {p.nombre}{p.especialidad ? <span className="opacity-70"> · {p.especialidad}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {dias.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
                No hay horarios disponibles por ahora. Vuelve a intentarlo más tarde o contáctanos.
              </div>
            ) : (
              <>
                {/* 1) Día */}
                <p className="text-sm font-semibold text-slate-700 mb-2">1. Elige el día</p>
                {!verCal && (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                    {dias.map((d) => (
                      <button key={d.dia} onClick={() => { setDiaSel(d.dia); setSlotSel(null) }}
                        className={`shrink-0 px-3 py-2 rounded-xl text-sm border ${diaSel === d.dia ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                        <span className="capitalize">{diaLabel(d.dia)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {verCal && mesCal && (
                  <MiniCalendario y={mesCal.y} m={mesCal.m} disponibles={dispSet} sel={diaSel}
                    puedeAnterior={puedeAnterior} puedeSiguiente={puedeSiguiente} onMes={moverMes}
                    onPick={(ymd) => { setDiaSel(ymd); setSlotSel(null) }} />
                )}
                <button onClick={() => (verCal ? setVerCal(false) : abrirCal())} className="text-sm font-semibold text-cyan-700 mb-4">
                  {verCal ? '‹ Ver menos' : '📅 Ver más fechas'}
                </button>

                {/* 2) Hora */}
                <p className="text-sm font-semibold text-slate-700 mb-2">2. Elige la hora</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-5">
                  {(diaActual?.slots ?? []).map((s) => (
                    <button key={s.inicio} onClick={() => setSlotSel(s)}
                      className={`px-2 py-2 rounded-xl text-sm font-mono border ${slotSel?.inicio === s.inicio ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-cyan-400'}`}>
                      {s.hora}
                    </button>
                  ))}
                  {diaActual && diaActual.slots.length === 0 && <p className="col-span-full text-sm text-slate-400">Sin cupos este día.</p>}
                </div>

                {/* 3) Datos */}
                {slotSel && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-3">3. Tus datos</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <input value={form.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Nombre *" className={inp} />
                      <input value={form.apellido} onChange={(e) => set({ apellido: e.target.value })} placeholder="Apellido *" className={inp} />
                      <input value={form.telefono} onChange={(e) => set({ telefono: e.target.value })} placeholder="Teléfono *" inputMode="tel" className={inp} />
                      <input value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email (opcional)" inputMode="email" className={inp} />
                      <input value={form.rut} onChange={(e) => set({ rut: e.target.value })} placeholder="RUT (opcional)" className={inp} />
                      <input value={form.motivo} onChange={(e) => set({ motivo: e.target.value })} placeholder="Motivo (opcional)" className={inp} />
                    </div>
                    {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
                    <button onClick={reservar} disabled={enviando} className="w-full mt-4 px-4 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">
                      {enviando ? 'Reservando…' : `Reservar ${slotSel.hora} h`}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <p className="text-center text-[11px] text-slate-400 mt-6">Agendamiento online de {clinica.nombre} · vía Cláriva</p>
      </div>
    </div>
  )
}

// Calendario mensual: resalta los días con cupo, deshabilita el resto. La
// navegación entre meses está acotada al rango con disponibilidad.
function MiniCalendario({ y, m, disponibles, sel, puedeAnterior, puedeSiguiente, onMes, onPick }: {
  y: number; m: number; disponibles: Set<string>; sel: string
  puedeAnterior: boolean; puedeSiguiente: boolean; onMes: (dir: -1 | 1) => void; onPick: (ymd: string) => void
}) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const primero = new Date(y, m, 1)
  const offset = primero.getDay() // 0=domingo
  const total = new Date(y, m + 1, 0).getDate()
  const nombreMes = primero.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  const celdas: (string | null)[] = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= total; d++) celdas.push(`${y}-${pad(m + 1)}-${pad(d)}`)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <button disabled={!puedeAnterior} onClick={() => onMes(-1)} className="w-8 h-8 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50">‹</button>
        <span className="text-sm font-semibold text-slate-700 capitalize">{nombreMes}</span>
        <button disabled={!puedeSiguiente} onClick={() => onMes(1)} className="w-8 h-8 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-50">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
        {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((ymd, i) => {
          if (!ymd) return <span key={i} />
          const disp = disponibles.has(ymd)
          const on = sel === ymd
          return (
            <button key={i} disabled={!disp} onClick={() => onPick(ymd)}
              className={`h-9 rounded-lg text-sm ${on ? 'bg-cyan-600 text-white font-semibold' : disp ? 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100' : 'text-slate-300 cursor-default'}`}>
              {Number(ymd.split('-')[2])}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Los días con cupo aparecen resaltados.</p>
    </div>
  )
}

const inp = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500'
function Centro({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">{children}</div>
}
