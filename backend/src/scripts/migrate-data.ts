// ─────────────────────────────────────────────────────────────────────────────
//  F7 — Migración de datos: monolito (DB compartida con clinicaId) → per-tenant
// ─────────────────────────────────────────────────────────────────────────────
//
//  Lee la base COMPARTIDA del monolito (LEGACY_DATABASE_URL) y vuelca, por cada
//  clínica:
//    - control-plane: Clinica (con dbName + routing waEnabled/waNumero),
//      planes, leads, pagos, extras, super-admins (PlatformAdmin), auditoría.
//    - base del tenant: Configuracion (derivada de la Clinica legacy) + todos
//      los modelos operativos (sin clinicaId), respetando el orden de FKs.
//
//  Mapeo no obvio (la Clinica legacy concentraba la config de integraciones):
//    legacy.Clinica  → control.Clinica   (perfil comercial + routing WA)
//                    → tenant.Configuracion (perfil + WA completo + tokens Google)
//    legacy.User(isPlatformAdmin) → control.PlatformAdmin
//    legacy.Configuracion (singleton "Digital-Dent") se IGNORA: su info ya vive
//      en la Clinica legacy (es un remanente pre-multitenant).
//
//  Idempotente: provisión idempotente + createMany({ skipDuplicates }) + upserts.
//  Se puede correr varias veces sin duplicar.
//
//  SEGURIDAD: por defecto corre en DRY-RUN (solo lee y reporta). Para escribir
//  de verdad hay que pasar --apply.
//
//    npm run migrate:data                 # dry-run (preview de conteos)
//    npm run migrate:data -- --apply      # ejecuta la migración
//
//  Requiere: LEGACY_DATABASE_URL (origen), CONTROL_DATABASE_URL + TENANT_DB_SERVER_URL
//  (destino, con permiso CREATE DATABASE) y haber corrido `npm run prisma:generate:legacy`.
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import { Prisma as TenantPrisma } from '../../prisma/generated/tenant/index.js'
import { Prisma as ControlPrisma } from '../../prisma/generated/control/index.js'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { provisionTenant, dbNameForSlug } from '@/lib/provision'
import { env } from '@/config/env'

const APPLY = process.argv.includes('--apply')
const DRY = !APPLY

// El cliente "legacy" (schema del monolito) se genera aparte con
// `npm run prisma:generate:legacy` y NO está en postinstall. Lo cargamos por
// import dinámico con ruta computada para no acoplar el typecheck a su existencia.
let legacy: any
async function loadLegacyClient(url: string): Promise<any> {
  const rel = ['..', '..', 'prisma', 'generated', 'legacy', 'index.js'].join('/')
  let mod: any
  try {
    mod = await import(rel)
  } catch {
    throw new Error('Falta el cliente legacy. Corre primero: npm run prisma:generate:legacy')
  }
  return new mod.PrismaClient({ datasources: { db: { url } } })
}

// Orden de inserción FK-safe en la base del tenant (padres antes que hijos).
// Configuracion se trata aparte (singleton derivado de la Clinica legacy).
const TENANT_ORDER = [
  'User', 'Paciente', 'Prestacion', 'MedioPago', 'Caja',
  'FichaClinica', 'Diente', 'ComentarioAdministrativo',
  'Cita', 'MensajePaciente', 'CitaLog',
  'PlanTratamiento', 'SeccionPlan', 'Tratamiento', 'Evolucion',
  'Presupuesto', 'ItemPresupuesto',
  'SesionCaja', 'CajaUsuario', 'Cobro', 'CobroItem', 'MovimientoCaja',
  'Contrato', 'Liquidacion', 'LiquidacionItem',
  'HorarioDoctor', 'BloqueoAgenda',
] as const

