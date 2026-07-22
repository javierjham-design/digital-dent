import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CITA_ESTADOS } from '@shared/constants/cita-estados'

// ─────────────────────────────────────────────────────────────────────────────
// VISTA PREVIA DE LA NUEVA AGENDA (solo diseño, datos de ejemplo).
// No toca la agenda real ni la base de datos. Sirve para iterar el look antes de
// portarlo. Mantiene los colores de estado reales (CITA_ESTADOS) y el verde para
// los espacios disponibles; las citas se muestran como una "cinta" de color.
// ─────────────────────────────────────────────────────────────────────────────

const HORA_INI = 7
const HORA_FIN = 19
const PX_HORA = 56 // alto de cada hora
const yDe = (h: number, m = 0) => ((h - HORA_INI) * 60 + m) * (PX_HORA / 60)
const altoDe = (min: number) => Math.max(20, min * (PX_HORA / 60) - 2)
const TOTAL_H = (HORA_FIN - HORA_INI) * PX_HORA

type Cita = { h: number; m: number; dur: number; nombre: string; estado: string; sobrecupo?: boolean }

const DIAS = [
  { dow: 'LUN', num: 16, citas: 8 },
  { dow: 'MAR', num: 17, citas: 6 },
  { dow: 'MIÉ', num: 18, citas: 10, hoy: false },
  { dow: 'JUE', num: 19, citas: 7 },
  { dow: 'VIE', num: 20, citas: 9, hoy: true },
  { dow: 'SÁB', num: 21, citas: 4 },
  { dow: 'DOM', num: 22, citas: 0 },
]

// Citas de ejemplo por día (índice 0..6).
const CITAS_SEMANA: Cita[][] = [
  [{ h: 9, m: 0, dur: 45, nombre: 'Alejandra Gómez', estado: 'CONFIRMADO' }, { h: 11, m: 0, dur: 30, nombre: 'Luis Suárez', estado: 'PENDIENTE' }, { h: 15, m: 0, dur: 60, nombre: 'Andrés Morales', estado: 'CONFIRMADA' }],
  [{ h: 8, m: 30, dur: 30, nombre: 'Camila Rojas', estado: 'ATENDIDA' }, { h: 10, m: 0, dur: 45, nombre: 'Diego Fuentes', estado: 'EN_ATENCION' }, { h: 16, m: 0, dur: 30, nombre: 'Sobrecupo · Ana P.', estado: 'PENDIENTE', sobrecupo: true }],
  [{ h: 9, m: 0, dur: 60, nombre: 'María José Vera', estado: 'CONFIRMADA' }, { h: 12, m: 0, dur: 30, nombre: 'Pedro Salas', estado: 'EN_ESPERA' }, { h: 14, m: 30, dur: 45, nombre: 'Ignacia Díaz', estado: 'PENDIENTE' }],
  [{ h: 8, m: 0, dur: 30, nombre: 'Roberto Núñez', estado: 'NO_ASISTIO' }, { h: 11, m: 30, dur: 60, nombre: 'Valentina Cruz', estado: 'CONFIRMADO' }],
  [{ h: 9, m: 30, dur: 45, nombre: 'Francisca Ferreira', estado: 'CONFIRMADA' }, { h: 13, m: 0, dur: 30, nombre: 'Tomás Vidal', estado: 'PENDIENTE' }, { h: 16, m: 0, dur: 30, nombre: 'Carla Muñoz', estado: 'CANCELADA' }],
  [{ h: 10, m: 0, dur: 60, nombre: 'Jorge Reyes', estado: 'CONFIRMADA' }],
  [],
]

const PROFESIONALES = [
  { nombre: 'Dra. Abigail Aster', citas: [{ h: 9, m: 0, dur: 45, nombre: 'Alejandra Gómez', estado: 'CONFIRMADO' }, { h: 11, m: 30, dur: 30, nombre: 'Luis Suárez', estado: 'PENDIENTE' }, { h: 15, m: 0, dur: 60, nombre: 'Andrés Morales', estado: 'CONFIRMADA' }] as Cita[] },
  { nombre: 'Dr. Marco Peña', citas: [{ h: 8, m: 30, dur: 30, nombre: 'Camila Rojas', estado: 'ATENDIDA' }, { h: 10, m: 0, dur: 45, nombre: 'Diego Fuentes', estado: 'EN_ATENCION' }, { h: 16, m: 0, dur: 30, nombre: 'Ana P. (SC)', estado: 'PENDIENTE', sobrecupo: true }] as Cita[] },
  { nombre: 'Dra. Sofía León', citas: [{ h: 9, m: 0, dur: 60, nombre: 'María José Vera', estado: 'CONFIRMADA' }, { h: 12, m: 0, dur: 30, nombre: 'Pedro Salas', estado: 'EN_ESPERA' }] as Cita[] },
  { nombre: 'Dr. Iván Torres', citas: [{ h: 8, m: 0, dur: 30, nombre: 'Roberto Núñez', estado: 'NO_ASISTIO' }, { h: 11, m: 30, dur: 60, nombre: 'Valentina Cruz', estado: 'CONFIRMADO' }] as Cita[] },
]

