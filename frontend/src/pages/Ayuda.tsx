import { useMemo, useState } from 'react'

interface Articulo { id: string; categoria: string; titulo: string; cuerpo: string; claves: string }

// Centro de ayuda de la SPA. Contenido escrito para la interfaz actual de
// Cláriva (no copiado del monolito, cuya UI difiere).
const ARTICULOS: Articulo[] = [
  { id: 'login', categoria: 'Acceso', titulo: 'Cómo iniciar sesión', claves: 'login entrar clave usuario',
    cuerpo: 'Ingresa con el código de tu clínica, tu usuario y tu contraseña. Si eres administrador de la plataforma, usa el enlace "Soy administrador de la plataforma" y entra con tu email. Si es tu primer ingreso, el sistema te pedirá definir una contraseña nueva.' },
  { id: 'password', categoria: 'Acceso', titulo: 'Cambiar mi contraseña', claves: 'contraseña clave seguridad',
    cuerpo: 'En la barra superior, junto a tu nombre, usa "Cambiar contraseña". Debes ingresar tu contraseña actual y la nueva (mínimo 8 caracteres, con al menos una letra y un número).' },
  { id: 'agenda', categoria: 'Agenda', titulo: 'Agendar y reagendar citas', claves: 'agenda cita calendario hora reagendar arrastrar',
    cuerpo: 'En Agenda selecciona el profesional y el día. Crea una cita eligiendo paciente, motivo y duración. Para reagendar, arrastra la cita en la vista semanal; si choca con otra, el sistema revierte el cambio. Usa "Sobre agendamiento" para permitir un solape intencional.' },
  { id: 'estados', categoria: 'Agenda', titulo: 'Estados de una cita', claves: 'estado confirmar atendida en espera',
    cuerpo: 'El flujo es: Agendada → Confirmada → En espera → En atención → Atendida. También puedes marcar No asistió o Cancelada. El botón de acción siguiente está destacado en el detalle de la cita.' },
  { id: 'bloqueos', categoria: 'Agenda', titulo: 'Bloquear horarios', claves: 'bloqueo vacaciones no disponible',
    cuerpo: 'Crea un bloqueo de agenda para marcar horas no disponibles de un profesional (almuerzo, permisos). No se podrán agendar citas dentro de un bloqueo.' },
  { id: 'pacientes', categoria: 'Pacientes', titulo: 'Buscar y crear pacientes', claves: 'paciente buscar rut crear nuevo',
    cuerpo: 'En Pacientes usa el buscador por nombre o RUT. Para crear uno nuevo, complétalo desde la agenda al agendar, o usa la importación masiva.' },
  { id: 'import', categoria: 'Pacientes', titulo: 'Importar y exportar pacientes', claves: 'importar exportar excel xlsx masivo plantilla',
    cuerpo: 'Solo administradores. Descarga la "Plantilla" XLSX, complétala y usa "Importar". El sistema valida nombres, RUT (descarta duplicados) y te informa cuántos se crearon. "Exportar XLSX" descarga toda la nómina.' },
  { id: 'ficha', categoria: 'Ficha clínica', titulo: 'Ficha del paciente', claves: 'ficha datos clinico antecedentes',
    cuerpo: 'La ficha tiene pestañas: Datos (demográficos + flags clínicos), Citas, Planes de tratamiento, Evoluciones, Odontograma, Comentarios administrativos e historial de Mensajes. El encabezado muestra KPIs (tratamientos, montos, saldo).' },
  { id: 'odontograma', categoria: 'Ficha clínica', titulo: 'Usar el odontograma', claves: 'odontograma dientes pieza caries',
    cuerpo: 'Haz clic en una pieza y elige su estado (sano, caries, obturado, corona, endodoncia, implante, ausente). El color se actualiza y se guarda automáticamente.' },
  { id: 'presupuestos', categoria: 'Presupuestos', titulo: 'Crear un presupuesto', claves: 'presupuesto cotizacion items prestacion',
    cuerpo: 'En Presupuestos usa "Nuevo presupuesto", elige el paciente y agrega prestaciones con cantidad, precio y descuento. El total se calcula solo. Luego puedes cambiar su estado (Pendiente/Aprobado/Rechazado/Completado) desde la lista.' },
  { id: 'cobros', categoria: 'Cobros y caja', titulo: 'Recibir un pago', claves: 'cobro pago caja recibir',
    cuerpo: 'Abre la caja con el saldo declarado. En Cobros usa "Recibir pago": busca el paciente, agrega los ítems y elige el medio de pago. El movimiento queda en la sesión de caja.' },
  { id: 'arqueo', categoria: 'Cobros y caja', titulo: 'Cerrar caja (arqueo)', claves: 'cierre arqueo caja diferencia',
    cuerpo: 'Al cerrar la sesión declaras el saldo real contado; el sistema lo compara con el esperado y muestra la diferencia. Puedes registrar egresos y anular movimientos o cobros.' },
  { id: 'liquidaciones', categoria: 'Liquidaciones', titulo: 'Liquidar honorarios', claves: 'liquidacion honorarios doctor contrato',
    cuerpo: 'Genera una liquidación por profesional y período. Antes define el contrato del profesional (porcentaje o monto fijo). Cambia el estado de la liquidación entre Borrador, Aprobada y Pagada.' },
  { id: 'reportes', categoria: 'Reportes', titulo: 'Exportar reportes', claves: 'reporte excel xlsx exportar morosos',
    cuerpo: 'En Reportes descargas a Excel: pacientes, citas, cobros, tratamientos, liquidaciones, caja y morosos. El filtro de fechas aplica a los reportes que lo soportan.' },
  { id: 'config', categoria: 'Configuración', titulo: 'Datos de la clínica', claves: 'configuracion clinica datos whatsapp',
    cuerpo: 'En Configuración (solo administradores) editas nombre, contacto y la plantilla de mensaje de WhatsApp. La gestión de equipo se hace en la sección Equipo.' },
]

