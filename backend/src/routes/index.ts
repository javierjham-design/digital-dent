import { Router } from 'express'
import multer from 'multer'
import { asyncHandler } from '@/middlewares/async-handler'
import { requireAuth, requireAdmin } from '@/middlewares/auth'
import { requireTenant } from '@/middlewares/tenant'
import { getMe, postLogin, postCambiarPassword, post2FASetup, post2FAVerify } from '@/controllers/auth.controller'
import {
  getPacientes, getPaciente, postPaciente, patchPaciente, getFicha, putFicha,
  getComentarios, postComentario, getMensajes, postMensaje, getResumen,
  getExport, getTemplate, postImport, getPacientesSinProxima, getLeadsSugeridos, postVincularLead,
} from '@/controllers/pacientes.controller'
import { getCitas, postCita, patchCita, deleteCita, patchEstado, getLogsCita } from '@/controllers/citas.controller'
import * as box from '@/controllers/boxes.controller'
import { getUsuarios, getDoctores, getCupoProfesionales, postUsuario, patchUsuario } from '@/controllers/usuarios.controller'
import { getHorarios, postHorarios, getBloqueos, postBloqueo, patchBloqueo, deleteBloqueo } from '@/controllers/agenda.controller'
import {
  getPrestaciones, postPrestacion, patchPrestacion, deletePrestacion, postDedupePrestaciones,
  getCategorias, postCategoria, patchCategoria, postReordenarCategorias, deleteCategoria,
  getMediosPago, postMedioPago, patchMedioPago, deleteMedioPago,
  getClinica, patchClinica,
} from '@/controllers/catalogo.controller'
import * as clinico from '@/controllers/clinico.controller'
import * as presupuestos from '@/controllers/presupuestos.controller'
import * as caja from '@/controllers/caja.controller'
import * as cobros from '@/controllers/cobros.controller'
import * as liq from '@/controllers/liquidaciones.controller'
import * as estetica from '@/controllers/estetica.controller'
import * as reportes from '@/controllers/reportes.controller'
import * as admin from '@/controllers/admin.controller'
import * as demo from '@/controllers/demo.controller'
import * as whatsapp from '@/controllers/whatsapp.controller'
import * as googlec from '@/controllers/google.controller'
import * as backups from '@/controllers/backups.controller'
import { getPlanesPublicos } from '@/controllers/public.controller'
import * as agendaOnline from '@/controllers/agenda-online.controller'
import * as crm from '@/controllers/crm.controller'
import * as meta from '@/controllers/meta.controller'
import * as suscripcion from '@/controllers/suscripcion.controller'
import * as pagosOnline from '@/controllers/pagos-online.controller'
import * as email from '@/controllers/email.controller'
import * as consent from '@/controllers/consentimientos.controller'
import * as doc from '@/controllers/documentos.controller'
import * as ext from '@/controllers/ext.controller'
import * as tubotAgenda from '@/controllers/tubot-agenda.controller'
import { requireApiKey } from '@/middlewares/api-key'
import { requireTubotApiKey } from '@/middlewares/tubot-agenda'
import { requirePermiso } from '@/middlewares/permiso'
import { requireModulo, requireModuloApiKey } from '@/middlewares/modulo'
import { requireSuperAdmin } from '@/middlewares/auth'

// Router raíz de la API v1. Cada dominio agrupa sus endpoints.
export const apiRouter = Router()

