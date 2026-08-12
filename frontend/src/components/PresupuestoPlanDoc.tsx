import type { PacienteDTO, ClinicaConfigDTO } from '@shared/types'
import { fmtMonto, paisMoneda } from '@/lib/money'
import { getPais } from '@shared/constants/paises'
import { ZONAS_FACIALES_NUCLEO } from '@shared/constants/zonas-faciales'
import rostroBase from '@/assets/rostro-base.jpg'

const fmtCLP = fmtMonto

// Path (calibrado sobre la foto base) por código de zona facial, para el mapa estético.
const PATH_POR_CODIGO: Record<string, string> = Object.fromEntries(
  ZONAS_FACIALES_NUCLEO.map((z) => [z.codigo, z.path]))

export interface PZona { zona: { codigo: string; nombreVisible: string } }
export interface PTrat {
  id: string; estado: string; precio: number; descuento: number; diente: number | null; cara: string | null; notas: string | null
  prestacion: { nombre: string }; cobroItems: { monto: number; cobro: { estado: string } | null }[]; zonas?: PZona[]
}
export interface PSeccion { id: string; titulo: string; fechaTentativa?: string | null; diasDesdeAnterior?: number | null; tiempoUnidad?: string; tratamientos: PTrat[] }
export interface PPlan { id: string; nombre: string; pacienteId: string; area?: string; doctorTitular: { name: string | null } | null; secciones: PSeccion[]; tratamientos: PTrat[]; abonoLibre?: number }

const unidadLabel = (u?: string) => (u === 'MESES' ? 'meses' : u === 'SEMANAS' ? 'semanas' : 'días')
const tiempoSeccion = (s: PSeccion): string | null => (
  s.diasDesdeAnterior != null ? `~${s.diasDesdeAnterior} ${unidadLabel(s.tiempoUnidad)} estimados`
    : s.fechaTentativa ? `Tentativa: ${new Date(s.fechaTentativa).toLocaleDateString('es-CL')}` : null
)
const neto = (t: PTrat) => Math.round(t.precio * (1 - (t.descuento || 0) / 100))
const pagado = (t: PTrat) => (t.cobroItems || []).filter((ci) => ci.cobro?.estado === 'PAGADO').reduce((s, ci) => s + ci.monto, 0)
const piezaLabel = (t: PTrat) => t.diente
  ? `${t.diente}${t.cara ? ` (${t.cara.split('').join(',')})` : ''}`
  : (t.cara ? t.cara : (t.notas ? t.notas.replace(/^Piezas:\s*/, '') : '—'))

