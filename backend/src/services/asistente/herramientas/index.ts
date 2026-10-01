// Registro de herramientas del asistente (etapa 1: 9 herramientas de solo lectura).
// El orquestador filtra este registro por los permisos del usuario antes de
// llamar al modelo, y el marco vuelve a verificar al ejecutar.
import type { Herramienta } from '../tipos'
import { buscarPaciente, fichaResumen, pacientesSinProximaCita } from './pacientes'
import { planesSinPago, planesSinEjecucion } from './planes'
import { pacientesInactivosConSaldo, produccionPorProfesional, cuadreCaja } from './finanzas'
import { ocupacionAgenda } from './agenda'
import { embudoCrm } from './crm'
import { consultarMetricas } from './metricas'

export const REGISTRO: Herramienta[] = [
  buscarPaciente,
  fichaResumen,
  pacientesSinProximaCita,
  planesSinPago,
  planesSinEjecucion,
  pacientesInactivosConSaldo,
  produccionPorProfesional,
  cuadreCaja,
  ocupacionAgenda,
  embudoCrm,
  consultarMetricas,
]

export function herramientaPorNombre(nombre: string): Herramienta | undefined {
  return REGISTRO.find((h) => h.nombre === nombre)
}