// Middlewares reutilizables para rutas con scope de clínica (database-per-tenant).
// `tenant` resuelve req.tenant (cliente de la base de la clínica) + req.clinica;
// `adminTenant` además exige rol admin. Todos los dominios usan ya este modelo.
const tenant = [requireAuth, requireTenant]
const adminTenant = [requireAuth, requireTenant, requireAdmin]
// CRM (módulo asignable): admin o usuario con permiso, y el módulo habilitado.
const crmTenant = [requireAuth, requireTenant, requireModulo('crm'), requirePermiso('puedeGestionarCrm')]
const crmAdmin = [requireAuth, requireTenant, requireModulo('crm'), requireAdmin]
// Agendamiento online (módulo asignable).
const agendaTenant = [requireAuth, requireTenant, requireModulo('agendamiento_online')]
// Eliminar registros clínicos: admin o usuario con el permiso "puedeEliminar".
const eliminarTenant = [requireAuth, requireTenant, requirePermiso('puedeEliminar')]
// Configuración de la clínica / agendamiento online / consentimientos: admin o
// usuario con el permiso "puedeConfigurarClinica".
const configTenant = [requireAuth, requireTenant, requirePermiso('puedeConfigurarClinica')]
const agendaConfig = [requireAuth, requireTenant, requireModulo('agendamiento_online'), requirePermiso('puedeConfigurarClinica')]
// Gestión del equipo (usuarios y permisos): admin o "puedeGestionarEquipo".
const equipoTenant = [requireAuth, requireTenant, requirePermiso('puedeGestionarEquipo')]
// Gestión del catálogo de prestaciones y sus secciones: admin o "puedeGestionarPrestaciones".
const prestacionesTenant = [requireAuth, requireTenant, requirePermiso('puedeGestionarPrestaciones')]
// Reportes (descargas XLSX con datos sensibles: nómina de pacientes, cobros, morosos):
// admin o usuario con el permiso "puedeVerReportes".
const reportesTenant = [requireAuth, requireTenant, requirePermiso('puedeVerReportes')]

// Subida de archivos en memoria (import de pacientes XLSX, máx 5MB).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })
// Radiografías / documentos del paciente (imágenes y PDFs) — límite mayor.
const uploadDoc = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

// ── Auth ───────────────────────────────────────────────────────────────────
apiRouter.post('/auth/login', asyncHandler(postLogin))
// 2FA del super-admin (segundo paso tras la contraseña). Públicas: las gatea el
// desafío firmado que devuelve /auth/login, no una sesión.
apiRouter.post('/auth/2fa/setup', asyncHandler(post2FASetup))
apiRouter.post('/auth/2fa/verify', asyncHandler(post2FAVerify))
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
// Intake del Formulario Instantáneo de Meta (Make hace POST aquí con leadgen_id + ad/adset/campaign).
apiRouter.post('/public/crm/:slug/:token/meta-lead', asyncHandler(crm.postMetaLead))
// Webhook NATIVO de Meta Lead Ads (sin Make). Cross-tenant: se enruta por page_id.
// GET = verificación (hub.challenge); POST = eventos (valida firma HMAC, procesa async).
apiRouter.get('/public/meta/leadgen-webhook', meta.getMetaWebhook)
apiRouter.post('/public/meta/leadgen-webhook', meta.postMetaWebhook)

// Webhook de confirmación de Flow (cobros a pacientes). Público, por slug de clínica.
apiRouter.post('/public/pagos/flow/:slug/webhook', asyncHandler(pagosOnline.postWebhookFlow))
// Webhook de Lemon Squeezy (suscripción de la plataforma en USD). Público; valida firma HMAC.
apiRouter.post('/public/pagos/lemonsqueezy/webhook', asyncHandler(suscripcion.postWebhookLemon))
// Retorno del navegador del paciente al terminar el pago (Flow lo invoca por POST y GET).
apiRouter.get('/public/pagos/flow/:slug/retorno', asyncHandler(pagosOnline.retornoFlow))
apiRouter.post('/public/pagos/flow/:slug/retorno', asyncHandler(pagosOnline.retornoFlow))

// ── Público: demo + webhook WhatsApp (auth interna propia) ───────────────────
apiRouter.post('/demo', asyncHandler(demo.postDemo))
apiRouter.post('/demo/cleanup', asyncHandler(demo.postDemoCleanup))
apiRouter.post('/whatsapp/webhook/:connectionId', asyncHandler(whatsapp.postWebhook)) // TuBot → Cláriva (firmado)
apiRouter.post('/whatsapp/recordatorios', asyncHandler(whatsapp.postRecordatorios))   // cron / admin
apiRouter.post('/whatsapp/reenviar/:citaId', tenant, asyncHandler(whatsapp.postReenviar)) // reenvío manual (recepción)
// Google: sync acepta cron-secret (sin sesión); callback es redirect público.
apiRouter.get('/google/callback', asyncHandler(googlec.getCallback))
apiRouter.post('/google/sync', asyncHandler(googlec.postSync))
// Backup manual: cron-secret (timingSafeEqual) o super-admin. Sin requireAuth (valida inline).
apiRouter.post('/admin/backups/run', asyncHandler(backups.postBackupRun))