// CSS con colores HEX (no Tailwind/oklch) embebido en el nodo: así html2canvas
// puede capturarlo para el PDF del correo (oklch rompe html2canvas).
const CSS = `
.pp { font-family: Inter, Arial, sans-serif; color:#1e293b; background:#fff; font-size:13px; }
.pp .pp-head { display:flex; align-items:center; justify-content:space-between; gap:16px; border-bottom:2px solid #0891b2; padding-bottom:16px; margin-bottom:20px; }
.pp .pp-logo { height:56px; width:56px; object-fit:contain; }
.pp .pp-logo-ph { height:56px; width:56px; border-radius:12px; background:#0891b2; color:#fff; font-size:26px; font-weight:bold; display:flex; align-items:center; justify-content:center; }
.pp .pp-cl-nombre { font-size:20px; font-weight:bold; color:#0f172a; }
.pp .pp-cl-sub { font-size:11px; color:#64748b; }
.pp .pp-doc-tit { font-size:13px; font-weight:600; color:#334155; text-align:right; }
.pp .pp-doc-fecha { font-size:11px; color:#64748b; text-align:right; }
.pp .pp-meta { display:flex; justify-content:space-between; margin-bottom:20px; }
.pp .pp-cap { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; }
.pp .pp-strong { font-weight:600; color:#1e293b; }
.pp .pp-mut { font-size:11px; color:#64748b; }
.pp .pp-sec { margin-bottom:16px; page-break-inside:avoid; }
.pp .pp-sec-h { display:flex; justify-content:space-between; align-items:center; gap:12px; background:#f1f5f9; padding:6px 12px; border-radius:8px 8px 0 0; }
.pp .pp-sec-t { font-size:13px; font-weight:600; color:#334155; }
.pp .pp-sec-time { margin-left:8px; font-size:11px; font-weight:400; color:#0e7490; }
.pp .pp-sec-monto { font-size:13px; font-family:monospace; color:#475569; }
.pp table { width:100%; border-collapse:collapse; border:1px solid #e2e8f0; border-top:0; }
.pp thead th { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; text-align:left; padding:4px 12px; font-weight:500; }
.pp tbody td { padding:6px 12px; border-top:1px solid #f1f5f9; color:#334155; }
.pp .pp-r { text-align:right; font-family:monospace; }
.pp .pp-c { text-align:center; color:#64748b; }
.pp .pp-tot { display:flex; justify-content:flex-end; margin-top:24px; }
.pp .pp-tot-box { width:270px; font-size:13px; }
.pp .pp-tot-row { display:flex; justify-content:space-between; padding:2px 0; }
.pp .pp-tot-row.b { border-top:1px solid #e2e8f0; padding-top:4px; }
.pp .pp-tot-row.tot { border-top:2px solid #0891b2; padding-top:6px; margin-top:4px; }
.pp .pp-saldo { font-family:monospace; font-weight:600; color:#d97706; }
.pp .pp-total-v { font-family:monospace; font-weight:bold; color:#0e7490; font-size:16px; }
.pp .pp-foot { font-size:11px; color:#94a3b8; margin-top:40px; border-top:1px solid #f1f5f9; padding-top:12px; }
.pp .pp-mapa { margin:4px 0 22px; page-break-inside:avoid; }
.pp .pp-mapa-t { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; margin-bottom:8px; text-align:center; }
.pp .pp-mapa-fig { position:relative; width:290px; margin:0 auto; }
.pp .pp-mapa-img { width:100%; display:block; border-radius:12px; }
.pp .pp-mapa-svg { position:absolute; top:0; left:0; width:100%; height:100%; }
.pp .pp-mapa-leg { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-top:12px; }
.pp .pp-mapa-chip { font-size:11px; color:#0e7490; background:#ecfeff; border:1px solid #a5f3fc; border-radius:999px; padding:2px 10px; }
`

// Mapa facial estético para el documento: foto base + overlay SVG con SOLO las
// zonas del plan marcadas. El overlay es solo <path> (sin <image>) sobre un <img>
// nativo: es el patrón que html2canvas/html2pdf captura de forma fiable en el correo.
function MapaFacialDoc({ zonas }: { zonas: { codigo: string; nombre: string }[] }) {
  const marcadas = zonas.filter((z) => PATH_POR_CODIGO[z.codigo])
  if (marcadas.length === 0) return null
  return (
    <div className="pp-mapa">
      <div className="pp-mapa-t">Zonas a tratar</div>
      <div className="pp-mapa-fig">
        <img className="pp-mapa-img" src={rostroBase} alt="Mapa facial" />
        <svg className="pp-mapa-svg" viewBox="0 0 1000 1300" preserveAspectRatio="xMidYMid meet">
          {marcadas.map((z) => (
            <path key={z.codigo} d={PATH_POR_CODIGO[z.codigo]} fill="rgba(8,145,178,0.32)" stroke="#0891b2" strokeWidth={4} />
          ))}
        </svg>
      </div>
      <div className="pp-mapa-leg">
        {marcadas.map((z) => <span key={z.codigo} className="pp-mapa-chip">{z.nombre}</span>)}
      </div>
    </div>
  )
}

