import type { TenantClient } from '@/db/tenant'
import { buildXlsx, clp, formatRUT, isoDate, isoDateTz, isoDateTimeTz } from '@/lib/excel'
import { rangoFechasUtc, tzDePais } from '@/lib/tz'

// Zona horaria de la clínica (para RENDERIZAR instantes en el XLSX: en UTC una cita de
// las 21:00 salía con hora corrida y fecha del día siguiente).
async function tzDe(db: TenantClient): Promise<string> {
  const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { pais: true } })
  return tzDePais(cfg?.pais)
}
// Campo de semántica MIXTA (fechaPago): instante en los datos nuevos, medianoche UTC en
// los retro-fechados/legacy. Igual criterio que fmtEvolucion del frontend.
const esMedianocheUtc = (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
const fechaMixta = (d: Date | null | undefined, tz: string): string => (!d ? '' : esMedianocheUtc(d) ? isoDate(d) : isoDateTz(d, tz))

// Cada reporte devuelve { buffer, filenameBase }; el controller arma la
// respuesta HTTP de descarga. Misma lógica de filtros que el monolito.

export interface ReporteResult { buffer: Buffer; filenameBase: string }

type Q = Record<string, string | undefined>

// Rango de fechas del reporte en la ZONA de la clínica (no en UTC-local del server): un
// registro de 20:00-23:59 hora local del último día ya no queda fuera, y cuadra con los
// reportes de caja (que ya usan rangoFechasUtc). Devuelve { desde: gte, hasta: lte }.
// SÓLO para campos que son INSTANTES reales (createdAt, cita.fecha, movimiento.fecha).
async function rangoTz(db: TenantClient, desde?: string, hasta?: string): Promise<{ desde?: Date; hasta?: Date }> {
  if (!desde && !hasta) return {} // sin filtro de fecha: no consultar Configuracion
  const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { pais: true } })
  const r = rangoFechasUtc(desde, hasta, tzDePais(cfg?.pais))
  return { desde: r.gte, hasta: r.lte }
}

// Rango en LÍMITES UTC de día (00:00:00.000Z → 23:59:59.999Z). Para campos "fecha-sola"
// guardados a medianoche UTC (`new Date("YYYY-MM-DD")`): fechaPago retro-fechada y
// fechaCompletado (evoluciones). El shift a la zona de la clínica los dejaría un día
// antes (ej. 15-jul T00:00Z queda antes de las 04:00Z del gte chileno → saldría en el 14).
function rangoUtc(desde?: string, hasta?: string): { desde?: Date; hasta?: Date } {
  const r = rangoFechasUtc(desde, hasta, 'UTC')
  return { desde: r.gte, hasta: r.lte }
}

// Tope de filas por export: un click "sin rango" en una clínica con años de datos no
// debe armar un XLSX ilimitado en memoria. 50.000 filas cubren cualquier uso real.
const MAX_FILAS_EXPORT = 50_000

