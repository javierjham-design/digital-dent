import { Router } from 'express'
import { asyncHandler } from '@/middlewares/async-handler'
import { requireAuth, requireClinica } from '@/middlewares/auth'
import { getMe, postLogin } from '@/controllers/auth.controller'
import { getPacientes, getPaciente, postPaciente } from '@/controllers/pacientes.controller'
import { getCitas, postCita, patchEstado } from '@/controllers/citas.controller'

// Router raíz de la API v1. Cada dominio agrupa sus endpoints.
export const apiRouter = Router()

// ── Auth ───────────────────────────────────────────────────────────────────
apiRouter.post('/auth/login', asyncHandler(postLogin))
apiRouter.get('/auth/me', requireAuth, asyncHandler(getMe))

// ── Pacientes (scope clínica) ────────────────────────────────────────────────
apiRouter.get('/pacientes', requireAuth, requireClinica, asyncHandler(getPacientes))
apiRouter.get('/pacientes/:id', requireAuth, requireClinica, asyncHandler(getPaciente))
apiRouter.post('/pacientes', requireAuth, requireClinica, asyncHandler(postPaciente))

// ── Citas / Agenda (scope clínica) ───────────────────────────────────────────
apiRouter.get('/citas', requireAuth, requireClinica, asyncHandler(getCitas))
apiRouter.post('/citas', requireAuth, requireClinica, asyncHandler(postCita))
apiRouter.patch('/citas/:id/estado', requireAuth, requireClinica, asyncHandler(patchEstado))
