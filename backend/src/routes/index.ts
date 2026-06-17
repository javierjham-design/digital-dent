import { Router } from 'express'
import { asyncHandler } from '@/middlewares/async-handler'
import { requireAuth, requireClinica, requireAdmin } from '@/middlewares/auth'
import { getMe, postLogin } from '@/controllers/auth.controller'
import { getPacientes, getPaciente, postPaciente } from '@/controllers/pacientes.controller'
import { getCitas, postCita, patchCita, deleteCita, patchEstado } from '@/controllers/citas.controller'
import { getUsuarios, getDoctores, postUsuario, patchUsuario } from '@/controllers/usuarios.controller'
import { getHorarios, postHorarios, getBloqueos, postBloqueo, patchBloqueo, deleteBloqueo } from '@/controllers/agenda.controller'
import {
  getPrestaciones, postPrestacion, patchPrestacion, deletePrestacion,
  getMediosPago, postMedioPago, patchMedioPago, deleteMedioPago,
  getClinica, patchClinica,
} from '@/controllers/catalogo.controller'
import * as clinico from '@/controllers/clinico.controller'
import * as presupuestos from '@/controllers/presupuestos.controller'

// Router raíz de la API v1. Cada dominio agrupa sus endpoints.
export const apiRouter = Router()

// Middlewares reutilizables para rutas con scope de clínica.
const clinica = [requireAuth, requireClinica]
const adminClinica = [requireAuth, requireClinica, requireAdmin]

// ── Auth ───────────────────────────────────────────────────────────────────
apiRouter.post('/auth/login', asyncHandler(postLogin))
apiRouter.get('/auth/me', requireAuth, asyncHandler(getMe))

// ── Pacientes ────────────────────────────────────────────────────────────────
apiRouter.get('/pacientes', clinica, asyncHandler(getPacientes))
apiRouter.get('/pacientes/:id', clinica, asyncHandler(getPaciente))
apiRouter.post('/pacientes', clinica, asyncHandler(postPaciente))

// ── Citas / Agenda ───────────────────────────────────────────────────────────
apiRouter.get('/citas', clinica, asyncHandler(getCitas))
apiRouter.post('/citas', clinica, asyncHandler(postCita))
apiRouter.patch('/citas/:id', clinica, asyncHandler(patchCita))
apiRouter.delete('/citas/:id', clinica, asyncHandler(deleteCita))
apiRouter.patch('/citas/:id/estado', clinica, asyncHandler(patchEstado))

// ── Equipo / Usuarios ────────────────────────────────────────────────────────
apiRouter.get('/usuarios', clinica, asyncHandler(getUsuarios))
apiRouter.get('/doctores', clinica, asyncHandler(getDoctores))
apiRouter.post('/usuarios', adminClinica, asyncHandler(postUsuario))
apiRouter.patch('/usuarios/:id', clinica, asyncHandler(patchUsuario)) // self o admin (validado en service)

// ── Horarios ─────────────────────────────────────────────────────────────────
apiRouter.get('/horarios', clinica, asyncHandler(getHorarios))
apiRouter.post('/horarios', clinica, asyncHandler(postHorarios))

// ── Bloqueos de agenda ───────────────────────────────────────────────────────
apiRouter.get('/bloqueos', clinica, asyncHandler(getBloqueos))
apiRouter.post('/bloqueos', clinica, asyncHandler(postBloqueo))
apiRouter.patch('/bloqueos/:id', clinica, asyncHandler(patchBloqueo))
apiRouter.delete('/bloqueos/:id', clinica, asyncHandler(deleteBloqueo))

// ── Prestaciones ─────────────────────────────────────────────────────────────
apiRouter.get('/prestaciones', clinica, asyncHandler(getPrestaciones))
apiRouter.post('/prestaciones', clinica, asyncHandler(postPrestacion))
apiRouter.patch('/prestaciones/:id', clinica, asyncHandler(patchPrestacion))
apiRouter.delete('/prestaciones/:id', clinica, asyncHandler(deletePrestacion))

// ── Medios de pago ───────────────────────────────────────────────────────────
apiRouter.get('/medios-pago', clinica, asyncHandler(getMediosPago))
apiRouter.post('/medios-pago', clinica, asyncHandler(postMedioPago))
apiRouter.patch('/medios-pago/:id', clinica, asyncHandler(patchMedioPago))
apiRouter.delete('/medios-pago/:id', clinica, asyncHandler(deleteMedioPago))

// ── Configuración de la clínica ──────────────────────────────────────────────
apiRouter.get('/clinica', clinica, asyncHandler(getClinica))
apiRouter.patch('/clinica', adminClinica, asyncHandler(patchClinica))

// ── Clínico: planes de tratamiento ───────────────────────────────────────────
apiRouter.get('/planes-tratamiento', clinica, asyncHandler(clinico.getPlanes))
apiRouter.post('/planes-tratamiento', clinica, asyncHandler(clinico.postPlan))
apiRouter.get('/planes-tratamiento/:id', clinica, asyncHandler(clinico.getPlan))
apiRouter.patch('/planes-tratamiento/:id', clinica, asyncHandler(clinico.patchPlan))
apiRouter.delete('/planes-tratamiento/:id', clinica, asyncHandler(clinico.deletePlan))
apiRouter.post('/planes-tratamiento/:id/secciones', clinica, asyncHandler(clinico.postSeccion))

// ── Clínico: secciones ───────────────────────────────────────────────────────
apiRouter.patch('/secciones-plan/:id', clinica, asyncHandler(clinico.patchSeccion))
apiRouter.delete('/secciones-plan/:id', clinica, asyncHandler(clinico.deleteSeccion))

// ── Clínico: tratamientos (acciones) ─────────────────────────────────────────
apiRouter.post('/tratamientos', clinica, asyncHandler(clinico.postTratamiento))
apiRouter.patch('/tratamientos/:id', clinica, asyncHandler(clinico.patchTratamiento))
apiRouter.delete('/tratamientos/:id', clinica, asyncHandler(clinico.deleteTratamiento))

// ── Clínico: evoluciones ─────────────────────────────────────────────────────
apiRouter.get('/evoluciones', clinica, asyncHandler(clinico.getEvoluciones))
apiRouter.post('/evoluciones', clinica, asyncHandler(clinico.postEvolucion))
apiRouter.delete('/evoluciones/:id', clinica, asyncHandler(clinico.deleteEvolucion))

// ── Clínico: odontograma ─────────────────────────────────────────────────────
apiRouter.post('/odontograma', clinica, asyncHandler(clinico.postDiente))

// ── Presupuestos ─────────────────────────────────────────────────────────────
apiRouter.get('/presupuestos', clinica, asyncHandler(presupuestos.getPresupuestos))
apiRouter.get('/presupuestos/:id', clinica, asyncHandler(presupuestos.getPresupuesto))
apiRouter.post('/presupuestos', clinica, asyncHandler(presupuestos.postPresupuesto))
apiRouter.patch('/presupuestos/:id', clinica, asyncHandler(presupuestos.patchPresupuesto))