// ── Google Calendar (sesión de clínica, database-per-tenant) ─────────────────
apiRouter.get('/google/health', tenant, asyncHandler(googlec.getHealth))
apiRouter.get('/google/connect', tenant, asyncHandler(googlec.getConnect))
apiRouter.post('/google/disconnect', tenant, asyncHandler(googlec.postDisconnect))
apiRouter.get('/google/calendars', tenant, asyncHandler(googlec.getCalendars))
apiRouter.post('/google/reconcile-bloqueos', tenant, asyncHandler(googlec.postReconcileBloqueos))

// ── Pacientes (convertido a database-per-tenant) ─────────────────────────────
apiRouter.get('/pacientes', tenant, asyncHandler(getPacientes))
// Rutas estáticas ANTES de /pacientes/:id (si no, ":id" captura export/template/import).
apiRouter.get('/pacientes/export', tenant, asyncHandler(getExport))
apiRouter.get('/pacientes/template', tenant, asyncHandler(getTemplate))
apiRouter.get('/pacientes/sin-proxima-cita', tenant, asyncHandler(getPacientesSinProxima))
apiRouter.post('/pacientes/import', adminTenant, upload.single('file'), asyncHandler(postImport))
apiRouter.post('/pacientes', tenant, asyncHandler(postPaciente))
apiRouter.get('/pacientes/:id', tenant, asyncHandler(getPaciente))
apiRouter.patch('/pacientes/:id', tenant, asyncHandler(patchPaciente))
// Vínculo lead→paciente (aviso de la ficha): leads sin vincular que coinciden por teléfono/RUT.
apiRouter.get('/pacientes/:id/leads-sugeridos', tenant, asyncHandler(getLeadsSugeridos))
apiRouter.post('/pacientes/:id/vincular-lead', tenant, asyncHandler(postVincularLead))
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
apiRouter.get('/citas/:id/logs', tenant, asyncHandler(getLogsCita)) // historial de la cita (agendamiento, notificaciones, cambios de estado)

// ── Boxes / salas de atención (opcionales) ───────────────────────────────────
apiRouter.get('/boxes', tenant, asyncHandler(box.getBoxes))
apiRouter.post('/boxes', configTenant, asyncHandler(box.postBox))
apiRouter.patch('/boxes/:id', configTenant, asyncHandler(box.patchBox))
apiRouter.delete('/boxes/:id', configTenant, asyncHandler(box.deleteBox))

// ── Equipo / Usuarios (convertido a database-per-tenant) ─────────────────────
apiRouter.get('/usuarios', tenant, asyncHandler(getUsuarios))
apiRouter.get('/usuarios/cupo-profesionales', tenant, asyncHandler(getCupoProfesionales))
apiRouter.get('/doctores', tenant, asyncHandler(getDoctores))
apiRouter.post('/usuarios', equipoTenant, asyncHandler(postUsuario))
apiRouter.patch('/usuarios/:id', tenant, asyncHandler(patchUsuario)) // self o admin (validado en service)

// ── Horarios (convertido a database-per-tenant) ──────────────────────────────
apiRouter.get('/horarios', tenant, asyncHandler(getHorarios))
apiRouter.post('/horarios', tenant, asyncHandler(postHorarios))

// ── Agendamiento online: links (admin) + reservas ────────────────────────────
apiRouter.get('/agenda-links', agendaTenant, asyncHandler(agendaOnline.getLinks))
apiRouter.post('/agenda-links', agendaConfig, asyncHandler(agendaOnline.postLink))
apiRouter.patch('/agenda-links/:id', agendaConfig, asyncHandler(agendaOnline.patchLink))
apiRouter.delete('/agenda-links/:id', agendaConfig, asyncHandler(agendaOnline.deleteLink))
apiRouter.get('/reservas-online', agendaTenant, asyncHandler(agendaOnline.getReservas))
apiRouter.post('/reservas-online/:id/aceptar', agendaTenant, asyncHandler(agendaOnline.postAceptarReserva))

// ── Suscripción de la clínica (su propio plan/pago) — admin de la clínica ─────
apiRouter.get('/suscripcion', adminTenant, asyncHandler(suscripcion.getSuscripcion))
apiRouter.post('/suscripcion/enlace-pago', adminTenant, asyncHandler(suscripcion.postEnlacePago))

