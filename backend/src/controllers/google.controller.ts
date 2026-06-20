import type { Request, Response } from 'express'
import { control } from '@/db/control'
import { tenantClient } from '@/db/tenant'
import { tenantDb } from '@/middlewares/tenant'
import { env } from '@/config/env'
import { badRequest, forbidden, unauthorized } from '@/lib/errors'
import { verifyToken } from '@/services/auth.service'
import {
  buildAuthUrl, disconnectClinica, exchangeCodeForTokens, listCalendars,
  saveTokensForClinica, signOAuthState, verifyOAuthState,
} from '@/lib/google'
import { findMatchingPaciente, syncAllMappedUsers, syncCalendar } from '@/lib/google-sync'

const FRONTEND_URL = (env.corsOrigins[0] ?? 'https://app.clariva.cl').replace(/\/$/, '')

// Base del frontend de la clínica que inició el flujo. Con dominio de plataforma
// configurado, cada clínica vive en su subdominio (<slug>.dominio); si no, cae al
// FRONTEND_URL (dev / origen único).
function clinicaFrontendBase(slug?: string): string {
  return env.platformDomain && slug ? `https://${slug}.${env.platformDomain}` : FRONTEND_URL
}

// GET /api/v1/google/connect → devuelve { authUrl } (el SPA navega a esa URL).
// Solo admin de la clínica. req.clinica lo resuelve requireTenant.
export async function getConnect(req: Request, res: Response) {
  if (req.auth!.role !== 'admin') throw forbidden('Solo el admin puede conectar Google Calendar.')
  const clinica = req.clinica!
  const state = signOAuthState({ clinicaId: clinica.id, slug: clinica.slug, userId: req.auth!.sub })
  res.json({ authUrl: buildAuthUrl(state) })
}

// GET /api/v1/google/callback → público (autorizado por el state firmado).
// Intercambia el code, guarda tokens en la base del tenant y redirige al frontend.
export async function getCallback(req: Request, res: Response) {
  const code = req.query.code as string | undefined
  const stateRaw = req.query.state as string | undefined
  const error = req.query.error as string | undefined
  // Base de redirección: arranca genérica y, al validar el state, pasa a ser el
  // subdominio de la clínica que originó el flujo.
  let redirectBase = clinicaFrontendBase()
  const dest = (estado: string, extra = '') => `${redirectBase}/configuracion?google=${estado}${extra}`

  if (error) return res.redirect(dest('error', `&reason=${encodeURIComponent(error)}`))
  if (!code || !stateRaw) return res.redirect(dest('error', '&reason=missing_params'))

  const state = verifyOAuthState(stateRaw)
  if (!state) return res.redirect(dest('error', '&reason=invalid_state'))
  redirectBase = clinicaFrontendBase(state.slug)

  // El state lleva el id de control-plane; resolvemos la base física de la clínica.
  const clinica = await control.clinica.findUnique({
    where: { id: state.clinicaId },
    select: { id: true, slug: true, activo: true, dbName: true },
  })
  if (!clinica || !clinica.activo || clinica.slug !== state.slug) return res.redirect(dest('error', '&reason=clinica_not_found'))

  const db = tenantClient(clinica.dbName)
  const user = await db.user.findUnique({
    where: { id: state.userId },
    select: { id: true, role: true, name: true, email: true },
  })
  if (!user || user.role !== 'admin') return res.redirect(dest('error', '&reason=unauthorized'))

  try {
    const tokens = await exchangeCodeForTokens(code)
    await saveTokensForClinica(db, { tokens, connectedById: user.id, connectedByName: user.name ?? user.email })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'exchange_failed'
    return res.redirect(dest('error', `&reason=${encodeURIComponent(msg)}`))
  }
  res.redirect(dest('connected'))
}

// POST /api/v1/google/disconnect → admin.
export async function postDisconnect(req: Request, res: Response) {
  if (req.auth!.role !== 'admin') throw forbidden('Solo el admin puede desconectar Google Calendar.')
  await disconnectClinica(tenantDb(req))
  res.json({ ok: true })
}

