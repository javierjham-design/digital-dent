import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CITA_ESTADOS } from '@shared/constants/cita-estados'

// ─────────────────────────────────────────────────────────────────────────────
// VISTA PREVIA DE LA NUEVA AGENDA (solo diseño, datos de ejemplo).
// No toca la agenda real ni la base de datos. Mantiene los colores de estado
// reales y el verde para disponibles; gris para lo no disponible (almuerzo/fuera
// de horario). Las citas se muestran como una "cinta" de color.
// ─────────────────────────────────────────────────────────────────────────────

const HORA_INI = 7
const HORA_FIN = 19
const PX_HORA = 60
const yDe = (h: number, m = 0) => ((h - HORA_INI) * 60 + m) * (PX_HORA / 60)
const altoDe = (min: number) => Math.max(20, min * (PX_HORA / 60) - 2)
const TOTAL_H = (HORA_FIN - HORA_INI) * PX_HORA
// Tamaño del bloque en minutos (configurable por clínica; 15 por defecto).
const BLOQUE_MIN = 15
// Tramos de atención disponibles (verde). Fuera de esto = gris (almuerzo 13–14, etc.)
const DISPONIBLE: [number, number][] = [[8, 13], [14, 18]]

type Cita = { h: number; m: number; dur: number; nombre: string; estado: string; doctor: string; comentario?: string; sobrecupo?: boolean }

// Ícono de sillón dental (SVG simple).
function SillonDental({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="5" height="3" rx="1.5" transform="rotate(-22 5 6.5)" fill="currentColor" stroke="none" />
      <rect x="6.5" y="7.6" width="9" height="3.2" rx="1.6" transform="rotate(-9 11 9.2)" fill="currentColor" stroke="none" />
      <rect x="13.5" y="10.8" width="6.5" height="3" rx="1.5" fill="currentColor" stroke="none" />
      <path d="M17 14v4.5M13 18.5h8" />
    </svg>
  )
}

// Boxes / sillones (configurables en la clínica: nombre + tipo). Aquí de ejemplo.
const BOXES = ['Box 1', 'Box Estética', 'Pabellón']

const DIAS = [
  { dow: 'LUN', num: 16, hoy: false },
  { dow: 'MAR', num: 17, hoy: false },
  { dow: 'MIÉ', num: 18, hoy: false },
  { dow: 'JUE', num: 19, hoy: false },
  { dow: 'VIE', num: 20, hoy: true },
  { dow: 'SÁB', num: 21, hoy: false },
  { dow: 'DOM', num: 22, hoy: false },
]

const D1 = 'Dra. Abigail Aster', D2 = 'Dr. Marco Peña', D3 = 'Dra. Sofía León'

const CITAS_SEMANA: Cita[][] = [
  [{ h: 9, m: 0, dur: 45, nombre: 'Alejandra Gómez', estado: 'CONFIRMADO', doctor: D1, comentario: 'Trae radiografías' }, { h: 11, m: 0, dur: 30, nombre: 'Luis Suárez', estado: 'PENDIENTE', doctor: D1 }, { h: 15, m: 0, dur: 60, nombre: 'Andrés Morales', estado: 'CONFIRMADA', doctor: D2 }],
  [{ h: 8, m: 30, dur: 30, nombre: 'Camila Rojas', estado: 'ATENDIDA', doctor: D1 }, { h: 10, m: 0, dur: 45, nombre: 'Diego Fuentes', estado: 'EN_ATENCION', doctor: D3, comentario: 'Control post-op' }, { h: 16, m: 0, dur: 30, nombre: 'Ana Pizarro', estado: 'PENDIENTE', doctor: D1, sobrecupo: true }],
  [{ h: 9, m: 0, dur: 60, nombre: 'María José Vera', estado: 'CONFIRMADA', doctor: D2 }, { h: 12, m: 0, dur: 30, nombre: 'Pedro Salas', estado: 'EN_ESPERA', doctor: D1 }, { h: 14, m: 30, dur: 45, nombre: 'Ignacia Díaz', estado: 'PENDIENTE', doctor: D3 }],
  [{ h: 8, m: 0, dur: 30, nombre: 'Roberto Núñez', estado: 'NO_ASISTIO', doctor: D1 }, { h: 11, m: 30, dur: 60, nombre: 'Valentina Cruz', estado: 'CONFIRMADO', doctor: D2, comentario: 'Alérgica a penicilina' }],
  [{ h: 9, m: 30, dur: 45, nombre: 'Francisca Ferreira', estado: 'CONFIRMADA', doctor: D1 }, { h: 12, m: 30, dur: 30, nombre: 'Tomás Vidal', estado: 'PENDIENTE', doctor: D3, sobrecupo: true }, { h: 16, m: 0, dur: 30, nombre: 'Carla Muñoz', estado: 'CANCELADA', doctor: D2 }],
  [{ h: 10, m: 0, dur: 60, nombre: 'Jorge Reyes', estado: 'CONFIRMADA', doctor: D1 }],
  [],
]