export async function reportePacientes(db: TenantClient, q: Q): Promise<ReporteResult> {
  const tz = await tzDe(db)
  const { desde, hasta } = await rangoTz(db, q.desde, q.hasta)
  const soloActivos = q.soloActivos === '1'
  const pacientes = await db.paciente.findMany({
    where: {
      ...(soloActivos ? { activo: true } : {}),
      ...(desde || hasta ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
    },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    take: MAX_FILAS_EXPORT,
  })
  const buffer = buildXlsx(pacientes, [
    { header: 'Nombres', width: 18, value: (p) => p.nombre },
    { header: 'Apellidos', width: 22, value: (p) => p.apellido },
    { header: 'RUT', width: 14, value: (p) => formatRUT(p.rut) },
    { header: 'Teléfono', width: 16, value: (p) => p.telefono ?? '' },
    { header: 'Correo', width: 28, value: (p) => p.email ?? '' },
    { header: 'Dirección', width: 32, value: (p) => p.direccion ?? '' },
    { header: 'Fecha nacimiento', width: 16, value: (p) => isoDate(p.fechaNacimiento) },
    { header: 'Previsión', width: 14, value: (p) => p.prevision ?? '' },
    { header: 'Género', width: 10, value: (p) => p.genero ?? '' },
    { header: 'Activo', width: 8, value: (p) => (p.activo ? 'Sí' : 'No') },
    { header: 'Creado', width: 12, value: (p) => isoDateTz(p.createdAt, tz) },
  ], 'Pacientes')
  return { buffer, filenameBase: 'pacientes' }
}

// Consulta cruda de citas para el rango/estado dado. Reutilizada por el reporte
// XLSX y por la herramienta ocupacion_agenda del asistente (misma definición de
// negocio, distinto armado de salida).
export async function citasDatos(db: TenantClient, q: Q) {
  const { desde, hasta } = await rangoTz(db, q.desde, q.hasta)
  return db.cita.findMany({
    where: {
      ...(desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    },
    include: { paciente: { select: { nombre: true, apellido: true, rut: true, telefono: true } }, doctor: { select: { name: true } } },
    orderBy: { fecha: 'asc' },
    take: MAX_FILAS_EXPORT,
  })
}

export async function reporteCitas(db: TenantClient, q: Q): Promise<ReporteResult> {
  const tz = await tzDe(db)
  const citas = await citasDatos(db, q)
  const buffer = buildXlsx(citas, [
    { header: 'Fecha', width: 12, value: (c) => isoDateTz(c.fecha, tz) },
    { header: 'Hora', width: 8, value: (c) => isoDateTimeTz(c.fecha, tz).slice(11) },
    { header: 'Duración (min)', width: 12, value: (c) => c.duracion },
    { header: 'Paciente', width: 28, value: (c) => `${c.paciente.nombre} ${c.paciente.apellido}` },
    { header: 'RUT', width: 14, value: (c) => c.paciente.rut ?? '' },
    { header: 'Teléfono', width: 16, value: (c) => c.paciente.telefono ?? '' },
    { header: 'Doctor', width: 24, value: (c) => c.doctor?.name ?? '' },
    { header: 'Tipo', width: 16, value: (c) => c.tipo ?? '' },
    { header: 'Estado', width: 14, value: (c) => c.estado },
    { header: 'Sala', width: 10, value: (c) => c.sala ?? '' },
    { header: 'WA confirmado', width: 14, value: (c) => (c.confirmadoWA ? 'Sí' : 'No') },
    { header: 'Notas', width: 32, value: (c) => c.notas ?? '' },
  ], 'Citas')
  return { buffer, filenameBase: 'citas' }
}

export async function reporteCobros(db: TenantClient, q: Q): Promise<ReporteResult> {
  const tz = await tzDe(db)
  const usarFechaPago = q.campo === 'fechaPago'
  // fechaPago puede ser fecha-sola (retro-fechada) → límites UTC; createdAt es instante → zona clínica.
  const { desde, hasta } = usarFechaPago ? rangoUtc(q.desde, q.hasta) : await rangoTz(db, q.desde, q.hasta)
  const filtroFecha = (desde || hasta) ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } : null
  const cobros = await db.cobro.findMany({
    where: {
      ...(q.estado ? { estado: q.estado } : {}),
      // "Pagos recibidos" (estado=PAGADO) excluye los anulados: contarlos inflaba el
      // total frente al reporte de pagos de Gestión de cajas.
      ...(q.estado === 'PAGADO' ? { anulado: false } : {}),
      ...(filtroFecha ? (usarFechaPago ? { fechaPago: filtroFecha } : { createdAt: filtroFecha }) : {}),
    },
    include: {
      paciente: { select: { nombre: true, apellido: true, rut: true } },
      medioPago: { select: { nombre: true } }, medioPago2: { select: { nombre: true } },
      reciboUsuario: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_FILAS_EXPORT,
  })
  const buffer = buildXlsx(cobros, [
    { header: 'Nº', width: 8, value: (c) => c.numero },
    { header: 'Fecha creación', width: 14, value: (c) => isoDateTz(c.createdAt, tz) },
    { header: 'Fecha pago', width: 14, value: (c) => fechaMixta(c.fechaPago, tz) },
    { header: 'Paciente', width: 28, value: (c) => `${c.paciente.nombre} ${c.paciente.apellido}` },
    { header: 'RUT', width: 14, value: (c) => c.paciente.rut ?? '' },
    { header: 'Concepto', width: 32, value: (c) => c.concepto },
    { header: 'Monto', width: 12, value: (c) => clp(c.monto) },
    { header: 'Monto neto', width: 12, value: (c) => clp(c.montoNeto ?? c.monto) },
    { header: 'Comisión', width: 10, value: (c) => clp(c.comisionMonto ?? 0) },
    { header: 'Estado', width: 12, value: (c) => c.estado },
    { header: 'Medio de pago', width: 16, value: (c) => c.medioPago?.nombre ?? c.metodoPago ?? '' },
    // Pago dividido: la porción del segundo medio (el "Monto" es el total del cobro).
    { header: 'Medio 2', width: 14, value: (c) => c.medioPago2?.nombre ?? '' },
    { header: 'Monto medio 2', width: 12, value: (c) => (c.monto2 && c.monto2 > 0 ? clp(c.monto2) : '') },
    { header: 'Recibió', width: 22, value: (c) => c.reciboUsuario?.name ?? '' },
    { header: 'Notas', width: 32, value: (c) => c.notas ?? '' },
  ], 'Cobros')
  return { buffer, filenameBase: 'cobros' }
}

export async function reporteTratamientos(db: TenantClient, q: Q): Promise<ReporteResult> {
  const tz = await tzDe(db)
  const usarFechaCompletado = q.campo === 'fechaCompletado'
  // fechaCompletado es fecha-sola (evoluciones) → límites UTC; fecha (plan.) es instante → zona clínica.
  const { desde, hasta } = usarFechaCompletado ? rangoUtc(q.desde, q.hasta) : await rangoTz(db, q.desde, q.hasta)
  const filtroFecha = (desde || hasta) ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } : null
  const tratamientos = await db.tratamiento.findMany({
    where: {
      ...(q.estado ? { estado: q.estado } : {}),
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(filtroFecha ? (usarFechaCompletado ? { fechaCompletado: filtroFecha } : { fecha: filtroFecha }) : {}),
    },
    include: {
      prestacion: { select: { nombre: true, categoria: true } },
      doctor: { select: { name: true } },
      ficha: { select: { paciente: { select: { nombre: true, apellido: true, rut: true } } } },
    },
    orderBy: { fecha: 'desc' },
    take: MAX_FILAS_EXPORT,
  })
  const buffer = buildXlsx(tratamientos, [
    { header: 'Fecha plan.', width: 14, value: (t) => isoDateTz(t.fecha, tz) },
    { header: 'Fecha completado', width: 16, value: (t) => isoDate(t.fechaCompletado) }, // fecha-sola (medianoche UTC)
    { header: 'Paciente', width: 28, value: (t) => `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}` },
    { header: 'RUT', width: 14, value: (t) => t.ficha.paciente.rut ?? '' },
    { header: 'Prestación', width: 28, value: (t) => t.prestacion.nombre },
    { header: 'Categoría', width: 16, value: (t) => t.prestacion.categoria ?? '' },
    { header: 'Pieza', width: 8, value: (t) => t.diente ?? '' },
    { header: 'Cara', width: 8, value: (t) => t.cara ?? '' },
    { header: 'Doctor', width: 24, value: (t) => t.doctor?.name ?? '' },
    { header: 'Estado', width: 14, value: (t) => t.estado },
    { header: 'Precio', width: 12, value: (t) => clp(t.precio) },
    { header: 'Notas', width: 32, value: (t) => t.notas ?? '' },
  ], 'Tratamientos')
  return { buffer, filenameBase: 'tratamientos' }
}

export async function reporteLiquidaciones(db: TenantClient, q: Q): Promise<ReporteResult> {
  const tz = await tzDe(db)
  const liquidaciones = await db.liquidacion.findMany({
    where: {
      ...(q.periodo ? { periodo: q.periodo } : {}),
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    },
    include: {
      doctor: { select: { name: true, rut: true } },
      contrato: { select: { tipo: true, porcentaje: true, montoFijo: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ periodo: 'desc' }, { doctorId: 'asc' }],
  })
  const buffer = buildXlsx(liquidaciones, [
    { header: 'Periodo', width: 10, value: (l) => l.periodo },
    { header: 'Doctor', width: 28, value: (l) => l.doctor?.name ?? '' },
    { header: 'RUT doctor', width: 14, value: (l) => l.doctor?.rut ?? '' },
    { header: 'Tipo contrato', width: 14, value: (l) => l.contrato?.tipo ?? '' },
    { header: 'Porcentaje', width: 10, value: (l) => l.contrato?.porcentaje ?? '' },
    { header: 'Monto fijo', width: 12, value: (l) => clp(l.contrato?.montoFijo ?? 0) },
    { header: 'Tratamientos', width: 12, value: (l) => l._count.items },
    { header: 'Total bruto', width: 14, value: (l) => clp(l.totalBruto) },
    { header: 'Total liquidado', width: 14, value: (l) => clp(l.totalLiquidado) },
    { header: 'Estado', width: 12, value: (l) => l.estado },
    { header: 'Fecha pago', width: 14, value: (l) => fechaMixta(l.fechaPago, tz) },
    { header: 'Creada', width: 14, value: (l) => isoDateTz(l.createdAt, tz) },
    { header: 'Notas', width: 32, value: (l) => l.notas ?? '' },
  ], 'Liquidaciones')
  return { buffer, filenameBase: 'liquidaciones' }
}

// Consulta cruda de movimientos de caja. Reutilizada por el reporte XLSX y por la
// herramienta cuadre_caja del asistente.
export async function movimientosCajaDatos(db: TenantClient, q: Q) {
  const { desde, hasta } = await rangoTz(db, q.desde, q.hasta)
  const filtroFecha = (desde || hasta) ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } : null
  return db.movimientoCaja.findMany({
    where: { ...(q.cajaId ? { cajaId: q.cajaId } : {}), ...(filtroFecha ? { fecha: filtroFecha } : {}) },
    include: {
      caja: { select: { nombre: true } },
      user: { select: { name: true, email: true } },
      cobro: { select: { numero: true, medioPago: { select: { nombre: true } }, metodoPago: true, paciente: { select: { nombre: true, apellido: true } } } },
    },
    orderBy: { fecha: 'desc' },
    take: MAX_FILAS_EXPORT,
  })
}

export async function reporteCaja(db: TenantClient, q: Q): Promise<ReporteResult> {
  const tz = await tzDe(db)
  const movs = await movimientosCajaDatos(db, q)
  const buffer = buildXlsx(movs, [
    { header: 'Fecha', width: 16, value: (m) => isoDateTimeTz(m.fecha, tz) },
    { header: 'Caja', width: 18, value: (m) => m.caja.nombre },
    { header: 'Tipo', width: 10, value: (m) => m.tipo },
    { header: 'Categoría', width: 14, value: (m) => m.categoria ?? '' },
    { header: 'Descripción', width: 36, value: (m) => m.descripcion },
    { header: 'Cobro #', width: 10, value: (m) => m.cobro?.numero ?? '' },
    { header: 'Paciente', width: 26, value: (m) => m.cobro ? `${m.cobro.paciente.nombre} ${m.cobro.paciente.apellido}` : '' },
    { header: 'Monto', width: 12, value: (m) => clp(m.monto) },
    { header: 'Anulado', width: 10, value: (m) => (m.anulado ? 'Sí' : '') },
    { header: 'Motivo anulación', width: 30, value: (m) => m.motivoAnulacion ?? '' },
    { header: 'Registrado por', width: 22, value: (m) => m.user.name ?? m.user.email ?? '' },
  ], 'Caja')
  return { buffer, filenameBase: 'movimientos-caja' }
}

export interface MorosoRow {
  paciente: { id: string; nombre: string; apellido: string; rut: string | null; telefono: string | null; email: string | null }
  montoTotal: number; cobrosCount: number; cobroMasAntiguo: Date; diasMora: number
}

// Definición de negocio "moroso": paciente con cobros en estado PENDIENTE.
// Agrupa por paciente, suma el monto adeudado y calcula los días de mora desde
// el cobro pendiente más antiguo. Reutilizada por el reporte XLSX y por las
// herramientas pacientes_inactivos_con_saldo del asistente.
export async function morososDatos(db: TenantClient, diasMin = 0): Promise<MorosoRow[]> {
  const cobros = await db.cobro.findMany({
    where: { estado: 'PENDIENTE', anulado: false },
    include: { paciente: { select: { id: true, nombre: true, apellido: true, rut: true, telefono: true, email: true } } },
  })
  const ahora = Date.now()
  const porPaciente = new Map<string, Omit<MorosoRow, 'diasMora'>>()
  for (const c of cobros) {
    const prev = porPaciente.get(c.paciente.id)
    if (prev) {
      prev.montoTotal += c.monto
      prev.cobrosCount += 1
      if (c.createdAt < prev.cobroMasAntiguo) prev.cobroMasAntiguo = c.createdAt
    } else {
      porPaciente.set(c.paciente.id, { paciente: c.paciente, montoTotal: c.monto, cobrosCount: 1, cobroMasAntiguo: c.createdAt })
    }
  }
  return Array.from(porPaciente.values())
    .map((r) => ({ ...r, diasMora: Math.floor((ahora - r.cobroMasAntiguo.getTime()) / (1000 * 60 * 60 * 24)) }))
    .filter((r) => r.diasMora >= diasMin)
    .sort((a, b) => b.diasMora - a.diasMora)
}

export async function reporteMorosos(db: TenantClient, q: Q): Promise<ReporteResult> {
  const tz = await tzDe(db)
  // diasMin no numérico → 0 (antes NaN filtraba TODO y el Excel salía vacío sin aviso).
  const diasMin = Number(q.diasMin ?? 0)
  const rows = await morososDatos(db, Number.isFinite(diasMin) ? diasMin : 0)
  const buffer = buildXlsx(rows, [
    { header: 'Paciente', width: 28, value: (r) => `${r.paciente.nombre} ${r.paciente.apellido}` },
    { header: 'RUT', width: 14, value: (r) => formatRUT(r.paciente.rut) },
    { header: 'Teléfono', width: 16, value: (r) => r.paciente.telefono ?? '' },
    { header: 'Correo', width: 28, value: (r) => r.paciente.email ?? '' },
    { header: 'Cobros pendientes', width: 14, value: (r) => r.cobrosCount },
    { header: 'Monto adeudado', width: 16, value: (r) => clp(r.montoTotal) },
    { header: 'Cobro más antiguo', width: 16, value: (r) => isoDateTz(r.cobroMasAntiguo, tz) },
    { header: 'Días mora', width: 12, value: (r) => r.diasMora },
  ], 'Morosos')
  return { buffer, filenameBase: 'morosos' }
}
