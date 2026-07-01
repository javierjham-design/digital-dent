import { Router } from 'express'
import multer from 'multer'
import { asyncHandler } from '@/middlewares/async-handler'
import { requireAuth, requireAdmin } from '@/middlewares/auth'
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
  getPrestaciones, postPrestacion, patchPrestacion, deletePrestacion, postDedupePrestaciones,
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
import * as agendaOnline from '@/controllers/agenda-online.controller'
import * as crm from '@/controllers/crm.controller'
import { requireSuperAdmin } from '@/middlewares/auth'

// Router raíz de la API v1. Cada dominio agrupa sus endpoints.
export const apiRouter = Router()

// Middlewares reutilizables para rutas con scope de clínica (database-per-tenant).
// `tenant` resuelve req.tenant (cliente de la base de la clínica) + req.clinica;
// `adminTenant` además exige rol admin. Todos los dominios usan ya este modelo.
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

// ── Público: agendamiento online (resuelve la clínica por slug, sin sesión) ──
apiRouter.get('/public/agenda/:slug/:token', asyncHandler(agendaOnline.getPublicAgenda))
apiRouter.post('/public/agenda/:slug/:token/reservar', asyncHandler(agendaOnline.postPublicReserva))

// ── Público: CRM (formulario web hospedado + intake de leads) ────────────────
apiRouter.get('/public/crm/:slug/:token', asyncHandler(crm.getPublicForm))
apiRouter.post('/public/crm/:slug/:token/lead', asyncHandler(crm.postPublicLead))

// ── Público: demo + webhook WhatsApp (auth interna propia) ───────────────────
apiRouter.post('/demo', asyncHandler(demo.postDemo))
apiRouter.post('/demo/cleanup', asyncHandler(demo.postDemoCleanup))
apiRouter.post('/whatsapp/webhook', asyncHandler(whatsapp.postWebhook))
apiRouter.post('/whatsapp/recordatorios', asyncHandler(whatsapp.postRecordatorios))
// Google: sync acepta cron-secret (sin sesión); callback es redirect público.
apiRouter.get('/google/callback', asyncHandler(googlec.getCallback))
apiRouter.post('/google/sync', asyncHandler(googlec.postSync))

// ── Google Calendar (sesión de clínica, database-per-tenant) ─────────────────
apiRouter.get('/google/connect', tenant, asyncHandler(googlec.getConnect))
apiRouter.post('/google/disconnect', tenant, asyncHandler(googlec.postDisconnect))
apiRouter.get('/google/calendars', tenant, asyncHandler(googlec.getCalendars))
apiRouter.post('/google/reconcile-bloqueos', tenant, asyncHandler(googlec.postReconcileBloqueos))

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

// ── Equipo / Usuarios (convertido a database-per-tenant) ─────────────────────
apiRouter.get('/usuarios', tenant, asyncHandler(getUsuarios))
apiRouter.get('/doctores', tenant, asyncHandler(getDoctores))
apiRouter.post('/usuarios', adminTenant, asyncHandler(postUsuario))
apiRouter.patch('/usuarios/:id', tenant, asyncHandler(patchUsuario)) // self o admin (validado en service)

// ── Horarios (convertido a database-per-tenant) ──────────────────────────────
apiRouter.get('/horarios', tenant, asyncHandler(getHorarios))
apiRouter.post('/horarios', tenant, asyncHandler(postHorarios))

// ── Agendamiento online: links (admin) + reservas ────────────────────────────
apiRouter.get('/agenda-links', tenant, asyncHandler(agendaOnline.getLinks))
apiRouter.post('/agenda-links', adminTenant, asyncHandler(agendaOnline.postLink))
apiRouter.patch('/agenda-links/:id', adminTenant, asyncHandler(agendaOnline.patchLink))
apiRouter.delete('/agenda-links/:id', adminTenant, asyncHandler(agendaOnline.deleteLink))
apiRouter.get('/reservas-online', tenant, asyncHandler(agendaOnline.getReservas))

// ── CRM: leads (admin) + config de Meta/captación ────────────────────────────
apiRouter.get('/crm/config', tenant, asyncHandler(crm.getConfig))
apiRouter.patch('/crm/config', adminTenant, asyncHandler(crm.patchConfig))
apiRouter.get('/crm/leads', tenant, asyncHandler(crm.getLeads))
apiRouter.get('/crm/resumen', tenant, asyncHandler(crm.getResumen))
apiRouter.post('/crm/leads', tenant, asyncHandler(crm.postLead))
apiRouter.get('/crm/leads/:id', tenant, asyncHandler(crm.getLead))
apiRouter.patch('/crm/leads/:id', tenant, asyncHandler(crm.patchLead))
apiRouter.post('/crm/leads/:id/notas', tenant, asyncHandler(crm.postNota))
apiRouter.post('/crm/leads/:id/convertir', tenant, asyncHandler(crm.postConvertir))
apiRouter.delete('/crm/leads/:id', adminTenant, asyncHandler(crm.deleteLead))