// GET /api/v1/google/calendars → admin.
export async function getCalendars(req: Request, res: Response) {
  if (req.auth!.role !== 'admin') throw forbidden('Solo el admin puede listar calendarios.')
  res.json(await listCalendars(tenantDb(req)))
}

// POST /api/v1/google/sync → cron (x-cron-secret, sin sesión) o admin de la
// clínica (Bearer). Ruta pública: valida el token inline en el modo manual.
export async function postSync(req: Request, res: Response) {
  const headerSecret = req.headers['x-cron-secret']
  const isCron = Boolean(env.cronSecret && headerSecret === env.cronSecret)
  const targetUserId = typeof req.body?.userId === 'string' ? req.body.userId : null

  if (isCron) {
    // Cron sin objetivo: recorre todas las clínicas con Google conectado.
    // Cron con userId: no podemos resolver su base sin saber la clínica, así que
    // ese caso solo se soporta vía trigger manual (con sesión de clínica).
    if (!targetUserId) return void res.json({ summaries: await syncAllMappedUsers() })
  }

  // Trigger manual desde la UI (o cron con userId): requiere admin de una clínica.
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) throw unauthorized()
  const payload = verifyToken(token)
  if (!payload.clinicaId) throw forbidden('Requiere una clínica')
  if (payload.role !== 'admin') throw forbidden('Forbidden')

  const clinica = await control.clinica.findUnique({ where: { id: payload.clinicaId }, select: { dbName: true } })
  if (!clinica) throw badRequest('Clínica no encontrada')
  const db = tenantClient(clinica.dbName)

  if (targetUserId) {
    const ok = await db.user.findFirst({ where: { id: targetUserId }, select: { id: true } })
    if (!ok) throw badRequest('User not in clinic')
    return void res.json({ summaries: [await syncCalendar(db, targetUserId)] })
  }
  const users = await db.user.findMany({ where: { activo: true, googleCalendarId: { not: null } }, select: { id: true } })
  const summaries = []
  for (const u of users) summaries.push(await syncCalendar(db, u.id))
  res.json({ summaries })
}

// POST /api/v1/google/reconcile-bloqueos → admin. Promueve bloqueos de Google
// que matchean un paciente a citas reales.
export async function postReconcileBloqueos(req: Request, res: Response) {
  if (req.auth!.role !== 'admin') throw forbidden('Forbidden')
  const db = tenantDb(req)
  const userName = req.auth!.name ?? req.auth!.email ?? 'Sistema'

  const bloqueos = await db.bloqueoAgenda.findMany({
    where: { googleEventId: { not: null } },
    select: { id: true, doctorId: true, inicio: true, fin: true, motivo: true, googleEventId: true },
  })
  let converted = 0
  const skipped: { id: string; motivo: string | null; reason: string }[] = []
  for (const b of bloqueos) {
    const pacienteId = await findMatchingPaciente(db, b.motivo ?? '')
    if (!pacienteId) { skipped.push({ id: b.id, motivo: b.motivo, reason: 'no_unique_match' }); continue }
    const duracionMin = Math.max(15, Math.round((b.fin.getTime() - b.inicio.getTime()) / 60000))
    try {
      await db.$transaction([
        db.cita.create({
          data: {
            pacienteId, doctorId: b.doctorId, fecha: b.inicio, duracion: duracionMin,
            estado: 'CONFIRMADA', tipo: 'CONSULTA', googleEventId: b.googleEventId, googleSyncedAt: new Date(),
            logs: { create: { tipo: 'AGENDADA', detalle: `Convertida desde bloqueo (título original: "${b.motivo ?? ''}")`, userName } },
          },
        }),
        db.bloqueoAgenda.delete({ where: { id: b.id } }),
      ])
      converted++
    } catch (e) {
      skipped.push({ id: b.id, motivo: b.motivo, reason: (e instanceof Error ? e.message : 'conversion_failed').slice(0, 100) })
    }
  }
  res.json({ total: bloqueos.length, converted, skippedCount: skipped.length, skipped: skipped.slice(0, 20) })
}