// ── CRM: leads (admin) + config de Meta/captación ────────────────────────────
apiRouter.get('/crm/config', crmTenant, asyncHandler(crm.getConfig))
apiRouter.patch('/crm/config', crmAdmin, asyncHandler(crm.patchConfig))
apiRouter.post('/crm/meta/test', crmAdmin, asyncHandler(crm.postProbarMeta))
apiRouter.post('/crm/meta-crm/test', crmAdmin, asyncHandler(crm.postProbarMetaCrm))
apiRouter.post('/crm/meta-leadads/test', crmAdmin, asyncHandler(crm.postProbarRecepcionLeadAds))
// Reproceso manual de un lead por leadgen_id (mismo pipeline que el webhook). Admin.
apiRouter.post('/admin/meta/reprocesar-lead', crmAdmin, asyncHandler(crm.postReprocesarLead))
apiRouter.post('/crm/schedule/backfill', crmAdmin, asyncHandler(crm.postBackfillSchedule))
apiRouter.post('/crm/crm-schedule/backfill', crmAdmin, asyncHandler(crm.postBackfillCrmSchedule))
apiRouter.post('/crm/leads/fusionar-duplicados', crmAdmin, asyncHandler(crm.postFusionarDuplicados))

// Gestión de la API key de acceso externo (MCP) — admin de la clínica.
apiRouter.get('/crm/api-key', crmAdmin, asyncHandler(ext.getApiKey))
apiRouter.post('/crm/api-key/rotate', crmAdmin, asyncHandler(ext.postRotarApiKey))
apiRouter.delete('/crm/api-key', crmAdmin, asyncHandler(ext.deleteApiKey))

// Acceso externo read-only (servidor MCP de Claude / integraciones), autenticado
// por API key (X-API-Key). Scope de 1 clínica; sólo lectura. Requiere módulo CRM.
const apiKeyScope = [requireApiKey, requireModuloApiKey('crm')]
apiRouter.get('/ext/leads', apiKeyScope, asyncHandler(ext.getExtLeads))
apiRouter.get('/ext/leads/:id', apiKeyScope, asyncHandler(ext.getExtLead))
apiRouter.get('/ext/resumen', apiKeyScope, asyncHandler(ext.getExtResumen))
apiRouter.get('/ext/stats', apiKeyScope, asyncHandler(ext.getExtStats))