// ── Bloqueos de agenda (convertido a database-per-tenant) ────────────────────
apiRouter.get('/bloqueos', tenant, asyncHandler(getBloqueos))
apiRouter.post('/bloqueos', tenant, asyncHandler(postBloqueo))
apiRouter.patch('/bloqueos/:id', tenant, asyncHandler(patchBloqueo))
apiRouter.delete('/bloqueos/:id', tenant, asyncHandler(deleteBloqueo))

// ── Prestaciones (convertido a database-per-tenant) ──────────────────────────
apiRouter.get('/prestaciones', tenant, asyncHandler(getPrestaciones))
apiRouter.post('/prestaciones/dedupe', adminTenant, asyncHandler(postDedupePrestaciones)) // limpiar duplicados (admin)
apiRouter.post('/prestaciones', tenant, asyncHandler(postPrestacion))
apiRouter.patch('/prestaciones/:id', tenant, asyncHandler(patchPrestacion))
apiRouter.delete('/prestaciones/:id', tenant, asyncHandler(deletePrestacion))

// ── Medios de pago (convertido a database-per-tenant) ────────────────────────
apiRouter.get('/medios-pago', tenant, asyncHandler(getMediosPago))
apiRouter.post('/medios-pago', tenant, asyncHandler(postMedioPago))
apiRouter.patch('/medios-pago/:id', tenant, asyncHandler(patchMedioPago))
apiRouter.delete('/medios-pago/:id', tenant, asyncHandler(deleteMedioPago))

// ── Configuración de la clínica (convertido a database-per-tenant) ───────────
apiRouter.get('/clinica', tenant, asyncHandler(getClinica))
apiRouter.patch('/clinica', adminTenant, asyncHandler(patchClinica))

// ── Clínico: planes de tratamiento ───────────────────────────────────────────
apiRouter.get('/planes-tratamiento', tenant, asyncHandler(clinico.getPlanes))
apiRouter.post('/planes-tratamiento', tenant, asyncHandler(clinico.postPlan))
apiRouter.get('/planes-tratamiento/:id', tenant, asyncHandler(clinico.getPlan))
apiRouter.patch('/planes-tratamiento/:id', tenant, asyncHandler(clinico.patchPlan))
apiRouter.delete('/planes-tratamiento/:id', tenant, asyncHandler(clinico.deletePlan))
apiRouter.post('/planes-tratamiento/:id/secciones', tenant, asyncHandler(clinico.postSeccion))

// ── Clínico: secciones ───────────────────────────────────────────────────────
apiRouter.patch('/secciones-plan/:id', tenant, asyncHandler(clinico.patchSeccion))
apiRouter.delete('/secciones-plan/:id', tenant, asyncHandler(clinico.deleteSeccion))

// ── Clínico: tratamientos (acciones) ─────────────────────────────────────────
apiRouter.post('/tratamientos', tenant, asyncHandler(clinico.postTratamiento))
apiRouter.patch('/tratamientos/:id', tenant, asyncHandler(clinico.patchTratamiento))
apiRouter.post('/tratamientos/:id/evolucionar', tenant, asyncHandler(clinico.postEvolucionarTratamiento))
apiRouter.delete('/tratamientos/:id', tenant, asyncHandler(clinico.deleteTratamiento))

// ── Clínico: evoluciones ─────────────────────────────────────────────────────
apiRouter.get('/evoluciones', tenant, asyncHandler(clinico.getEvoluciones))
apiRouter.post('/evoluciones', tenant, asyncHandler(clinico.postEvolucion))
apiRouter.patch('/evoluciones/:id', tenant, asyncHandler(clinico.patchEvolucion)) // editar: solo admin (validado en service)
apiRouter.delete('/evoluciones/:id', tenant, asyncHandler(clinico.deleteEvolucion)) // borrar: solo admin

// ── Clínico: historial / auditoría de la ficha ───────────────────────────────
apiRouter.get('/historial', tenant, asyncHandler(clinico.getHistorial))

// ── Clínico: odontograma ─────────────────────────────────────────────────────
apiRouter.post('/odontograma', tenant, asyncHandler(clinico.postDiente))

// ── Presupuestos ─────────────────────────────────────────────────────────────
apiRouter.get('/presupuestos', tenant, asyncHandler(presupuestos.getPresupuestos))
apiRouter.get('/presupuestos/:id', tenant, asyncHandler(presupuestos.getPresupuesto))
apiRouter.post('/presupuestos', tenant, asyncHandler(presupuestos.postPresupuesto))
apiRouter.patch('/presupuestos/:id', tenant, asyncHandler(presupuestos.patchPresupuesto))

