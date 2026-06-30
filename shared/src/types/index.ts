// DTOs compartidos entre frontend y backend. Son la forma serializada (JSON)
// que viaja por la API — NO los modelos Prisma (que viven solo en el backend).

export type Rol = 'admin' | 'doctor' | 'staff'

export interface SessionUserDTO {
  id: string
  name: string | null
  email: string | null
  role: Rol | string
  clinicaId: string | null
  isPlatformAdmin: boolean
  requirePasswordChange: boolean
  permisos: {
    puedeModificarPrecio: boolean
    puedeAplicarDescuento: boolean
    puedeRevertirCompletado: boolean
    puedeEditarPagos: boolean
    puedeGestionarLiquidaciones: boolean
  }
}

export interface LoginRequest {
  // Clínica: slug + username; super-admin / legacy: email.
  slug?: string
  username?: string
  email?: string
  password: string
}

export interface LoginResponse {
  token: string
  user: SessionUserDTO
}

export interface PacienteDTO {
  id: string
  numero: number | null
  rut: string | null
  otroDocId: string | null
  nombre: string
  apellido: string
  nombreSocial: string | null
  telefono: string | null
  email: string | null
  prevision: string | null
  fechaNacimiento: string | null
  sexo: string | null
  direccion: string | null
  actividad: string | null
  apoderado: string | null
  rutApoderado: string | null
  contactoEmergencia: string | null
  telefonoEmergencia: string | null
  observaciones: string | null
  activo: boolean
}

// Resultado paginado de la lista de pacientes (la sección /pacientes).
export interface PacientesPagina {
  items: PacienteDTO[]
  total: number
  page: number
  pageSize: number
}

// ── Liquidaciones (saldo corriente por profesional) ──────────────────────────
export interface LiquidacionAccion {
  tratamientoId: string
  pacienteNombre: string
  accion: string
  pieza: string | null
  fecha: string
  monto: number          // precio neto de la acción
  montoPagado: number    // lo que el paciente pagó
  comision: number       // comisión del medio de pago (proporcional)
  medioPago: string
  total: number          // pago al profesional por esta acción
  pagada: boolean        // true = verde (suma a "A pagar"); false = rojo (pendiente)
}
export interface LiquidacionActivaDetalle {
  doctor: { id: string; name: string | null; email: string | null; rut: string | null; especialidad: string | null }
  contrato: { tipo: string; porcentaje: number | null; montoFijo: number | null } | null
  items: LiquidacionAccion[]
  realizado: number      // total de TODAS las acciones (pagadas + pendientes)
  aPagar: number         // total solo de las acciones pagadas (verde)
}
export interface LiquidacionActivaResumen {
  doctorId: string
  doctor: string
  especialidad: string | null
  acciones: number
  pendientes: number
  realizado: number
  aPagar: number
}
export interface LiquidacionAdjuntoMeta {
  id: string
  tipo: string            // FACTURA | COMPROBANTE
  nombre: string
  mime: string
  size: number
  subidoPorNombre: string | null
  createdAt: string
}

export interface CitaDTO {
  id: string
  pacienteId: string
  pacienteNombre: string
  pacienteRut: string | null
  pacienteTelefono: string | null
  doctorId: string
  doctor: string | null
  inicio: string  // ISO
  fin: string     // ISO
  estado: string
  tipo: string
  notas: string
  sobrecupo: boolean
  confirmadoWA: boolean
}

export interface DoctorDTO {
  id: string
  name: string | null
  email: string | null
  especialidad: string | null
}

export interface UsuarioDTO {
  id: string
  name: string | null
  username: string | null
  email: string | null
  role: string
  rut: string | null
  especialidad: string | null
  telefono: string | null
  activo: boolean
  puedeRecibirPagos?: boolean
  puedeModificarPrecio?: boolean
  puedeAplicarDescuento?: boolean
  puedeRevertirCompletado?: boolean
  puedeEditarPagos?: boolean
  puedeGestionarLiquidaciones?: boolean
  googleCalendarId?: string | null
  createdAt: string
}

export interface HorarioDTO {
  id: string
  doctorId: string
  diaSemana: number
  horaInicio: string
  horaFin: string
  activo: boolean
  recesoActivo: boolean
  recesoInicio: string | null
  recesoFin: string | null
  sobrecupoActivo: boolean
  sobrecupoInicio: string | null
  sobrecupoFin: string | null
}

export interface BloqueoDTO {
  id: string
  doctorId: string
  doctor: string | null
  inicio: string
  fin: string
  motivo: string | null
  createdByName: string | null
}

export interface PrestacionDTO {
  id: string
  nombre: string
  descripcion: string | null
  precio: number
  duracion: number
  categoria: string | null
  activo: boolean
}

export interface ClinicaConfigDTO {
  id: string
  nombre: string
  direccion: string
  telefono: string
  email: string
  ciudad: string
  mensajeWA: string
  logoUrl: string | null
}

export interface ApiError {
  error: string
}