// ── API de AGENDA que consume TuBot (contrato docs/TUBOT_AGENDA.md) ───────────
// Autenticada por token dedicado por clínica. Paths EXACTOS del contrato (el
// cliente de TuBot llama {baseUrl}/api/v1/{path}). Fase 1: catálogo de lectura.
const tubotScope = [requireTubotApiKey]
apiRouter.get('/clinics', tubotScope, asyncHandler(tubotAgenda.getClinics))
apiRouter.get('/professionals', tubotScope, asyncHandler(tubotAgenda.getProfessionals))
apiRouter.get('/professionals/:id/services', tubotScope, asyncHandler(tubotAgenda.getProfessionalServices))
apiRouter.get('/services', tubotScope, asyncHandler(tubotAgenda.getServices))
apiRouter.get('/availability', tubotScope, asyncHandler(tubotAgenda.getAvailability))
apiRouter.post('/appointments', tubotScope, asyncHandler(tubotAgenda.postAppointment))
apiRouter.get('/appointments/:id', tubotScope, asyncHandler(tubotAgenda.getAppointmentById))
apiRouter.patch('/appointments/:id', tubotScope, asyncHandler(tubotAgenda.patchAppointment))
apiRouter.post('/appointments/:id/cancel', tubotScope, asyncHandler(tubotAgenda.cancelAppointment))
apiRouter.post('/appointments/:id/confirm', tubotScope, asyncHandler(tubotAgenda.confirmAppointment))
apiRouter.post('/appointments/:id/attendance', tubotScope, asyncHandler(tubotAgenda.attendanceAppointment))
// Tenant self-serve: la clínica gestiona su propia conexión con TuBot (token + webhooks).
apiRouter.get('/integraciones/tubot-agenda', configTenant, asyncHandler(tubotAgenda.getMiTubotAgenda))
apiRouter.post('/integraciones/tubot-agenda/token', configTenant, asyncHandler(tubotAgenda.postMiTubotToken))
apiRouter.delete('/integraciones/tubot-agenda/token', configTenant, asyncHandler(tubotAgenda.deleteMiTubotToken))
apiRouter.put('/integraciones/tubot-agenda/webhook', configTenant, asyncHandler(tubotAgenda.putMiTubotWebhook))
apiRouter.put('/patients', tubotScope, asyncHandler(tubotAgenda.putPatient))
apiRouter.get('/patients', tubotScope, asyncHandler(tubotAgenda.getCrmPatients))
apiRouter.get('/patients/:phone/appointments', tubotScope, asyncHandler(tubotAgenda.getPatientAppointments))
apiRouter.get('/patients/:id/notes', tubotScope, asyncHandler(tubotAgenda.getCrmNotes))
apiRouter.post('/patients/:id/notes', tubotScope, asyncHandler(tubotAgenda.postCrmNote))
apiRouter.get('/patients/:id', tubotScope, asyncHandler(tubotAgenda.getCrmPatient))
apiRouter.get('/crm/leads', crmTenant, asyncHandler(crm.getLeads))
apiRouter.get('/crm/resumen', crmTenant, asyncHandler(crm.getResumen))
apiRouter.get('/crm/campanas', crmTenant, asyncHandler(crm.getCampanas))
apiRouter.patch('/crm/campanas', crmTenant, asyncHandler(crm.patchCampana))
apiRouter.post('/crm/leads', crmTenant, asyncHandler(crm.postLead))
apiRouter.get('/crm/leads/:id', crmTenant, asyncHandler(crm.getLead))
apiRouter.patch('/crm/leads/:id', crmTenant, asyncHandler(crm.patchLead))
apiRouter.post('/crm/leads/:id/notas', crmTenant, asyncHandler(crm.postNota))
apiRouter.post('/crm/leads/:id/convertir', crmTenant, asyncHandler(crm.postConvertir))
apiRouter.post('/crm/leads/:id/agendar', crmTenant, asyncHandler(crm.postAgendar))
apiRouter.delete('/crm/leads/:id', crmAdmin, asyncHandler(crm.deleteLead))

// ── Consentimientos informados ───────────────────────────────────────────────
// Plantillas: listar (cualquier usuario, para generar) / gestionar (admin).
apiRouter.get('/consentimientos/plantillas', tenant, asyncHandler(consent.getPlantillas))
apiRouter.post('/consentimientos/plantillas', configTenant, asyncHandler(consent.postPlantilla))
apiRouter.get('/consentimientos/plantillas/:id', configTenant, asyncHandler(consent.getPlantilla))
apiRouter.patch('/consentimientos/plantillas/:id', configTenant, asyncHandler(consent.patchPlantilla))
apiRouter.delete('/consentimientos/plantillas/:id', configTenant, asyncHandler(consent.deletePlantilla))
// Generación / firma / consulta (usuarios de la clínica).
apiRouter.post('/consentimientos/previsualizar', tenant, asyncHandler(consent.postPrevisualizar))
apiRouter.post('/consentimientos/generar', tenant, asyncHandler(consent.postGenerar))
apiRouter.get('/pacientes/:pacienteId/consentimientos', tenant, asyncHandler(consent.getPorPaciente))
apiRouter.get('/consentimientos/:id', tenant, asyncHandler(consent.getConsentimiento))
apiRouter.post('/consentimientos/:id/firmar', tenant, asyncHandler(consent.postFirmar))
// Eliminar: admin o usuario con permiso "puedeEliminar" (resguardo) + auditado.
apiRouter.delete('/consentimientos/:id', eliminarTenant, asyncHandler(consent.deleteConsentimiento))

// ── Radiografías y documentos del paciente ───────────────────────────────────
apiRouter.get('/pacientes/:pacienteId/documentos', tenant, asyncHandler(doc.getDocumentos))
apiRouter.post('/pacientes/:pacienteId/documentos', tenant, uploadDoc.single('file'), asyncHandler(doc.postDocumento))
apiRouter.get('/documentos/:id', tenant, asyncHandler(doc.getDocumento))
apiRouter.delete('/documentos/:id', eliminarTenant, asyncHandler(doc.deleteDocumento))