// ── Cajas (sesiones, movimientos) ────────────────────────────────────────────
apiRouter.get('/cajas', tenant, asyncHandler(caja.getCajas))
apiRouter.get('/cajas/resumen', tenant, asyncHandler(caja.getResumenCajas)) // estado abiertas/cerradas (antes de /:id)
apiRouter.post('/cajas', adminTenant, asyncHandler(caja.postCaja))
apiRouter.get('/cajas/:id', tenant, asyncHandler(caja.getCaja))
apiRouter.patch('/cajas/:id', adminTenant, asyncHandler(caja.patchCaja))
apiRouter.delete('/cajas/:id', adminTenant, asyncHandler(caja.deleteCaja))
apiRouter.get('/cajas/:id/abrir', tenant, asyncHandler(caja.getSaldoSugerido))
apiRouter.post('/cajas/:id/abrir', tenant, asyncHandler(caja.postAbrir))
apiRouter.post('/cajas/:id/cerrar', tenant, asyncHandler(caja.postCerrar))
apiRouter.get('/cajas/:id/sesiones', tenant, asyncHandler(caja.getSesiones))
apiRouter.get('/cajas/:id/sesiones/:sesionId', tenant, asyncHandler(caja.getSesion))
apiRouter.get('/cajas/:id/movimientos', tenant, asyncHandler(caja.getMovimientos))
apiRouter.post('/cajas/:id/movimientos', tenant, asyncHandler(caja.postMovimiento))
apiRouter.post('/cajas/:id/movimientos/:movId/anular', tenant, asyncHandler(caja.postAnularMovimiento))

// ── Cobros ───────────────────────────────────────────────────────────────────
apiRouter.get('/cobros', tenant, asyncHandler(cobros.getCobros)) // ?pacienteId= opcional
apiRouter.post('/cobros/derivar-abono', tenant, asyncHandler(cobros.postDerivarAbono)) // mover abono libre entre planes
apiRouter.get('/cobros/:id', tenant, asyncHandler(cobros.getCobro))
apiRouter.post('/cobros', tenant, asyncHandler(cobros.postCobro))
apiRouter.patch('/cobros/:id', tenant, asyncHandler(cobros.patchCobro))
apiRouter.post('/cobros/:id/anular', tenant, asyncHandler(cobros.postAnularCobro))
apiRouter.delete('/cobros/:id', tenant, asyncHandler(cobros.deleteCobro))

// ── Contratos ────────────────────────────────────────────────────────────────
apiRouter.get('/contratos', tenant, asyncHandler(liq.getContratos))
apiRouter.post('/contratos', tenant, asyncHandler(liq.postContrato))
apiRouter.patch('/contratos/:id', tenant, asyncHandler(liq.patchContrato))
apiRouter.delete('/contratos/:id', tenant, asyncHandler(liq.deleteContrato))

// ── Liquidaciones ────────────────────────────────────────────────────────────
// Activas (saldo corriente por profesional) + finalizar.
apiRouter.get('/liquidaciones-activas', tenant, asyncHandler(liq.getLiquidacionesActivas))
apiRouter.get('/liquidaciones-activas/:doctorId', tenant, asyncHandler(liq.getLiquidacionActiva))
apiRouter.post('/liquidaciones-activas/:doctorId/finalizar', tenant, asyncHandler(liq.postFinalizarLiquidacion))
// Finalizadas (snapshots guardados).
apiRouter.get('/liquidaciones', tenant, asyncHandler(liq.getLiquidaciones))
apiRouter.get('/liquidaciones/:id', tenant, asyncHandler(liq.getLiquidacion))
apiRouter.patch('/liquidaciones/:id', tenant, asyncHandler(liq.patchLiquidacion))
// Adjuntos (factura / comprobante de transferencia) — guardados como bytes.
apiRouter.get('/liquidaciones/:id/adjuntos', tenant, asyncHandler(liq.getAdjuntos))
apiRouter.post('/liquidaciones/:id/adjuntos', tenant, upload.single('file'), asyncHandler(liq.postAdjunto))
apiRouter.get('/liquidaciones/:id/adjuntos/:adjId', tenant, asyncHandler(liq.getAdjunto))
apiRouter.delete('/liquidaciones/:id/adjuntos/:adjId', tenant, asyncHandler(liq.deleteAdjunto))

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
apiRouter.get('/reportes/pacientes', tenant, asyncHandler(reportes.getPacientes))
apiRouter.get('/reportes/citas', tenant, asyncHandler(reportes.getCitas))
apiRouter.get('/reportes/cobros', tenant, asyncHandler(reportes.getCobros))
apiRouter.get('/reportes/tratamientos', tenant, asyncHandler(reportes.getTratamientos))
apiRouter.get('/reportes/liquidaciones', tenant, asyncHandler(reportes.getLiquidaciones))
apiRouter.get('/reportes/caja', tenant, asyncHandler(reportes.getCaja))
apiRouter.get('/reportes/morosos', tenant, asyncHandler(reportes.getMorosos))
