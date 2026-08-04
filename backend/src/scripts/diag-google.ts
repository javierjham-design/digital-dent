// Diagnóstico READ-ONLY de la integración con Google Calendar. Recorre las
// clínicas del control-plane y, en la base de cada una, reporta:
//   - si la clínica tiene conexión con Google (refresh token) y con qué cuenta,
//   - qué usuarios tienen un calendario mapeado (googleCalendarId),
//   - su último googleSyncedAt y si ya tienen syncToken incremental,
//   - cuántas Citas/Bloqueos tienen googleEventId (están espejados en Google),
//   - cuántas Citas/Bloqueos quedaron con googleSyncError (fallas silenciosas).
//
// No escribe nada. Sirve para decidir si la integración se usa (y hay que
// arreglarla) o no se usa (y se retira). Ver docs/PROMPTS_SIGUIENTES.md.
//
// Uso (backend Railway Console, para pegar contra la BD de producción):
//   npm run diag:google
import { control } from '@/db/control'
import { tenantClient, disposeTenant } from '@/db/tenant'

function fmt(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16) + 'Z'
}

async function main() {
  const clinicas = await control.clinica.findMany({
    select: { slug: true, dbName: true, activo: true, esDemo: true },
    orderBy: { createdAt: 'asc' },
  })
  // eslint-disable-next-line no-console
  console.log(`\n[diag-google] ${clinicas.length} clínica(s) en el control-plane\n`)

  let totalConectadas = 0
  let totalUsuariosMapeados = 0
  let totalCitasEspejadas = 0
  let totalErrores = 0

  for (const c of clinicas) {
    const db = tenantClient(c.dbName)
    const marca = `${c.slug}${c.esDemo ? ' (demo)' : ''}${c.activo ? '' : ' (inactiva)'}`
    try {
      const cfg = await db.configuracion.findUnique({
        where: { id: 'singleton' },
        select: {
          googleRefreshToken: true,
          googleAccountEmail: true,
          googleConnectedAt: true,
          googleConnectedByName: true,
          googleTokenExpiresAt: true,
        },
      })
      const conectada = !!cfg?.googleRefreshToken
      if (conectada) totalConectadas++

      const users = await db.user.findMany({
        where: { googleCalendarId: { not: null } },
        select: {
          name: true, email: true, activo: true,
          googleCalendarId: true, googleSyncToken: true, googleSyncedAt: true,
        },
      })
      totalUsuariosMapeados += users.length

      const [citasEspejo, citasError, bloqEspejo, bloqError] = await Promise.all([
        db.cita.count({ where: { googleEventId: { not: null } } }),
        db.cita.count({ where: { googleSyncError: { not: null } } }),
        db.bloqueoAgenda.count({ where: { googleEventId: { not: null } } }),
        db.bloqueoAgenda.count({ where: { googleSyncError: { not: null } } }),
      ])
      totalCitasEspejadas += citasEspejo
      totalErrores += citasError + bloqError

      // eslint-disable-next-line no-console
      console.log(`━━ ${marca}`)
      if (!conectada) {
        // eslint-disable-next-line no-console
        console.log('   Google: NO conectado (sin refresh token)')
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `   Google: conectado como ${cfg?.googleAccountEmail ?? '(sin email)'}` +
          ` · desde ${fmt(cfg?.googleConnectedAt)} por ${cfg?.googleConnectedByName ?? '—'}` +
          ` · access token expira ${fmt(cfg?.googleTokenExpiresAt)}`,
        )
      }
      if (users.length === 0) {
        // eslint-disable-next-line no-console
        console.log('   Doctores mapeados: ninguno')
      } else {
        // eslint-disable-next-line no-console
        console.log(`   Doctores mapeados: ${users.length}`)
        for (const u of users) {
          // eslint-disable-next-line no-console
          console.log(
            `     · ${(u.name ?? u.email ?? '—').padEnd(28)}` +
            ` cal=${(u.googleCalendarId ?? '—').slice(0, 30).padEnd(30)}` +
            ` syncToken=${u.googleSyncToken ? 'sí' : 'no '}` +
            ` últimoSync=${fmt(u.googleSyncedAt)}` +
            `${u.activo ? '' : ' [inactivo]'}`,
          )
        }
      }
      // eslint-disable-next-line no-console
      console.log(
        `   Citas con googleEventId: ${citasEspejo} · Bloqueos: ${bloqEspejo}` +
        ` · con googleSyncError → citas ${citasError}, bloqueos ${bloqError}\n`,
      )
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`━━ ${marca}: ERROR`, e instanceof Error ? e.message : e, '\n')
    } finally {
      await disposeTenant(c.dbName)
    }
  }

  // eslint-disable-next-line no-console
  console.log('──────────────────────────────────────────────────────────────')
  // eslint-disable-next-line no-console
  console.log(
    `RESUMEN: ${totalConectadas}/${clinicas.length} clínicas conectadas · ` +
    `${totalUsuariosMapeados} doctor(es) con calendario mapeado · ` +
    `${totalCitasEspejadas} cita(s) espejadas en Google · ` +
    `${totalErrores} registro(s) con googleSyncError`,
  )
  // eslint-disable-next-line no-console
  console.log('──────────────────────────────────────────────────────────────\n')

  await control.$disconnect()
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
