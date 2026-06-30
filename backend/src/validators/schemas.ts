import { z } from 'zod'

export const loginSchema = z.object({
  slug: z.string().optional(),
  username: z.string().optional(),
  email: z.string().email().optional(),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export const crearPacienteSchema = z.object({
  nombre: z.string().min(1, 'Nombre obligatorio'),
  apellido: z.string().min(1, 'Apellido obligatorio'),
  rut: z.string().nullish(),
  otroDocId: z.string().nullish(),
  telefono: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal('')),
  prevision: z.string().nullish(),
})

export const crearCitaSchema = z.object({
  pacienteId: z.string().min(1),
  doctorId: z.string().min(1),
  fecha: z.string().min(1),
  duracion: z.number().int().positive().optional(),
  tipo: z.string().optional(),
  notas: z.string().nullish(),
  sobrecupo: z.boolean().optional(),
})

export const cambiarEstadoSchema = z.object({
  estado: z.string().min(1),
})

export const editarCitaSchema = z.object({
  fecha: z.string().optional(),
  duracion: z.number().int().positive().optional(),
  doctorId: z.string().optional(),
  tipo: z.string().optional(),
  notas: z.string().nullish(),
  sobrecupo: z.boolean().optional(),
})

export const crearUsuarioSchema = z.object({
  name: z.string().min(1, 'Falta el nombre'),
  username: z.string().min(2),
  password: z.string().min(8, 'Password debe tener al menos 8 caracteres'),
  role: z.string().optional(),
  email: z.string().email().nullish().or(z.literal('')),
  rut: z.string().nullish(),
  especialidad: z.string().nullish(),
  telefono: z.string().nullish(),
})

const diaHorarioSchema = z.object({
  diaSemana: z.number().int().min(0).max(6),
  horaInicio: z.string(),
  horaFin: z.string(),
  activo: z.boolean(),
  recesoActivo: z.boolean().optional(),
  recesoInicio: z.string().nullish(),
  recesoFin: z.string().nullish(),
  sobrecupoActivo: z.boolean().optional(),
  sobrecupoInicio: z.string().nullish(),
  sobrecupoFin: z.string().nullish(),
})

export const guardarHorariosSchema = z.object({
  doctorId: z.string().min(1),
  days: z.array(diaHorarioSchema),
})

export const crearBloqueoSchema = z.object({
  doctorId: z.string().min(1),
  inicio: z.string().min(1),
  fin: z.string().min(1),
  motivo: z.string().optional(),
})

export const crearPrestacionSchema = z.object({
  nombre: z.string().min(1),
  categoria: z.string().nullish(),
  precio: z.number().nonnegative(),
  descripcion: z.string().nullish(),
  duracion: z.number().int().positive().optional(),
})

export const crearPlanSchema = z.object({
  pacienteId: z.string().min(1),
  nombre: z.string().optional(),
  notas: z.string().optional(),
  fechaInicio: z.string().optional(),
  doctorTitularId: z.string().optional(),
})

export const crearSeccionSchema = z.object({
  titulo: z.string().optional(),
  fechaTentativa: z.string().optional(),
  diasDesdeAnterior: z.number().int().optional(),
  notas: z.string().optional(),
})

export const crearTratamientoSchema = z.object({
  pacienteId: z.string().min(1),
  prestacionId: z.string().min(1),
  piezas: z.array(z.number().int()).optional(),
  zona: z.string().optional(),
  cara: z.string().optional(),
  precio: z.number().optional(),
  notas: z.string().optional(),
  planId: z.string().optional(),
  seccionId: z.string().optional(),
  descuento: z.number().optional(),
})

export const crearEvolucionSchema = z.object({
  pacienteId: z.string().min(1),
  tratamientoId: z.string().optional(),
  texto: z.string().min(1),
  fecha: z.string().optional(),
})

// Evolucionar una acción del plan: marca COMPLETADO + (opcional) cambia el
// profesional que la realiza + deja la evolución en la ficha clínica.
export const evolucionarTratamientoSchema = z.object({
  texto: z.string().min(1),
  profesionalId: z.string().optional(),
  fecha: z.string().optional(),
})

export const upsertDienteSchema = z.object({
  pacienteId: z.string().optional(),
  fichaId: z.string().optional(),
  numero: z.number().int(),
  estado: z.string(),
})

export const crearPresupuestoSchema = z.object({
  pacienteId: z.string().min(1),
  total: z.number().nonnegative(),
  items: z.array(z.object({
    prestacionId: z.string().min(1),
    cantidad: z.number().int().positive(),
    precioUnitario: z.number().nonnegative(),
    descuento: z.number().optional(),
    subtotal: z.number().nonnegative(),
  })).min(1, 'Agrega al menos un ítem'),
})

// ── Caja / Cobros / Liquidaciones ──
export const crearCajaSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().optional(),
  saldoInicial: z.number().optional(),
  usuarioIds: z.array(z.string()).optional(),
})