// ── Bloqueos de agenda (convertido a database-per-tenant) ────────────────────
apiRouter.get('/bloqueos', tenant, asyncHandler(getBloqueos))
apiRouter.post('/bloqueos', tenant, asyncHandler(postBloqueo))
apiRouter.patch('/bloqueos/:id', tenant, asyncHandler(patchBloqueo))
apiRouter.delete('/bloqueos/:id', tenant, asyncHandler(deleteBloqueo))

// ── Prestaciones (convertido a database-per-tenant) ──────────────────────────
apiRouter.get('/prestaciones', tenant, asyncHandler(getPrestaciones))
apiRouter.post('/prestaciones/dedupe', adminTenant, asyncHandler(postDedupePrestaciones)) // limpiar duplicados (admin)
apiRouter.post('/prestaciones', prestacionesTenant, asyncHandler(postPrestacion))
apiRouter.patch('/prestaciones/:id', prestacionesTenant, asyncHandler(patchPrestacion))
apiRouter.delete('/prestaciones/:id', prestacionesTenant, asyncHandler(deletePrestacion))

// Secciones / categorías del catálogo (ordenar, renombrar, marcar no liquidables).
apiRouter.get('/categorias-prestacion', tenant, asyncHandler(getCategorias))
apiRouter.post('/categorias-prestacion', prestacionesTenant, asyncHandler(postCategoria))
apiRouter.post('/categorias-prestacion/reordenar', prestacionesTenant, asyncHandler(postReordenarCategorias))
apiRouter.patch('/categorias-prestacion/:id', prestacionesTenant, asyncHandler(patchCategoria))
apiRouter.delete('/categorias-prestacion/:id', prestacionesTenant, asyncHandler(deleteCategoria))

// ── Medios de pago (convertido a database-per-tenant) ────────────────────────
apiRouter.get('/medios-pago', tenant, asyncHandler(getMediosPago))
apiRouter.post('/medios-pago', tenant, asyncHandler(postMedioPago))
apiRouter.patch('/medios-pago/:id', tenant, asyncHandler(patchMedioPago))
apiRouter.delete('/medios-pago/:id', tenant, asyncHandler(deleteMedioPago))

// ── Configuración de la clínica (convertido a database-per-tenant) ───────────
apiRouter.get('/clinica', tenant, asyncHandler(getClinica))
apiRouter.patch('/clinica', configTenant, asyncHandler(patchClinica))

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

// ── Área estética: zonas faciales + estado por zona + dibujo (capa 2) ─────────
// Cadena: módulo de la clínica (area_estetica); las escrituras exigen además el
// área habilitada en el usuario (assertAreaDisponible en el controller).
const esteticaTenant = [requireAuth, requireTenant, requireModulo('area_estetica')]
apiRouter.get('/zonas-faciales', esteticaTenant, asyncHandler(estetica.getZonasFaciales))
apiRouter.get('/pacientes/:id/zonas-faciales', esteticaTenant, asyncHandler(estetica.getZonasFicha))
apiRouter.put('/pacientes/:id/zonas-faciales', esteticaTenant, asyncHandler(estetica.putZonaFicha))
apiRouter.get('/pacientes/:id/dibujo-facial', esteticaTenant, asyncHandler(estetica.getDibujoFacial))
apiRouter.put('/pacientes/:id/dibujo-facial', esteticaTenant, asyncHandler(estetica.putDibujoFacial))

// ── Presupuestos ─────────────────────────────────────────────────────────────
apiRouter.get('/presupuestos', tenant, asyncHandler(presupuestos.getPresupuestos))
apiRouter.get('/presupuestos/:id', tenant, asyncHandler(presupuestos.getPresupuesto))
apiRouter.post('/presupuestos', tenant, asyncHandler(presupuestos.postPresupuesto))
apiRouter.patch('/presupuestos/:id', tenant, asyncHandler(presupuestos.patchPresupuesto))