const PROFESIONALES = [
  { nombre: D1, citas: CITAS_SEMANA[0] },
  { nombre: D2, citas: CITAS_SEMANA[2].map((c) => ({ ...c, doctor: D2 })) },
  { nombre: D3, citas: [{ h: 8, m: 30, dur: 30, nombre: 'Camila Rojas', estado: 'ATENDIDA', doctor: D3 }, { h: 10, m: 0, dur: 45, nombre: 'Diego Fuentes', estado: 'EN_ATENCION', doctor: D3 }, { h: 15, m: 0, dur: 30, nombre: 'Sol Vega', estado: 'PENDIENTE', doctor: D3, sobrecupo: true }] as Cita[] },
]

const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

function CitaCard({ c }: { c: Cita }) {
  const cfg = CITA_ESTADOS[c.estado]
  const alto = altoDe(c.dur)
  const finM = c.h * 60 + c.m + c.dur
  return (
    <div className="absolute left-0.5 right-0.5 rounded-md overflow-hidden flex bg-white shadow-sm ring-1 ring-slate-200 hover:ring-slate-300 hover:shadow cursor-pointer transition"
      style={{ top: yDe(c.h, c.m), height: alto, outline: c.sobrecupo ? '2px dashed #f97316' : undefined, outlineOffset: '-2px' }}>
      <div className="w-2 shrink-0" style={{ backgroundColor: cfg?.color }} />
      <div className="px-1.5 py-0.5 min-w-0 leading-tight">
        <p className="text-[11px] font-semibold text-slate-800 truncate flex items-center gap-1">
          {c.sobrecupo && <span className="text-[8px] font-bold px-1 rounded bg-orange-500 text-white shrink-0">SC</span>}
          {c.nombre}
        </p>
        {alto > 28 && <p className="text-[10px] text-slate-400 font-mono">{hhmm(c.h, c.m)}–{hhmm(Math.floor(finM / 60), finM % 60)}</p>}
        {alto > 44 && c.comentario && <p className="text-[10px] text-amber-700 truncate">📝 {c.comentario}</p>}
      </div>
    </div>
  )
}

function Columna({ citas }: { citas: Cita[] }) {
  return (
    <div className="relative bg-slate-100/70" style={{ height: TOTAL_H }}>
      {/* Tramos disponibles (verde); el resto queda gris = no disponible (almuerzo/fuera de horario) */}
      {DISPONIBLE.map(([a, b], i) => (
        <div key={i} className="absolute left-0 right-0 bg-[#e7f8ee]" style={{ top: yDe(a), height: (b - a) * PX_HORA }} />
      ))}
      {/* Líneas cada BLOQUE_MIN: hora sólida marcada, media hora media, resto tenue */}
      {Array.from({ length: Math.floor((HORA_FIN - HORA_INI) * 60 / BLOQUE_MIN) + 1 }, (_, i) => i * BLOQUE_MIN).map((t) => {
        const min = t % 60
        const cls = min === 0 ? 'border-slate-300' : min === 30 ? 'border-slate-200' : 'border-dashed border-slate-200/70'
        return <div key={t} className={`absolute left-0 right-0 border-t ${cls}`} style={{ top: yDe(HORA_INI, t) }} />
      })}
      {citas.map((c, i) => <CitaCard key={i} c={c} />)}
    </div>
  )
}

function EjeHoras() {
  // Marca cada 30 min en formato 24h (08:00, 08:30, 09:00…). La hora en punto,
  // más marcada; la media hora, más tenue.
  return (
    <div className="relative w-14 shrink-0 bg-white" style={{ height: TOTAL_H }}>
      {Array.from({ length: (HORA_FIN - HORA_INI) * 2 + 1 }, (_, i) => i * 30).map((t) => {
        const h = HORA_INI + Math.floor(t / 60), m = t % 60
        return (
          <div key={t} className={`absolute right-2 -translate-y-1/2 font-mono ${m === 0 ? 'text-[11px] font-semibold text-slate-500' : 'text-[10px] text-slate-400'}`} style={{ top: yDe(h, m) }}>
            {hhmm(h, m)}
          </div>
        )
      })}
    </div>
  )
}