const CATEGORIAS = Array.from(new Set(ARTICULOS.map((a) => a.categoria)))

export function Ayuda() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | 'all'>('all')
  const [sel, setSel] = useState<Articulo | null>(null)

  const filtrados = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return ARTICULOS.filter((a) => {
      if (cat !== 'all' && a.categoria !== cat) return false
      if (!needle) return true
      return (a.titulo + ' ' + a.cuerpo + ' ' + a.claves).toLowerCase().includes(needle)
    })
  }, [q, cat])

  if (sel) {
    return (
      <div className="max-w-3xl">
        <button onClick={() => setSel(null)} className="text-sm text-cyan-600 hover:underline">← Volver al centro de ayuda</button>
        <article className="mt-4 bg-white rounded-2xl border border-slate-200 p-6">
          <p className="text-xs uppercase tracking-wider text-cyan-600 font-semibold">{sel.categoria}</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1 mb-3">{sel.titulo}</h1>
          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{sel.cuerpo}</p>
        </article>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-slate-900">Centro de ayuda</h1>
      <p className="text-slate-500 text-sm mt-1 mb-5">Guías rápidas de la plataforma. Busca tu duda o navega por categoría.</p>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ayuda…"
        className="w-full max-w-lg mb-4 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />

      <div className="flex flex-wrap gap-2 mb-5">
        <Chip activo={cat === 'all'} onClick={() => setCat('all')}>Todas</Chip>
        {CATEGORIAS.map((c) => <Chip key={c} activo={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {filtrados.map((a) => (
          <button key={a.id} onClick={() => setSel(a)} className="text-left bg-white rounded-2xl border border-slate-200 hover:border-cyan-300 p-4 transition-colors">
            <p className="text-xs uppercase tracking-wider text-cyan-600 font-semibold">{a.categoria}</p>
            <p className="font-semibold text-slate-800 mt-0.5">{a.titulo}</p>
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{a.cuerpo}</p>
          </button>
        ))}
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