// ── Cajas (sesiones, movimientos) ────────────────────────────────────────────
apiRouter.get('/cajas', tenant, asyncHandler(caja.getCajas))
apiRouter.get('/cajas/resumen', tenant, asyncHandler(caja.getResumenCajas)) // estado abiertas/cerradas (antes de /:id)
apiRouter.get('/cajas/gestion', [requireAuth, requireTenant, requirePermiso('puedeGestionarCajas')], asyncHandler(caja.getGestionCajas)) // todas las cajas (admin o autorizado)
// Operadores (usuarios que pueden ser responsables de una caja) y abrir la caja de
// otro usuario: admin o gestor de cajas (antes de /:id).
apiRouter.get('/cajas/operadores', [requireAuth, requireTenant, requirePermiso('puedeGestionarCajas')], asyncHandler(caja.getOperadores))
apiRouter.post('/cajas/abrir-para-usuario', [requireAuth, requireTenant, requirePermiso('puedeGestionarCajas')], asyncHandler(caja.postAbrirParaUsuario))
// Reportes de pagos recibidos por periodo (antes de /:id). Admin o gestor de cajas.
apiRouter.get('/cajas/reporte-pagos', [requireAuth, requireTenant, requirePermiso('puedeGestionarCajas')], asyncHandler(caja.getReportePagos))
apiRouter.get('/cajas/reporte-profesionales', [requireAuth, requireTenant, requirePermiso('puedeGestionarCajas')], asyncHandler(caja.getReporteProfesionales))
// Crear caja: admin o usuario con permiso de recibir pagos (crea su propia caja).
apiRouter.post('/cajas', [requireAuth, requireTenant, requirePermiso('puedeRecibirPagos')], asyncHandler(caja.postCaja))
apiRouter.get('/cajas/:id', tenant, asyncHandler(caja.getCaja))
// Editar/desactivar (asignar usuarios, renombrar): admin o gestor de cajas.
apiRouter.patch('/cajas/:id', [requireAuth, requireTenant, requirePermiso('puedeGestionarCajas')], asyncHandler(caja.patchCaja))
apiRouter.delete('/cajas/:id', [requireAuth, requireTenant, requirePermiso('puedeGestionarCajas')], asyncHandler(caja.deleteCaja))
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
apiRouter.post('/cobros/link-pago', tenant, asyncHandler(cobros.postCobroLinkPago))
apiRouter.patch('/cobros/:id', tenant, asyncHandler(cobros.patchCobro))
apiRouter.post('/cobros/:id/anular', tenant, asyncHandler(cobros.postAnularCobro))
apiRouter.delete('/cobros/:id', tenant, asyncHandler(cobros.deleteCobro))
// Link de pago online (Flow) por cobro + estado de sus pagos.
apiRouter.post('/cobros/:id/link-pago', tenant, asyncHandler(pagosOnline.postLinkParaCobro))
apiRouter.get('/cobros/:id/pagos-online', tenant, asyncHandler(pagosOnline.getPagosDeCobro))

// Configuración de pagos online (Flow) — admin de la clínica.
apiRouter.get('/pagos-online/config', adminTenant, asyncHandler(pagosOnline.getConfig))
apiRouter.patch('/pagos-online/config', adminTenant, asyncHandler(pagosOnline.patchConfig))

// ── Correo (envío de documentos + historial) ─────────────────────────────────
apiRouter.post('/emails/enviar', tenant, asyncHandler(email.postEnviar))
apiRouter.get('/emails', tenant, asyncHandler(email.getEmails))

// ── Contratos ────────────────────────────────────────────────────────────────
apiRouter.get('/contratos', tenant, asyncHandler(liq.getContratos))
apiRouter.post('/contratos', tenant, asyncHandler(liq.postContrato))
apiRouter.patch('/contratos/:id', tenant, asyncHandler(liq.patchContrato))
apiRouter.delete('/contratos/:id', tenant, asyncHandler(liq.deleteContrato))

// Montos fijos por prestación (override del contrato base, por profesional).
apiRouter.get('/montos-fijos/:doctorId', tenant, asyncHandler(liq.getMontosFijos))
apiRouter.post('/montos-fijos', tenant, asyncHandler(liq.postMontoFijo))
apiRouter.delete('/montos-fijos/:id', tenant, asyncHandler(liq.deleteMontoFijo))

