export {} // módulo (evita colisión de `main` global con otros scripts de diagnóstico)
// DIAGNÓSTICO SOLO-LECTURA de la config de WhatsApp/TuBot de un tenant. No escribe nada.
// Distingue el camino EVENT-DRIVEN (agendaWh* → TuBot envía por workflows) del envío
// DIRECTO legacy (waEnabled + waApiKey → Cláriva envía por tubotProvider).
// Uso (contra prod): railway run -s BACKEND -- npx tsx src/scripts/diag-tubot-config.ts
// (toma DATABASE_PUBLIC_URL inyectada por railway como server URL del tenant).

// Correr desde local: forzar el host PÚBLICO (el interno .railway.internal no se alcanza).
if (process.env.DATABASE_PUBLIC_URL) {
  process.env.TENANT_DB_SERVER_URL = process.env.DATABASE_PUBLIC_URL
}

const dbName = process.env.DB || 'clariva_t_digital_dent'

async function main() {
  const { tenantClient } = await import('@/db/tenant')
  const db = tenantClient(dbName)
  const c = await db.configuracion.findUnique({ where: { id: 'singleton' } }) as Record<string, unknown> | null
  if (!c) { console.log(`Sin Configuracion en ${dbName}`); return }
  const mask = (v: unknown) => (v ? `SET(${String(v).length} chars)` : 'null')
  console.log(`\n=== Config TuBot/WhatsApp de ${dbName} ===`)
  console.log('\n-- EVENT-DRIVEN (agenda webhooks → TuBot envía) --')
  console.log('  agendaWhEnabled      :', c.agendaWhEnabled)
  console.log('  agendaWhConnectionId :', c.agendaWhConnectionId)
  console.log('  agendaWhSecret       :', mask(c.agendaWhSecret))
  console.log('\n-- Gestor de IA (maestro + flujos + horas + plantillas) --')
  console.log('  automatizacionesEnabled:', c.automatizacionesEnabled)
  console.log('  recordatoriosEnabled   :', c.recordatoriosEnabled, ' hora1:', c.recordatorioHora1, ' r2:', c.recordatorio2Enabled, ' hora2:', c.recordatorioHora2)
  console.log('  waTemplateRecordatorio :', c.waTemplateRecordatorio)
  console.log('  waTemplateRecordInsist :', c.waTemplateRecordInsist)
  console.log('  recapturaNoShowEnabled :', c.recapturaNoShowEnabled, ' tratEnabled:', c.recapturaTratEnabled)
  console.log('  tubotTemplates (cache) :', c.tubotTemplates ? String(c.tubotTemplates).slice(0, 300) : 'null')
  console.log('\n-- ENVÍO DIRECTO legacy (Cláriva → tubotProvider.enviarPlantilla) --')
  console.log('  waEnabled        :', c.waEnabled)
  console.log('  waApiKey         :', mask(c.waApiKey))
  console.log('  waConnectionId   :', c.waConnectionId)
  console.log('  waWebhookSecret  :', mask(c.waWebhookSecret))
  console.log('  waTemplateName   :', c.waTemplateName, ' lang:', c.waTemplateLang, ' horasAntes:', c.waHorasAntes)

  // Últimos reenvíos manuales: el detalle dice si TuBot aceptó (2xx) o rechazó (HTTP xxx).
  // Si el detalle es el texto VIEJO ("solicitado por recepción"), el nuevo código aún no desplegó.
  console.log('\n-- Últimos reenvíos manuales (WA_REENVIO_BOT) --')
  const logs = await db.citaLog.findMany({ where: { tipo: 'WA_REENVIO_BOT' }, orderBy: { createdAt: 'desc' }, take: 8, select: { createdAt: true, detalle: true, userName: true } })
  if (!logs.length) console.log('  (ninguno)')
  for (const l of logs) console.log(`  ${new Date(l.createdAt).toISOString()} · ${l.userName} :: ${l.detalle}`)
  console.log('')
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
