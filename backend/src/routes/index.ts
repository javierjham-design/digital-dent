import { Router } from 'express'
import multer from 'multer'
import { asyncHandler } from '@/middlewares/async-handler'
import { requireAuth, requireClinica, requireAdmin } from '@/middlewares/auth'
import { requireTenant } from '@/middlewares/tenant'
import { getMe, postLogin, postCambiarPassword } from '@/controllers/auth.controller'
import {
  getPacientes, getPaciente, postPaciente, patchPaciente, getFicha, putFicha,
  getComentarios, postComentario, getMensajes, postMensaje, getResumen,
  getExport, getTemplate, postImport,
} from '@/controllers/pacientes.controller'
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
import * as caja from '@/controllers/caja.controller'
import * as cobros from '@/controllers/cobros.controller'
import * as liq from '@/controllers/liquidaciones.controller'
import * as reportes from '@/controllers/reportes.controller'
import * as admin from '@/controllers/admin.controller'
import * as demo from '@/controllers/demo.controller'
import * as whatsapp from '@/controllers/whatsapp.controller'
import * as googlec from '@/controllers/google.controller'
import { getPlanesPublicos } from '@/controllers/public.controller'
import { requireSuperAdmin } from '@/middlewares/auth'

// Router raíz de la API v1. Cada dominio agrupa sus endpoints.
export const apiRouter = Router()

// Middlewares reutilizables para rutas con scope de clínica.
// `clinica`/`adminClinica`: modelo viejo (DB compartida) — quedan en los dominios
// aún no convertidos. `tenant`/`adminTenant`: modelo database-per-tenant
// (resuelve req.tenant). A medida que se convierten los dominios, sus rutas
// pasan de `clinica` a `tenant`.
const clinica = [requireAuth, requireClinica]
const adminClinica = [requireAuth, requireClinica, requireAdmin]
const tenant = [requireAuth, requireTenant]
const adminTenant = [requireAuth, requireTenant, requireAdmin]

// Subida de archivos en memoria (import de pacientes XLSX, máx 5MB).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// ── Auth ───────────────────────────────────────────────────────────────────
apiRouter.post('/auth/login', asyncHandler(postLogin))
apiRouter.get('/auth/me', requireAuth, asyncHandler(getMe))
apiRouter.post('/auth/cambiar-password', requireAuth, asyncHandler(postCambiarPassword))

// ── Público: catálogo de planes para la landing ──────────────────────────────
apiRouter.get('/planes', asyncHandler(getPlanesPublicos))

// ── Público: demo + webhook WhatsApp (auth interna propia) ───────────────────
apiRouter.post('/demo', asyncHandler(demo.postDemo))
apiRouter.post('/demo/cleanup', asyncHandler(demo.postDemoCleanup))
apiRouter.post('/whatsapp/webhook', asyncHandler(whatsapp.postWebhook))
apiRouter.post('/whatsapp/recordatorios', asyncHandler(whatsapp.postRecordatorios))
// Google: sync acepta cron-secret (sin sesión); callback es redirect público.
apiRouter.get('/google/callback', asyncHandler(googlec.getCallback))
apiRouter.post('/google/sync', asyncHandler(googlec.postSync))

// ── Google Calendar (sesión de clínica) ──────────────────────────────────────
apiRouter.get('/google/connect', clinica, asyncHandler(googlec.getConnect))
apiRouter.post('/google/disconnect', clinica, asyncHandler(googlec.postDisconnect))
apiRouter.get('/google/calendars', clinica, asyncHandler(googlec.getCalendars))
apiRouter.post('/google/reconcile-bloqueos', clinica, asyncHandler(googlec.postReconcileBloqueos))