function MiniCalendario() {
  const semanas = [[2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15], [16, 17, 18, 19, 20, 21, 22], [23, 24, 25, 26, 27, 28, 29], [30, 1, 2, 3, 4, 5, 6]]
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-700">Septiembre 2024</span>
        <div className="flex gap-1 text-slate-400"><button className="hover:text-slate-600">‹</button><button className="hover:text-slate-600">›</button></div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-slate-400 mb-1">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="space-y-1">
        {semanas.map((sem, r) => (
          <div key={r} className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {sem.map((d, i) => {
              const otroMes = (r === 0 && d > 20) || (r === 4 && d < 15)
              const hoy = d === 12 && r === 1
              const sel = d === 20 && r === 2
              return <span key={i} className={`py-1 rounded-full ${sel ? 'bg-cyan-600 text-white font-semibold' : hoy ? 'ring-1 ring-cyan-400 text-cyan-700' : otroMes ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'}`}>{d}</span>
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Vista diaria: LISTA (como la agenda actual) mostrando el profesional a cargo ──
function DiariaLista({ citas }: { citas: Cita[] }) {
  const orden = [...citas].sort((a, b) => (a.h * 60 + a.m) - (b.h * 60 + b.m))
  if (orden.length === 0) return <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">Sin citas para este día.</div>
  return (
    <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
      {orden.map((c, i) => {
        const cfg = CITA_ESTADOS[c.estado]
        const finM = c.h * 60 + c.m + c.dur
        return (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col items-center rounded-lg px-2 py-1 shrink-0" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>
              <span className="font-mono text-[13px] font-bold">{hhmm(c.h, c.m)}</span>
              <span className="font-mono text-[11px] opacity-70">{hhmm(Math.floor(finM / 60), finM % 60)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-cyan-800 truncate flex items-center gap-2">
                {c.nombre}
                {c.sobrecupo && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500 text-white">Sobrecupo</span>}
              </p>
              {/* El profesional a cargo, bien visible, para identificarlo */}
              <p className="text-xs text-slate-500 truncate"><span className="inline-flex items-center gap-1 font-medium text-slate-600"><SillonDental className="w-3.5 h-3.5 text-slate-400" /> {c.doctor}</span></p>
              {c.comentario && <p className="text-xs text-amber-700 truncate">📝 {c.comentario}</p>}
            </div>
            <span className="hidden sm:inline text-xs font-semibold px-2.5 py-1 rounded-full shrink-0" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>{cfg?.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export function AgendaPreview() {
  const [vista, setVista] = useState<'diaria' | 'semanal' | 'global'>('semanal')
  const [sidebar, setSidebar] = useState(true)
  const [soloSobrecupo, setSoloSobrecupo] = useState(false)
  const [estados, setEstados] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(CITA_ESTADOS).map((k) => [k, true])))

  // ocultarCancelada: en la rejilla (semanal/global) las canceladas NO se muestran
  // (el cupo queda libre); sólo aparecen en la vista Diaria.
  const filtrar = (cs: Cita[], ocultarCancelada = false) => cs.filter((c) => estados[c.estado] && (!soloSobrecupo || c.sobrecupo) && (!ocultarCancelada || c.estado !== 'CANCELADA'))

  type Col = { titulo: string; sub: string; citas: Cita[]; dow?: string; num?: number; hoy?: boolean }
  const columnas: Col[] = vista === 'global'
    ? PROFESIONALES.map((p) => ({ titulo: p.nombre, sub: `${filtrar(p.citas, true).length} citas`, citas: p.citas }))
    : DIAS.map((d, i) => ({ titulo: `${d.dow} ${d.num}`, sub: `${filtrar(CITAS_SEMANA[i], true).length} citas`, citas: CITAS_SEMANA[i], hoy: d.hoy, num: d.num, dow: d.dow }))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-amber-100 border-b border-amber-200 text-amber-800 text-xs px-4 py-1.5 flex items-center justify-between">
        <span>🔍 Vista previa del nuevo diseño de agenda (datos de ejemplo). No afecta la agenda real.</span>
        <Link to="/agenda" className="font-semibold underline">Volver a la agenda real</Link>
      </div>

      <div className="flex">
        {sidebar && (
          <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 space-y-5 sticky top-0 self-start h-screen overflow-y-auto">
            <MiniCalendario />
            <div className="space-y-2">
              <select className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white"><option>Abigail Aster</option></select>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white"><option>Presencial y videoconsulta</option></select>
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-700 block mb-2">Estados de cita</span>
              <div className="space-y-1.5">
                {Object.entries(CITA_ESTADOS).map(([k, cfg]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={estados[k]} onChange={() => setEstados((s) => ({ ...s, [k]: !s[k] }))} className="accent-cyan-600" />
                    <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: cfg.color }} />{cfg.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-700 block mb-2">Boxes / sillones</span>
              <p className="text-[11px] text-slate-400 mb-1.5">Configurables (nombre y tipo) en Configuración.</p>
              <div className="space-y-1">
                {BOXES.map((b) => (
                  <div key={b} className="flex items-center gap-2 text-sm text-slate-600"><SillonDental className="w-4 h-4 text-cyan-600" /> {b}</div>
                ))}
              </div>
            </div>
          </aside>
        )}

        <main className="flex-1 min-w-0">
          <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setSidebar((s) => !s)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Panel">▤</button>
              <div className="flex gap-1 text-slate-400"><button className="w-8 h-8 rounded-lg hover:bg-slate-100">‹</button><button className="w-8 h-8 rounded-lg hover:bg-slate-100">›</button></div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">{soloSobrecupo ? 'Agenda de sobrecupos' : vista === 'semanal' ? 'Semana del 16 al 22 de mayo' : vista === 'global' ? 'Viernes 20 de mayo · Global' : 'Viernes 20 de mayo'}</h1>
                <p className="text-xs text-slate-500">{vista === 'global' ? `${PROFESIONALES.length} profesionales` : 'Dra. Abigail Aster'} · 27 citas esta semana</p>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Hoy</button>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {(['diaria', 'semanal', 'global'] as const).map((v) => (
                    <button key={v} onClick={() => { setVista(v); setSoloSobrecupo(false) }} className={`px-3.5 py-1.5 text-sm font-medium capitalize ${vista === v ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{v}</button>
                  ))}
                </div>
                <button className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold">Agendar</button>
                <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">⚙</button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="text-xs font-medium text-slate-500 px-2.5 py-1 rounded-full border border-slate-200 inline-flex items-center gap-1"><SillonDental className="w-3.5 h-3.5 text-slate-500" /> {BOXES.length} boxes</span>
              {BOXES.map((b) => <span key={b} className="text-xs font-semibold text-white px-2.5 py-1 rounded-full bg-cyan-600 inline-flex items-center gap-1"><SillonDental className="w-3.5 h-3.5" /> {b}</span>)}
              <button onClick={() => setSoloSobrecupo((v) => !v)} className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${soloSobrecupo ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}>⚡ {soloSobrecupo ? 'Ver agenda normal' : 'Sobrecupo'}</button>
            </div>
          </div>

          {vista === 'diaria' ? (
            <div className="p-4 max-w-3xl">
              <DiariaLista citas={filtrar(CITAS_SEMANA[4])} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[820px]">
                <div className="flex sticky top-0 z-10 bg-white border-b-2 border-slate-300">
                  <div className="w-14 shrink-0" />
                  {columnas.map((c, i) => (
                    <div key={i} className="flex-1 min-w-0 text-center py-2 border-l border-slate-300 first:border-l-0">
                      {c.dow
                        ? <><p className="text-[11px] font-medium text-slate-400 uppercase">{c.dow}</p>
                            <p className={`text-xl font-bold mx-auto w-9 h-9 leading-9 rounded-full ${c.hoy ? 'bg-cyan-600 text-white' : 'text-slate-800'}`}>{c.num}</p></>
                        : <p className="text-sm font-semibold text-slate-800 truncate px-1 pt-1">{c.titulo}</p>}
                      <p className="text-[11px] text-slate-400 mt-0.5">{c.sub}</p>
                      <div className="text-[11px] text-slate-400 inline-flex items-center gap-1 justify-center"><SillonDental className="w-3 h-3" /> 1</div>
                    </div>
                  ))}
                </div>
                <div className="flex bg-white">
                  <EjeHoras />
                  {columnas.map((c, i) => (
                    <div key={i} className="flex-1 min-w-0 border-l border-slate-300 first:border-l-0">
                      <Columna citas={filtrar(c.citas, true)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