// Nombres de campos escalares por modelo (desde el DMMF del cliente destino).
// Sirve para copiar fila a fila descartando automáticamente columnas que el
// modelo destino ya no tiene (clinicaId, isPlatformAdmin, relaciones, etc.).
function scalarFields(models: readonly { name: string; fields: readonly { name: string; kind: string }[] }[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const m of models) {
    map[m.name] = m.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name)
  }
  return map
}
const TENANT_FIELDS = scalarFields(TenantPrisma.dmmf.datamodel.models as any)
const CONTROL_FIELDS = scalarFields(ControlPrisma.dmmf.datamodel.models as any)

// delegate('BloqueoAgenda') → client.bloqueoAgenda
const delegate = (client: any, model: string) => client[model.charAt(0).toLowerCase() + model.slice(1)]
const pick = (row: any, fields: string[]) => {
  const o: any = {}
  for (const f of fields) if (row[f] !== undefined) o[f] = row[f]
  return o
}

const counts: Record<string, number> = {}
const bump = (k: string, n: number) => { counts[k] = (counts[k] ?? 0) + n }

// Modelos HIJOS del monolito que NO tienen clinicaId propio: se scopean por la
// relación a su padre (que sí lo tiene). El resto filtra por clinicaId directo.
const PARENT_FILTER: Record<string, (clinicaId: string) => any> = {
  CitaLog:         (clinicaId) => ({ cita: { clinicaId } }),
  Diente:          (clinicaId) => ({ ficha: { clinicaId } }),
  SeccionPlan:     (clinicaId) => ({ plan: { clinicaId } }),
  ItemPresupuesto: (clinicaId) => ({ presupuesto: { clinicaId } }),
  CajaUsuario:     (clinicaId) => ({ caja: { clinicaId } }),
  CobroItem:       (clinicaId) => ({ cobro: { clinicaId } }),
  LiquidacionItem: (clinicaId) => ({ liquidacion: { clinicaId } }),
}

// Copia un modelo del tenant filtrando por clínica en el origen (clinicaId directo
// o, para los hijos, por la relación a su padre).
async function copyTenantModel(db: any, model: string, clinicaId: string): Promise<void> {
  const where = PARENT_FILTER[model] ? PARENT_FILTER[model](clinicaId) : { clinicaId }
  const rows = await delegate(legacy, model).findMany({ where })
  if (rows.length === 0) return
  const data = rows.map((r: any) => pick(r, TENANT_FIELDS[model]))
  if (!DRY) await delegate(db, model).createMany({ data, skipDuplicates: true })
  bump(`tenant.${model}`, rows.length)
}

// Copia un modelo del control-plane (origen filtrable opcional).
async function copyControlModel(model: string, legacyModel = model, where?: any): Promise<void> {
  const rows = await delegate(legacy, legacyModel).findMany(where ? { where } : {})
  if (rows.length === 0) return
  const data = rows
    .map((r: any) => pick(r, CONTROL_FIELDS[model]))
    .filter((d: any) => model !== 'PlatformAdmin' || d.email) // PlatformAdmin.email es requerido
  if (data.length === 0) return
  if (!DRY) await delegate(control, model).createMany({ data, skipDuplicates: true })
  bump(`control.${model}`, data.length)
}