const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

// Tarjeta de cita como "cinta" de color (barra lateral gruesa + fondo tenue).
function CitaCard({ c }: { c: Cita }) {
  const cfg = CITA_ESTADOS[c.estado]
  const top = yDe(c.h, c.m)
  const alto = altoDe(c.dur)
  const finM = c.h * 60 + c.m + c.dur
  return (
    <div className="absolute left-0.5 right-0.5 rounded-md overflow-hidden flex bg-white shadow-sm ring-1 ring-slate-200 hover:ring-slate-300 hover:shadow cursor-pointer transition"
      style={{ top, height: alto, backgroundColor: `${cfg?.bg}66` }}>
      {/* Cinta de color (más gruesa que la referencia) */}
      <div className="w-[6px] shrink-0" style={{ backgroundColor: cfg?.color }} />
      <div className="px-1.5 py-0.5 min-w-0 leading-tight">
        <p className="text-[11px] font-semibold text-slate-800 truncate flex items-center gap-1">
          {c.sobrecupo && <span className="text-[8px] font-bold px-1 rounded bg-orange-500 text-white">SC</span>}
          {c.nombre}
        </p>
        {alto > 30 && <p className="text-[10px] text-slate-400 font-mono">{hhmm(c.h, c.m)}–{hhmm(Math.floor(finM / 60), finM % 60)}</p>}
      </div>
    </div>
  )
}

// Columna de un día/profesional: rejilla horaria + franja verde disponible + citas.
function Columna({ citas, disponibleDesde = 8, disponibleHasta = 18 }: { citas: Cita[]; disponibleDesde?: number; disponibleHasta?: number }) {
  return (
    <div className="relative border-l border-slate-200 first:border-l-0" style={{ height: TOTAL_H }}>
      {/* Franja de atención disponible (verde tenue) */}
      <div className="absolute left-0 right-0 bg-[#eefaf3]" style={{ top: yDe(disponibleDesde), height: (disponibleHasta - disponibleDesde) * PX_HORA }} />
      {/* Líneas de hora */}
      {Array.from({ length: HORA_FIN - HORA_INI + 1 }, (_, i) => HORA_INI + i).map((h) => (
        <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: yDe(h) }} />
      ))}
      {/* Media hora (más tenue) */}
      {Array.from({ length: HORA_FIN - HORA_INI }, (_, i) => HORA_INI + i).map((h) => (
        <div key={`m${h}`} className="absolute left-0 right-0 border-t border-dashed border-slate-100/70" style={{ top: yDe(h, 30) }} />
      ))}
      {citas.map((c, i) => <CitaCard key={i} c={c} />)}
    </div>
  )
}

function EjeHoras() {
  return (
    <div className="relative w-14 shrink-0" style={{ height: TOTAL_H }}>
      {Array.from({ length: HORA_FIN - HORA_INI + 1 }, (_, i) => HORA_INI + i).map((h) => (
        <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] font-medium text-slate-400" style={{ top: yDe(h) }}>
          {h <= 12 ? h : h - 12} {h < 12 ? 'AM' : 'PM'}
        </div>
      ))}
    </div>
  )
}

