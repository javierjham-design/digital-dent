import { createHmac } from 'crypto'
import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/crypto'

// Scopes mínimos: ver/editar eventos de calendario + email del usuario
// (para mostrar qué cuenta quedó conectada). Si querés bidireccional con
// creación/edición desde Cláriva, calendar y calendar.events son suficientes.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
]

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Falta la variable de entorno ${name}.`)
  return v
}

export function getOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    getEnv('GOOGLE_OAUTH_CLIENT_ID'),
    getEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
    getEnv('GOOGLE_OAUTH_REDIRECT_URI'),
  )
}

// ── State firmado (CSRF + carry de info al callback) ────────────────────────
// El callback es global (`https://app.clariva.cl/api/google/callback`), así que
// necesitamos meter en el state qué clínica originó el flow y a qué subdominio
// devolverla. Firmamos con HMAC-SHA256 sobre NEXTAUTH_SECRET para que nadie
// pueda armar un state válido manualmente y secuestrar la conexión.

export interface OAuthState {
  clinicaId: string
  slug: string
  userId: string
  iat: number   // segundos epoch
}

export function signOAuthState(payload: Omit<OAuthState, 'iat'>): string {
  const secret = getEnv('NEXTAUTH_SECRET')
  const full: OAuthState = { ...payload, iat: Math.floor(Date.now() / 1000) }
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyOAuthState(token: string, maxAgeSec = 600): OAuthState | null {
  try {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = createHmac('sha256', getEnv('NEXTAUTH_SECRET')).update(body).digest('base64url')
    if (sig !== expected) return null
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState
    if (!data.iat || Math.floor(Date.now() / 1000) - data.iat > maxAgeSec) return null
    if (!data.clinicaId || !data.slug || !data.userId) return null
    return data
  } catch {
    return null
  }
}

/**
 * URL para iniciar OAuth. `state` lo decodificamos en el callback para saber
 * a qué clínica corresponde el callback (patrón multi-tenant).
 */
export function buildAuthUrl(state: string): string {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',         // pide refresh_token
    prompt: 'consent',              // fuerza pedir refresh_token siempre
    scope: GOOGLE_SCOPES,
    include_granted_scopes: true,
    state,
  })
}

export interface GoogleTokens {
  refreshToken: string
  accessToken: string
  expiresAt: Date
  email: string | null
}

/**
 * Intercambia el `code` del callback por tokens y devuelve la info para
 * persistir. Lanza si Google no devolvió `refresh_token` (significa que el
 * usuario ya había autorizado antes — necesitamos `prompt=consent` para
 * forzarlo).
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    throw new Error('Google no devolvió refresh_token. Reintentá con prompt=consent.')
  }
  if (!tokens.access_token) {
    throw new Error('Google no devolvió access_token.')
  }

  // Pedimos el email del usuario que autorizó (informativo para la UI).
  client.setCredentials(tokens)
  let email: string | null = null
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const res = await oauth2.userinfo.get()
    email = res.data.email ?? null
  } catch {
    // No crítico — si falla, queda null.
  }

  const expiresAt = new Date(tokens.expiry_date ?? Date.now() + 55 * 60 * 1000)
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt,
    email,
  }
}

/**
 * Persiste los tokens cifrados en `Clinica`. Si ya había una conexión previa,
 * la reemplaza.
 */
export async function saveTokensForClinica(args: {
  clinicaId: string
  tokens: GoogleTokens
  connectedById: string
  connectedByName: string | null
}) {
  await prisma.clinica.update({
    where: { id: args.clinicaId },
    data: {
      googleRefreshToken: encrypt(args.tokens.refreshToken),
      googleAccessToken: encrypt(args.tokens.accessToken),
      googleTokenExpiresAt: args.tokens.expiresAt,
      googleAccountEmail: args.tokens.email,
      googleConnectedAt: new Date(),
      googleConnectedById: args.connectedById,
      googleConnectedByName: args.connectedByName,
    },
  })
}

/**
 * Devuelve un OAuth client autenticado y listo para usar con cualquier API
 * de Google Calendar para una clínica. Refresca el access_token si está
 * vencido y persiste el nuevo.
 */
export async function getAuthorizedClient(clinicaId: string): Promise<OAuth2Client | null> {
  const c = await prisma.clinica.findUnique({
    where: { id: clinicaId },
    select: {
      googleRefreshToken: true,
      googleAccessToken: true,
      googleTokenExpiresAt: true,
    },
  })
  if (!c?.googleRefreshToken) return null

  const client = getOAuthClient()
  const refreshToken = decrypt(c.googleRefreshToken)
  const accessToken = c.googleAccessToken ? decrypt(c.googleAccessToken) : undefined
  client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: c.googleTokenExpiresAt?.getTime(),
  })

  // Si el access token expiró (o expira en menos de 1 minuto), forzamos refresh.
  const ahora = Date.now()
  const expira = c.googleTokenExpiresAt?.getTime() ?? 0
  if (!accessToken || expira - ahora < 60 * 1000) {
    const res = await client.getAccessToken()
    if (res.token && res.res?.data) {
      const newExp = (res.res.data as { expiry_date?: number }).expiry_date
        ?? Date.now() + 55 * 60 * 1000
      await prisma.clinica.update({
        where: { id: clinicaId },
        data: {
          googleAccessToken: encrypt(res.token),
          googleTokenExpiresAt: new Date(newExp),
        },
      })
    }
  }

  return client
}

/**
 * Desconecta la clínica de Google: revoca el refresh token en Google
 * (best-effort) y limpia los campos en DB. También limpia el
 * googleCalendarId de todos los usuarios de la clínica (no tienen sentido
 * sin conexión).
 */
export async function disconnectClinica(clinicaId: string): Promise<void> {
  const c = await prisma.clinica.findUnique({
    where: { id: clinicaId },
    select: { googleRefreshToken: true },
  })
  if (c?.googleRefreshToken) {
    try {
      const client = getOAuthClient()
      const refreshToken = decrypt(c.googleRefreshToken)
      await client.revokeToken(refreshToken)
    } catch {
      // Si Google ya invalidó el token, no es un problema.
    }
  }
  await prisma.$transaction([
    prisma.clinica.update({
      where: { id: clinicaId },
      data: {
        googleRefreshToken: null,
        googleAccessToken: null,
        googleTokenExpiresAt: null,
        googleAccountEmail: null,
        googleConnectedAt: null,
        googleConnectedById: null,
        googleConnectedByName: null,
      },
    }),
    prisma.user.updateMany({
      where: { clinicaId },
      data: { googleCalendarId: null },
    }),
  ])
}

export interface CalendarOption {
  id: string
  summary: string
  description: string | null
  primary: boolean
  accessRole: string
  backgroundColor: string | null
}

/**
 * Lista todos los calendarios visibles para la cuenta conectada. Útil para
 * poblar el dropdown en el panel de Usuarios donde se asigna a cada doctor.
 */
export async function listCalendars(clinicaId: string): Promise<CalendarOption[]> {
  const auth = await getAuthorizedClient(clinicaId)
  if (!auth) throw new Error('La clínica no tiene conexión activa con Google.')
  const calendar = google.calendar({ version: 'v3', auth })
  const res = await calendar.calendarList.list({ minAccessRole: 'writer', showHidden: false })
  const items = res.data.items ?? []
  return items.map((c) => ({
    id: c.id ?? '',
    summary: c.summaryOverride ?? c.summary ?? c.id ?? '(sin nombre)',
    description: c.description ?? null,
    primary: c.primary ?? false,
    accessRole: c.accessRole ?? 'reader',
    backgroundColor: c.backgroundColor ?? null,
  }))
}