export const abrirCajaSchema = z.object({
  saldoApertura: z.union([z.number(), z.string(), z.null()]).optional(),
})

export const cerrarCajaSchema = z.object({
  saldoReal: z.number(),
  observaciones: z.string().optional(),
})

export const crearMovimientoSchema = z.object({
  tipo: z.enum(['INGRESO', 'EGRESO']).optional(),
  monto: z.number(),
  descripcion: z.string().min(1),
  categoria: z.string().optional(),
  fecha: z.string().optional(),
})

export const motivoSchema = z.object({
  motivo: z.string().min(4, 'Debes indicar un motivo (mínimo 4 caracteres).'),
})

export const crearCobroSchema = z.object({
  pacienteId: z.string().min(1),
  cajaId: z.string().min(1),
  medioPagoId: z.string().optional(),
  reciboUsuarioId: z.string().optional(),
  fechaPago: z.string().optional(),
  notas: z.string().optional(),
  numeroReferencia: z.string().optional(),
  numeroBoleta: z.string().optional(),
  items: z.array(z.object({
    tratamientoId: z.string().optional(),
    planId: z.string().optional(),
    descripcion: z.string().min(1),
    monto: z.number(),
  })).min(1, 'Agrega al menos un item.'),
})

export const derivarAbonoSchema = z.object({
  fromPlanId: z.string().min(1),
  toPlanId: z.string().min(1),
  monto: z.number().optional(),
})

export const crearContratoSchema = z.object({
  doctorId: z.string().min(1),
  tipo: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
  porcentaje: z.number().nullish(),
  montoFijo: z.number().nullish(),
  descripcion: z.string().nullish(),
  fechaInicio: z.string().nullish(),
  fechaFin: z.string().nullish(),
})

export const crearLinkSchema = z.object({
  nombre: z.string().min(1, 'Falta el nombre'),
  descripcion: z.string().nullish(),
  doctorId: z.string().optional(),
  profesionales: z.array(z.string()).optional(),
  tipoCita: z.string().optional(),
  duracionMin: z.number().optional(),
  usaHorarioDoctor: z.boolean().optional(),
  anticipacionHoras: z.number().optional(),
  diasMaxFuturo: z.number().optional(),
  mensajeConfirmacion: z.string().nullish(),
  color: z.string().nullish(),
  ventanas: z.array(z.object({
    diaSemana: z.number().int().min(0).max(6),
    horaInicio: z.string(),
    horaFin: z.string(),
  })).optional(),
})

export const reservarOnlineSchema = z.object({
  inicio: z.string().min(1),
  doctorId: z.string().optional(),
  nombre: z.string().min(1),
  apellido: z.string().min(1),
  telefono: z.string().min(1),
  email: z.string().optional(),
  rut: z.string().optional(),
  motivo: z.string().optional(),
})

export const crearLiquidacionSchema = z.object({
  doctorId: z.string().min(1),
  periodo: z.string().regex(/^\d{4}-\d{2}$/, 'periodo debe ser YYYY-MM'),
})