function MiniCalendario() {
  // Septiembre 2024 estático (como la referencia), día 20 seleccionado.
  const semanas = [
    [2, 3, 4, 5, 6, 7, 8],
    [9, 10, 11, 12, 13, 14, 15],
    [16, 17, 18, 19, 20, 21, 22],
    [23, 24, 25, 26, 27, 28, 29],
    [30, 1, 2, 3, 4, 5, 6],
  ]
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-700">Septiembre 2024</span>
        <div className="flex gap-1 text-slate-400">
          <button className="hover:text-slate-600">‹</button><button className="hover:text-slate-600">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10px] text-slate-400 mb-1">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="space-y-1">
        {semanas.map((sem, r) => (
          <div key={r} className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {sem.map((d, i) => {
              const otroMes = (r === 0 && d > 20) || (r >= 3 && d < 15 && r === 4)
              const hoy = d === 12 && r === 1
              const sel = d === 20 && r === 2
              return (
                <span key={i} className={`py-1 rounded-full ${sel ? 'bg-cyan-600 text-white font-semibold' : hoy ? 'ring-1 ring-cyan-400 text-cyan-700' : otroMes ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'}`}>{d}</span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

const SILLON = '🪑'

export function AgendaPreview() {
  const [vista, setVista] = useState<'diaria' | 'semanal' | 'global'>('semanal')
  const [sidebar, setSidebar] = useState(true)
  const [estados, setEstados] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.keys(CITA_ESTADOS).map((k) => [k, true])))

  type Col = { titulo: string; sub: string; citas: Cita[]; dow?: string; num?: number; hoy?: boolean }
  const columnas: Col[] = vista === 'global'
    ? PROFESIONALES.map((p) => ({ titulo: p.nombre, sub: `${p.citas.length} citas`, citas: p.citas }))
    : vista === 'diaria'
      ? [{ titulo: 'Viernes 20', sub: '9 citas', citas: CITAS_SEMANA[4] }]
      : DIAS.map((d, i) => ({ titulo: `${d.dow} ${d.num}`, sub: `${d.citas} citas`, citas: CITAS_SEMANA[i], hoy: d.hoy, num: d.num, dow: d.dow }))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Aviso de vista previa */}
      <div className="bg-amber-100 border-b border-amber-200 text-amber-800 text-xs px-4 py-1.5 flex items-center justify-between">
        <span>🔍 Vista previa del nuevo diseño de agenda (datos de ejemplo). No afecta la agenda real.</span>
        <Link to="/agenda" className="font-semibold underline">Volver a la agenda real</Link>
      </div>

      <div className="flex">
        {/* ── Panel lateral fijo ── */}
        {sidebar && (
          <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 space-y-5 sticky top-0 self-start h-screen overflow-y-auto">
            <MiniCalendario />
            <div className="space-y-2">
              <select className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white">
                <option>Abigail Aster</option>
              </select>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white">
                <option>Presencial y videoconsulta</option>
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700">Estados de cita</span>
              </div>
              <div className="space-y-1.5">
                {Object.entries(CITA_ESTADOS).map(([k, cfg]) => (
                  <label key={k} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={estados[k]} onChange={() => setEstados((s) => ({ ...s, [k]: !s[k] }))} className="accent-cyan-600" />
                    <span className="w-3.5 h-3.5 rounded" style={{ backgroundColor: cfg.color }} />
                    {cfg.label}
                  </label>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* ── Panel principal ── */}
        <main className="flex-1 min-w-0">
          {/* Toolbar superior */}
          <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setSidebar((s) => !s)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Mostrar/ocultar panel">▤</button>
              <div className="flex gap-1 text-slate-400">
                <button className="w-8 h-8 rounded-lg hover:bg-slate-100">‹</button>
                <button className="w-8 h-8 rounded-lg hover:bg-slate-100">›</button>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900 leading-tight">
                  {vista === 'semanal' ? 'Semana del 16 al 22 de mayo' : vista === 'global' ? 'Viernes 20 de mayo · Global' : 'Viernes 20 de mayo'}
                </h1>
                <p className="text-xs text-slate-500">{vista === 'global' ? `${PROFESIONALES.length} profesionales` : 'Dra. Abigail Aster'} · 27 citas esta semana</p>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">Hoy</button>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  {(['diaria', 'semanal', 'global'] as const).map((v) => (
                    <button key={v} onClick={() => setVista(v)}
                      className={`px-3.5 py-1.5 text-sm font-medium capitalize ${vista === v ? 'bg-cyan-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{v}</button>
                  ))}
                </div>
                <button className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold">Agendar</button>
                <button className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50">⚙</button>
              </div>
            </div>
            {/* Sub-toolbar: sillones + sobrecupo */}
            <div className="flex items-center gap-2 mt-2.5">
              <span className="text-xs font-medium text-slate-500 px-2.5 py-1 rounded-full border border-slate-200">3 de 3 sillones</span>
              {[1, 2, 3].map((n) => <span key={n} className="text-xs font-semibold text-white px-2.5 py-1 rounded-full bg-cyan-600">{SILLON} {n}</span>)}
              <span className="text-xs font-semibold text-orange-700 px-2.5 py-1 rounded-full bg-orange-100 flex items-center gap-1">⚡ Sobrecupo</span>
            </div>
          </div>

          {/* Encabezado de columnas (sticky) */}
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="flex sticky top-0 z-10 bg-white border-b border-slate-200">
                <div className="w-14 shrink-0" />
                {columnas.map((c, i) => (
                  <div key={i} className="flex-1 min-w-0 text-center py-2 border-l border-slate-100 first:border-l-0">
                    {c.dow
                      ? <>
                          <p className="text-[11px] font-medium text-slate-400 uppercase">{c.dow}</p>
                          <p className={`text-xl font-bold mx-auto w-9 h-9 leading-9 rounded-full ${c.hoy ? 'bg-cyan-600 text-white' : 'text-slate-800'}`}>{c.num}</p>
                        </>
                      : <p className="text-sm font-semibold text-slate-800 truncate px-1 pt-1">{c.titulo}</p>}
                    <p className="text-[11px] text-slate-400 mt-0.5">{c.sub}</p>
                    <div className="text-[11px] text-slate-400">{SILLON} 1</div>
                  </div>
                ))}
              </div>

              {/* Rejilla */}
              <div className="flex bg-white">
                <EjeHoras />
                {columnas.map((c, i) => (
                  <div key={i} className="flex-1 min-w-0">
                    <Columna citas={c.citas.filter((x) => estados[x.estado])} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