// ── Liquidaciones ────────────────────────────────────────────────────────────
// Activas (saldo corriente por profesional) + finalizar.
apiRouter.get('/liquidaciones-activas', tenant, asyncHandler(liq.getLiquidacionesActivas))
apiRouter.post('/liquidaciones-activas/finalizar-todas', tenant, asyncHandler(liq.postFinalizarTodas))
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
apiRouter.get('/admin/configuracion', sa, asyncHandler(admin.getConfiguracion))
apiRouter.get('/admin/suscripciones/resumen', sa, asyncHandler(admin.getResumen))
apiRouter.get('/admin/leads', sa, asyncHandler(admin.getLeads))
apiRouter.patch('/admin/leads/:id', sa, asyncHandler(admin.patchLead))
// Clínicas
apiRouter.get('/admin/clinicas', sa, asyncHandler(admin.getClinicas))
apiRouter.post('/admin/clinicas', sa, asyncHandler(admin.postClinica))
apiRouter.get('/admin/clinicas/:id', sa, asyncHandler(admin.getClinica))
apiRouter.patch('/admin/clinicas/:id', sa, asyncHandler(admin.patchClinica))
apiRouter.post('/admin/clinicas/:id/cambiar-plan', sa, asyncHandler(admin.postCambiarPlan))
apiRouter.post('/admin/clinicas/:id/estado', sa, asyncHandler(admin.postEstado))
apiRouter.post('/admin/clinicas/:id/extender-trial', sa, asyncHandler(admin.postExtenderTrial))
apiRouter.patch('/admin/clinicas/:id/slug', sa, asyncHandler(admin.patchSlug))
apiRouter.post('/admin/clinicas/:id/convertir', sa, asyncHandler(admin.postConvertir))
apiRouter.patch('/admin/clinicas/:id/pais', sa, asyncHandler(admin.patchPais))
apiRouter.patch('/admin/clinicas/:id/modulos', sa, asyncHandler(admin.patchModulos))
apiRouter.patch('/admin/clinicas/:id/profesionales-extra', sa, asyncHandler(admin.patchProfesionalesExtra))
apiRouter.patch('/admin/clinicas/:id/cobro', sa, asyncHandler(admin.patchCobro))
apiRouter.get('/admin/pagos', sa, asyncHandler(admin.getPagosPlataforma))
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
apiRouter.post('/admin/clinicas/:id/whatsapp/probar', sa, asyncHandler(admin.postProbarWhatsapp))
// Integración de agenda con TuBot: token dedicado por clínica (super-admin).
apiRouter.get('/admin/clinicas/:id/tubot', sa, asyncHandler(tubotAgenda.getTubotConfig))
apiRouter.post('/admin/clinicas/:id/tubot/token', sa, asyncHandler(tubotAgenda.postTubotToken))
apiRouter.delete('/admin/clinicas/:id/tubot/token', sa, asyncHandler(tubotAgenda.deleteTubotToken))
apiRouter.get('/admin/clinicas/:id/tubot/webhook', sa, asyncHandler(admin.getTubotWebhook))
apiRouter.put('/admin/clinicas/:id/tubot/webhook', sa, asyncHandler(admin.putTubotWebhook))
// Planes de suscripción
apiRouter.get('/admin/planes-suscripcion', sa, asyncHandler(admin.getPlanes))
apiRouter.post('/admin/planes-suscripcion', sa, asyncHandler(admin.postPlan))
apiRouter.patch('/admin/planes-suscripcion/:id', sa, asyncHandler(admin.patchPlan))
apiRouter.delete('/admin/planes-suscripcion/:id', sa, asyncHandler(admin.deletePlan))

// ── Reportes (descargas XLSX con datos sensibles) — permiso puedeVerReportes ──
apiRouter.get('/reportes/pacientes', reportesTenant, asyncHandler(reportes.getPacientes))
apiRouter.get('/reportes/citas', reportesTenant, asyncHandler(reportes.getCitas))
apiRouter.get('/reportes/cobros', reportesTenant, asyncHandler(reportes.getCobros))
apiRouter.get('/reportes/tratamientos', reportesTenant, asyncHandler(reportes.getTratamientos))
apiRouter.get('/reportes/liquidaciones', reportesTenant, asyncHandler(reportes.getLiquidaciones))
apiRouter.get('/reportes/caja', reportesTenant, asyncHandler(reportes.getCaja))
apiRouter.get('/reportes/morosos', reportesTenant, asyncHandler(reportes.getMorosos))