// ── Pacientes (convertido a database-per-tenant) ─────────────────────────────
apiRouter.get('/pacientes', tenant, asyncHandler(getPacientes))
// Rutas estáticas ANTES de /pacientes/:id (si no, ":id" captura export/template/import).
apiRouter.get('/pacientes/export', tenant, asyncHandler(getExport))
apiRouter.get('/pacientes/template', tenant, asyncHandler(getTemplate))
apiRouter.post('/pacientes/import', adminTenant, upload.single('file'), asyncHandler(postImport))
apiRouter.post('/pacientes', tenant, asyncHandler(postPaciente))
apiRouter.get('/pacientes/:id', tenant, asyncHandler(getPaciente))
apiRouter.patch('/pacientes/:id', tenant, asyncHandler(patchPaciente))
apiRouter.get('/pacientes/:id/ficha', tenant, asyncHandler(getFicha))
apiRouter.put('/pacientes/:id/ficha', tenant, asyncHandler(putFicha))
apiRouter.get('/pacientes/:id/comentarios', tenant, asyncHandler(getComentarios))
apiRouter.post('/pacientes/:id/comentarios', tenant, asyncHandler(postComentario))
apiRouter.get('/pacientes/:id/mensajes', tenant, asyncHandler(getMensajes))
apiRouter.post('/pacientes/:id/mensajes', tenant, asyncHandler(postMensaje))
apiRouter.get('/pacientes/:id/resumen', tenant, asyncHandler(getResumen))

// ── Citas / Agenda (convertido a database-per-tenant) ────────────────────────
apiRouter.get('/citas', tenant, asyncHandler(getCitas))
apiRouter.post('/citas', tenant, asyncHandler(postCita))
apiRouter.patch('/citas/:id', tenant, asyncHandler(patchCita))
apiRouter.delete('/citas/:id', tenant, asyncHandler(deleteCita))
apiRouter.patch('/citas/:id/estado', tenant, asyncHandler(patchEstado))

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

// ── Cajas (sesiones, movimientos) ────────────────────────────────────────────
apiRouter.get('/cajas', clinica, asyncHandler(caja.getCajas))
apiRouter.post('/cajas', adminClinica, asyncHandler(caja.postCaja))
apiRouter.get('/cajas/:id', clinica, asyncHandler(caja.getCaja))
apiRouter.patch('/cajas/:id', adminClinica, asyncHandler(caja.patchCaja))
apiRouter.delete('/cajas/:id', adminClinica, asyncHandler(caja.deleteCaja))
apiRouter.get('/cajas/:id/abrir', clinica, asyncHandler(caja.getSaldoSugerido))
apiRouter.post('/cajas/:id/abrir', clinica, asyncHandler(caja.postAbrir))
apiRouter.post('/cajas/:id/cerrar', clinica, asyncHandler(caja.postCerrar))
apiRouter.get('/cajas/:id/sesiones', clinica, asyncHandler(caja.getSesiones))
apiRouter.get('/cajas/:id/sesiones/:sesionId', clinica, asyncHandler(caja.getSesion))
apiRouter.get('/cajas/:id/movimientos', clinica, asyncHandler(caja.getMovimientos))
apiRouter.post('/cajas/:id/movimientos', clinica, asyncHandler(caja.postMovimiento))
apiRouter.post('/cajas/:id/movimientos/:movId/anular', clinica, asyncHandler(caja.postAnularMovimiento))

// ── Cobros ───────────────────────────────────────────────────────────────────
apiRouter.get('/cobros', clinica, asyncHandler(cobros.getCobros))
apiRouter.get('/cobros/:id', clinica, asyncHandler(cobros.getCobro))
apiRouter.post('/cobros', clinica, asyncHandler(cobros.postCobro))
apiRouter.patch('/cobros/:id', clinica, asyncHandler(cobros.patchCobro))
apiRouter.post('/cobros/:id/anular', clinica, asyncHandler(cobros.postAnularCobro))
apiRouter.delete('/cobros/:id', clinica, asyncHandler(cobros.deleteCobro))

// ── Contratos ────────────────────────────────────────────────────────────────
apiRouter.get('/contratos', clinica, asyncHandler(liq.getContratos))
apiRouter.post('/contratos', clinica, asyncHandler(liq.postContrato))
apiRouter.patch('/contratos/:id', clinica, asyncHandler(liq.patchContrato))
apiRouter.delete('/contratos/:id', clinica, asyncHandler(liq.deleteContrato))

