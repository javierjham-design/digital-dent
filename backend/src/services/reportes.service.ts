import { prisma } from '@/lib/prisma'
import { buildXlsx, clp, formatRUT, isoDate, isoDateTime, parseDateRange } from '@/lib/excel'

// Cada reporte devuelve { buffer, filenameBase }; el controller arma la
// respuesta HTTP de descarga. Misma lógica de filtros que el monolito.

export interface ReporteResult { buffer: Buffer; filenameBase: string }

type Q = Record<string, string | undefined>

export async function reportePacientes(clinicaId: string, q: Q): Promise<ReporteResult> {
  const { desde, hasta } = parseDateRange(q.desde, q.hasta)
  const soloActivos = q.soloActivos === '1'
  const pacientes = await prisma.paciente.findMany({
    where: {
      clinicaId,
      ...(soloActivos ? { activo: true } : {}),
      ...(desde || hasta ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
    },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
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
    { header: 'Creado', width: 12, value: (p) => isoDate(p.createdAt) },
  ], 'Pacientes')
  return { buffer, filenameBase: 'pacientes' }
}

export async function reporteCitas(clinicaId: string, q: Q): Promise<ReporteResult> {
  const { desde, hasta } = parseDateRange(q.desde, q.hasta)
  const citas = await prisma.cita.findMany({
    where: {
      clinicaId,
      ...(desde || hasta ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } } : {}),
      ...(q.estado ? { estado: q.estado } : {}),
    },
    include: { paciente: { select: { nombre: true, apellido: true, rut: true, telefono: true } }, doctor: { select: { name: true } } },
    orderBy: { fecha: 'asc' },
  })
  const buffer = buildXlsx(citas, [
    { header: 'Fecha', width: 12, value: (c) => isoDate(c.fecha) },
    { header: 'Hora', width: 8, value: (c) => isoDateTime(c.fecha).slice(11) },
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

export async function reporteCobros(clinicaId: string, q: Q): Promise<ReporteResult> {
  const { desde, hasta } = parseDateRange(q.desde, q.hasta)
  const usarFechaPago = q.campo === 'fechaPago'
  const filtroFecha = (desde || hasta) ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } : null
  const cobros = await prisma.cobro.findMany({
    where: {
      clinicaId,
      ...(q.estado ? { estado: q.estado } : {}),
      ...(filtroFecha ? (usarFechaPago ? { fechaPago: filtroFecha } : { createdAt: filtroFecha }) : {}),
    },
    include: { paciente: { select: { nombre: true, apellido: true, rut: true } }, medioPago: { select: { nombre: true } }, reciboUsuario: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const buffer = buildXlsx(cobros, [
    { header: 'Nº', width: 8, value: (c) => c.numero },
    { header: 'Fecha creación', width: 14, value: (c) => isoDate(c.createdAt) },
    { header: 'Fecha pago', width: 14, value: (c) => isoDate(c.fechaPago) },
    { header: 'Paciente', width: 28, value: (c) => `${c.paciente.nombre} ${c.paciente.apellido}` },
    { header: 'RUT', width: 14, value: (c) => c.paciente.rut ?? '' },
    { header: 'Concepto', width: 32, value: (c) => c.concepto },
    { header: 'Monto', width: 12, value: (c) => clp(c.monto) },
    { header: 'Monto neto', width: 12, value: (c) => clp(c.montoNeto ?? c.monto) },
    { header: 'Comisión', width: 10, value: (c) => clp(c.comisionMonto ?? 0) },
    { header: 'Estado', width: 12, value: (c) => c.estado },
    { header: 'Medio de pago', width: 16, value: (c) => c.medioPago?.nombre ?? c.metodoPago ?? '' },
    { header: 'Recibió', width: 22, value: (c) => c.reciboUsuario?.name ?? '' },
    { header: 'Notas', width: 32, value: (c) => c.notas ?? '' },
  ], 'Cobros')
  return { buffer, filenameBase: 'cobros' }
}

export async function reporteTratamientos(clinicaId: string, q: Q): Promise<ReporteResult> {
  const { desde, hasta } = parseDateRange(q.desde, q.hasta)
  const usarFechaCompletado = q.campo === 'fechaCompletado'
  const filtroFecha = (desde || hasta) ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } : null
  const tratamientos = await prisma.tratamiento.findMany({
    where: {
      clinicaId,
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
  })
  const buffer = buildXlsx(tratamientos, [
    { header: 'Fecha plan.', width: 14, value: (t) => isoDate(t.fecha) },
    { header: 'Fecha completado', width: 16, value: (t) => isoDate(t.fechaCompletado) },
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

export async function reporteLiquidaciones(clinicaId: string, q: Q): Promise<ReporteResult> {
  const liquidaciones = await prisma.liquidacion.findMany({
    where: {
      clinicaId,
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
    { header: 'Fecha pago', width: 14, value: (l) => isoDate(l.fechaPago) },
    { header: 'Creada', width: 14, value: (l) => isoDate(l.createdAt) },
    { header: 'Notas', width: 32, value: (l) => l.notas ?? '' },
  ], 'Liquidaciones')
  return { buffer, filenameBase: 'liquidaciones' }
}

export async function reporteCaja(clinicaId: string, q: Q): Promise<ReporteResult> {
  const { desde, hasta } = parseDateRange(q.desde, q.hasta)
  const filtroFecha = (desde || hasta) ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } : null
  const movs = await prisma.movimientoCaja.findMany({
    where: { clinicaId, ...(q.cajaId ? { cajaId: q.cajaId } : {}), ...(filtroFecha ? { fecha: filtroFecha } : {}) },
    include: {
      caja: { select: { nombre: true } },
      user: { select: { name: true, email: true } },
      cobro: { select: { numero: true, paciente: { select: { nombre: true, apellido: true } } } },
    },
    orderBy: { fecha: 'desc' },
  })
  const buffer = buildXlsx(movs, [
    { header: 'Fecha', width: 16, value: (m) => isoDate(m.fecha) },
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

export async function reporteMorosos(clinicaId: string, q: Q): Promise<ReporteResult> {
  const diasMin = Number(q.diasMin ?? 0)
  const cobros = await prisma.cobro.findMany({
    where: { clinicaId, estado: 'PENDIENTE' },
    include: { paciente: { select: { id: true, nombre: true, apellido: true, rut: true, telefono: true, email: true } } },
  })
  const ahora = Date.now()
  const porPaciente = new Map<string, {
    paciente: { id: string; nombre: string; apellido: string; rut: string | null; telefono: string | null; email: string | null }
    montoTotal: number; cobrosCount: number; cobroMasAntiguo: Date
  }>()
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
  const rows = Array.from(porPaciente.values())
    .map((r) => ({ ...r, diasMora: Math.floor((ahora - r.cobroMasAntiguo.getTime()) / (1000 * 60 * 60 * 24)) }))
    .filter((r) => r.diasMora >= diasMin)
    .sort((a, b) => b.diasMora - a.diasMora)
  const buffer = buildXlsx(rows, [
    { header: 'Paciente', width: 28, value: (r) => `${r.paciente.nombre} ${r.paciente.apellido}` },
    { header: 'RUT', width: 14, value: (r) => formatRUT(r.paciente.rut) },
    { header: 'Teléfono', width: 16, value: (r) => r.paciente.telefono ?? '' },
    { header: 'Correo', width: 28, value: (r) => r.paciente.email ?? '' },
    { header: 'Cobros pendientes', width: 14, value: (r) => r.cobrosCount },
    { header: 'Monto adeudado', width: 16, value: (r) => clp(r.montoTotal) },
    { header: 'Cobro más antiguo', width: 16, value: (r) => isoDate(r.cobroMasAntiguo) },
    { header: 'Días mora', width: 12, value: (r) => r.diasMora },
  ], 'Morosos')
  return { buffer, filenameBase: 'morosos' }
}
