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