async function main() {
  console.log(`\n=== F7 migración de datos — ${DRY ? 'DRY-RUN (solo lectura)' : 'APPLY (escribe)'} ===`)
  console.log(`origen  LEGACY_DATABASE_URL  = ${mask(env.legacyDatabaseUrl)}`)
  console.log(`destino CONTROL_DATABASE_URL = ${mask(env.controlDatabaseUrl)}`)
  console.log(`destino TENANT_DB_SERVER_URL = ${mask(env.tenantDbServerUrl)}\n`)

  legacy = await loadLegacyClient(env.legacyDatabaseUrl)

  // 1) Globales del control-plane sin dependencia de Clinica.
  await copyControlModel('PlanSuscripcion')
  // Super-admins: en el monolito son User con isPlatformAdmin=true.
  await copyControlModel('PlatformAdmin', 'User', { isPlatformAdmin: true })
  await copyControlModel('AuditLogAdmin')

  // 2) Clínicas: registro en control + provisión + volcado de la base del tenant.
  const clinicas = await legacy.clinica.findMany()
  console.log(`Clínicas encontradas: ${clinicas.length}\n`)

  for (const cl of clinicas) {
    const dbName = dbNameForSlug(cl.slug)
    console.log(`• ${cl.slug}  →  ${dbName}${cl.esDemo ? '  (demo)' : ''}`)

    // 2a) control.Clinica (inyecta dbName + routing WA; excluye credenciales WA/Google).
    const clinicData = {
      id: cl.id, slug: cl.slug, dbName,
      nombre: cl.nombre, rut: cl.rut, email: cl.email, telefono: cl.telefono,
      plan: cl.plan, activo: cl.activo, trialHasta: cl.trialHasta,
      cicloFacturacion: cl.cicloFacturacion, precioAcordado: cl.precioAcordado,
      proximoCobro: cl.proximoCobro, notasInternas: cl.notasInternas,
      waEnabled: cl.waEnabled, waNumero: cl.waNumero,
      esDemo: cl.esDemo, demoExpiraEn: cl.demoExpiraEn,
    }
    if (!DRY) await control.clinica.upsert({ where: { id: cl.id }, create: clinicData, update: clinicData })
    bump('control.Clinica', 1)

    // 2b) Provisión idempotente de la base física del tenant.
    if (!DRY) await provisionTenant(dbName)

    // 2c) Configuracion del tenant (derivada de la Clinica legacy).
    const db = DRY ? null : tenantClient(dbName)
    const cfg = {
      id: 'singleton',
      nombre: cl.nombre, rut: cl.rut, direccion: cl.direccion, ciudad: cl.ciudad,
      telefono: cl.telefono, email: cl.email, logoUrl: cl.logoUrl, mensajeWA: cl.mensajeWA,
      waEnabled: cl.waEnabled, waTwilioSid: cl.waTwilioSid, waTwilioToken: cl.waTwilioToken,
      waNumero: cl.waNumero, waTemplateSid: cl.waTemplateSid, waHorasAntes: cl.waHorasAntes,
      googleRefreshToken: cl.googleRefreshToken, googleAccessToken: cl.googleAccessToken,
      googleTokenExpiresAt: cl.googleTokenExpiresAt, googleAccountEmail: cl.googleAccountEmail,
      googleConnectedAt: cl.googleConnectedAt, googleConnectedById: cl.googleConnectedById,
      googleConnectedByName: cl.googleConnectedByName,
    }
    if (!DRY) await db!.configuracion.upsert({ where: { id: 'singleton' }, create: cfg, update: cfg })
    bump('tenant.Configuracion', 1)

    // 2d) Modelos operativos del tenant en orden FK-safe.
    for (const model of TENANT_ORDER) await copyTenantModel(db, model, cl.id)
  }

  // 3) Registros del control-plane que referencian Clinica (tras crearlas).
  await copyControlModel('PagoSuscripcion')
  await copyControlModel('ExtraSuscripcion')
  await copyControlModel('Lead')

  // 4) Resumen.
  console.log(`\n=== Resumen (${DRY ? 'a copiar' : 'copiado'}) ===`)
  for (const k of Object.keys(counts).sort()) console.log(`  ${k.padEnd(28)} ${counts[k]}`)
  if (DRY) console.log('\nDRY-RUN: no se escribió nada. Reejecuta con  -- --apply  para migrar.')
  else console.log('\n✔ Migración aplicada.')
}

function mask(url: string): string {
  try {
    const u = new URL(url)
    if (u.password) u.password = '***'
    return u.toString()
  } catch {
    return '(url inválida)'
  }
}

main()
  .catch((e) => { console.error('\n✖ Falló la migración:', e); process.exitCode = 1 })
  .finally(async () => { await legacy?.$disconnect().catch(() => {}) })