// ── Liquidaciones ────────────────────────────────────────────────────────────
apiRouter.get('/liquidaciones', clinica, asyncHandler(liq.getLiquidaciones))
apiRouter.get('/liquidaciones/:id', clinica, asyncHandler(liq.getLiquidacion))
apiRouter.post('/liquidaciones', clinica, asyncHandler(liq.postLiquidacion))
apiRouter.patch('/liquidaciones/:id', clinica, asyncHandler(liq.patchLiquidacion))

// ── SUPER-ADMIN (gestión de la plataforma) ───────────────────────────────────
const sa = [requireAuth, requireSuperAdmin]
apiRouter.get('/admin/stats', sa, asyncHandler(admin.getStats))
apiRouter.get('/admin/suscripciones/resumen', sa, asyncHandler(admin.getResumen))
apiRouter.get('/admin/leads', sa, asyncHandler(admin.getLeads))
// Clínicas
apiRouter.get('/admin/clinicas', sa, asyncHandler(admin.getClinicas))
apiRouter.post('/admin/clinicas', sa, asyncHandler(admin.postClinica))
apiRouter.get('/admin/clinicas/:id', sa, asyncHandler(admin.getClinica))
apiRouter.patch('/admin/clinicas/:id', sa, asyncHandler(admin.patchClinica))
apiRouter.post('/admin/clinicas/:id/cambiar-plan', sa, asyncHandler(admin.postCambiarPlan))
apiRouter.post('/admin/clinicas/:id/estado', sa, asyncHandler(admin.postEstado))
apiRouter.post('/admin/clinicas/:id/extender-trial', sa, asyncHandler(admin.postExtenderTrial))
apiRouter.post('/admin/clinicas/:id/reset-admin-password', sa, asyncHandler(admin.postResetPassword))
// Pagos
apiRouter.get('/admin/clinicas/:id/pagos', sa, asyncHandler(admin.getPagos))
apiRouter.post('/admin/clinicas/:id/pagos', sa, asyncHandler(admin.postPago))
apiRouter.delete('/admin/clinicas/:id/pagos/:pagoId', sa, asyncHandler(admin.deletePago))
// Extras
apiRouter.get('/admin/clinicas/:id/extras', sa, asyncHandler(admin.getExtras))
apiRouter.post('/admin/clinicas/:id/extras', sa, asyncHandler(admin.postExtra))
apiRouter.patch('/admin/clinicas/:id/extras/:extraId', sa, asyncHandler(admin.patchExtra))
apiRouter.delete('/admin/clinicas/:id/extras/:extraId', sa, asyncHandler(admin.deleteExtra))
// WhatsApp config
apiRouter.get('/admin/clinicas/:id/whatsapp', sa, asyncHandler(admin.getWhatsapp))
apiRouter.put('/admin/clinicas/:id/whatsapp', sa, asyncHandler(admin.putWhatsapp))
// Planes de suscripción
apiRouter.get('/admin/planes-suscripcion', sa, asyncHandler(admin.getPlanes))
apiRouter.post('/admin/planes-suscripcion', sa, asyncHandler(admin.postPlan))
apiRouter.patch('/admin/planes-suscripcion/:id', sa, asyncHandler(admin.patchPlan))
apiRouter.delete('/admin/planes-suscripcion/:id', sa, asyncHandler(admin.deletePlan))

// ── Reportes (descargas XLSX) ────────────────────────────────────────────────
apiRouter.get('/reportes/pacientes', clinica, asyncHandler(reportes.getPacientes))
apiRouter.get('/reportes/citas', clinica, asyncHandler(reportes.getCitas))
apiRouter.get('/reportes/cobros', clinica, asyncHandler(reportes.getCobros))
apiRouter.get('/reportes/tratamientos', clinica, asyncHandler(reportes.getTratamientos))
apiRouter.get('/reportes/liquidaciones', clinica, asyncHandler(reportes.getLiquidaciones))
apiRouter.get('/reportes/caja', clinica, asyncHandler(reportes.getCaja))
apiRouter.get('/reportes/morosos', clinica, asyncHandler(reportes.getMorosos))
