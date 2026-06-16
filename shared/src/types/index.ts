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
  nombre: string
  apellido: string
  telefono: string | null
  email: string | null
  prevision: string | null
  fechaNacimiento: string | null
  activo: boolean
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

export interface ApiError {
  error: string
}