// Documento de presupuesto de un plan de tratamiento (tamaño carta). Reutilizado
// por la vista imprimible (/print/plan) y por el envío por correo en PDF.
export function PresupuestoPlanDoc({ plan, clinica, paciente }: { plan: PPlan; clinica: ClinicaConfigDTO; paciente: PacienteDTO | null }) {
  const todas = [...plan.secciones.flatMap((s) => s.tratamientos), ...plan.tratamientos]
  const total = todas.reduce((s, t) => s + neto(t), 0)
  const realizado = todas.filter((t) => t.estado === 'COMPLETADO').reduce((s, t) => s + neto(t), 0)
  const abonado = todas.reduce((s, t) => s + pagado(t), 0) + (plan.abonoLibre ?? 0)
  const saldo = Math.max(0, total - abonado)
  const secciones: PSeccion[] = [
    ...plan.secciones,
    ...(plan.tratamientos.length ? [{ id: '', titulo: 'Otras prestaciones', tratamientos: plan.tratamientos }] : []),
  ]
  // Zonas faciales del plan (solo estética): únicas por código, con su nombre visible.
  const zonasTratadas = plan.area === 'ESTETICA'
    ? Array.from(new Map(
        todas.flatMap((t) => t.zonas ?? []).map((z) => [z.zona.codigo, z.zona.nombreVisible] as const),
      ).entries()).map(([codigo, nombre]) => ({ codigo, nombre }))
    : []

  return (
    <div className="pp">
      <style>{CSS}</style>

      <div className="pp-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {clinica.logoUrl
            ? <img className="pp-logo" src={clinica.logoUrl} alt="" />
            : <div className="pp-logo-ph">{clinica.nombre.charAt(0)}</div>}
          <div>
            <div className="pp-cl-nombre">{clinica.nombre}</div>
            <div className="pp-cl-sub">{[clinica.direccion, clinica.ciudad].filter(Boolean).join(', ')}</div>
            <div className="pp-cl-sub">{[clinica.telefono, clinica.email].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div>
          <div className="pp-doc-tit">Presupuesto</div>
          <div className="pp-doc-fecha">{new Date().toLocaleDateString('es-CL', { dateStyle: 'long' })}</div>
        </div>
      </div>

      <div className="pp-meta">
        <div>
          <div className="pp-cap">Paciente</div>
          <div className="pp-strong">{paciente ? `${paciente.nombre} ${paciente.apellido}` : '—'}</div>
          {paciente?.rut && <div className="pp-mut">{paciente.rut}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="pp-cap">Plan de tratamiento</div>
          <div className="pp-strong">{plan.nombre}</div>
          {plan.doctorTitular?.name && <div className="pp-mut">Profesional: {plan.doctorTitular.name}</div>}
        </div>
      </div>

      {zonasTratadas.length > 0 && <MapaFacialDoc zonas={zonasTratadas} />}

      {secciones.map((s) => (
        <div key={s.id || 'sin'} className="pp-sec">
          <div className="pp-sec-h">
            <span className="pp-sec-t">{s.titulo}{tiempoSeccion(s) && <span className="pp-sec-time">⏱ {tiempoSeccion(s)}</span>}</span>
            <span className="pp-sec-monto">{fmtCLP(s.tratamientos.reduce((a, t) => a + neto(t), 0))}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Prestación</th><th style={{ width: 112 }}>Pieza / zona</th><th style={{ width: 64 }} className="pp-c">Dscto</th><th style={{ width: 112 }} className="pp-r">Precio</th>
              </tr>
            </thead>
            <tbody>
              {s.tratamientos.map((t) => (
                <tr key={t.id}>
                  <td>{t.prestacion.nombre}</td>
                  <td>{piezaLabel(t)}</td>
                  <td className="pp-c">{t.descuento ? `${t.descuento}%` : '—'}</td>
                  <td className="pp-r">{fmtCLP(neto(t))}</td>
                </tr>
              ))}
              {s.tratamientos.length === 0 && <tr><td colSpan={4} className="pp-mut">Sin prestaciones.</td></tr>}
            </tbody>
          </table>
        </div>
      ))}

      <div className="pp-tot">
        <div className="pp-tot-box">
          <div className="pp-tot-row"><span className="pp-mut">Realizado</span><span style={{ fontFamily: 'monospace' }}>{fmtCLP(realizado)}</span></div>
          <div className="pp-tot-row"><span className="pp-mut">Abonado</span><span style={{ fontFamily: 'monospace' }}>{fmtCLP(abonado)}</span></div>
          <div className="pp-tot-row b"><span className="pp-mut">Saldo por abonar</span><span className="pp-saldo">{fmtCLP(saldo)}</span></div>
          <div className="pp-tot-row tot"><span style={{ fontWeight: 'bold' }}>TOTAL</span><span className="pp-total-v">{fmtCLP(total)}</span></div>
        </div>
      </div>

      <div className="pp-foot">Presupuesto referencial. Valores en {getPais(paisMoneda()).moneda.code}. Documento generado por {clinica.nombre}.</div>
    </div>
  )
}
