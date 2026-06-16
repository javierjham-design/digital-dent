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
