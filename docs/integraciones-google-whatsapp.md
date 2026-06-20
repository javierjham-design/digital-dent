# Integraciones: Google Calendar y WhatsApp (Twilio)

> Cómo se configuran las dos integraciones en Cláriva. Ambas se montan a **dos
> niveles**: una configuración **única a nivel plataforma** (la haces tú, el dueño)
> y una **activación por clínica**. Cada clínica sincroniza SU propio calendario y,
> si contrata WhatsApp, usa SUS propias credenciales/numero.

---

## 1. Google Calendar

### 1.1 Cómo funciona (arquitectura)

- Hay **UNA sola app de Google OAuth** para toda la plataforma (no una por clínica).
- El backend expone un **callback global**: `https://api.clariva.cl/api/v1/google/callback`.
- Cuando el admin de una clínica pulsa **"Conectar Google"**, el backend firma un
  `state` (HMAC) con el id/slug de esa clínica. Google redirige al callback global y,
  por el `state`, el backend sabe a **qué clínica** pertenece la conexión y guarda los
  tokens (cifrados) en la **base de esa clínica** (`Configuracion`).
- Scopes que pedimos: `calendar`, `calendar.events`, `userinfo.email`, `openid`.
  `calendar`/`calendar.events` son **scopes "sensibles"** de Google.

### 1.2 Configuración a nivel plataforma (UNA sola vez — la haces tú)

En [Google Cloud Console](https://console.cloud.google.com):

1. **Crear/elegir un proyecto** (p.ej. "Clariva").
2. **APIs y servicios → Biblioteca →** habilitar **Google Calendar API**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth:**
   - Tipo de usuario: **External**.
   - App name: `Cláriva`; email de soporte; logo (opcional pero ayuda en verificación).
   - **Dominios autorizados:** `clariva.cl`.
   - **Scopes:** agregar `.../auth/calendar`, `.../auth/calendar.events`,
     `.../auth/userinfo.email`, `openid`.
   - Email de contacto del desarrollador.
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth:**
   - Tipo: **Aplicación web**.
   - **URI de redireccionamiento autorizados:**
     `https://api.clariva.cl/api/v1/google/callback`
     (durante la validación previa al DNS, agregar también la URL
     `https://<backend>.up.railway.app/api/v1/google/callback`).
   - Guardar el **Client ID** y el **Client Secret**.
5. **Variables en Railway (servicio backend):**
   | Variable | Valor |
   |---|---|
   | `GOOGLE_OAUTH_CLIENT_ID` | el Client ID del paso 4 |
   | `GOOGLE_OAUTH_CLIENT_SECRET` | el Client Secret del paso 4 |
   | `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.clariva.cl/api/v1/google/callback` |

### 1.3 El límite de "100" — Testing vs Production (IMPORTANTE)

La pantalla de consentimiento tiene un **estado de publicación**:

- **Testing (por defecto):** solo pueden conectar las cuentas Google que agregues como
  **"usuarios de prueba"** (máx **100**), y el **refresh token caduca ~cada 7 días**
  (la clínica tendría que reconectar). Sirve para arrancar la marcha blanca con pocas
  clínicas: por cada clínica que vaya a conectar, agregás su cuenta Google en
  **Pantalla de consentimiento → Usuarios de prueba**.
- **Production:** sin límite de usuarios y sin caducidad semanal del refresh token.
  Pero como usamos scopes **sensibles** (Calendar), publicar exige la **verificación de
  Google** (revisión de la app: video, dominio verificado, política de privacidad
  publicada en `clariva.cl`). **Tarda 1–6 semanas.** Conviene **iniciar el trámite
  cuanto antes** y operar en Testing mientras tanto.

> Resumen: marcha blanca → **Testing** + agregar la cuenta Google de cada clínica como
> usuario de prueba. En paralelo, iniciar **verificación** para pasar a Production.

### 1.4 Activación por clínica (lo hace el admin de la clínica)

1. (Solo si la app está en Testing) tú agregás la cuenta Google de la clínica como
   usuario de prueba en la consola.
2. El admin entra a su clínica → **Configuración → "Conectar Google Calendar"** →
   elige su cuenta → acepta permisos → vuelve con banner verde.
3. En **Equipo**, "Cargar calendarios" y asignar a cada doctor su calendario.
4. Desde ahí la sync es automática: crear/editar/cancelar cita o bloqueo se refleja en
   Google, y un cron trae los cambios de Google (cada ~15 min, ver §3).

> Tras el cutover, recordar actualizar el **URI de redirección** en Google Cloud al
> dominio definitivo `https://api.clariva.cl/api/v1/google/callback`.

---

## 2. WhatsApp (Twilio)

### 2.1 Cómo funciona (arquitectura)

- Servicio **opcional y de pago por clínica**. La config vive en la `Configuracion` de
  la base de cada clínica; el **enrutamiento** (`waEnabled`, `waNumero`) se espeja al
  control-plane para que el webhook resuelva la clínica por su número.
- El **webhook global** de Twilio es `https://api.clariva.cl/api/v1/whatsapp/webhook`.
  Cada request se valida con la **firma de Twilio** usando el auth token (cifrado) de la
  clínica dueña de ese número.
- Plantilla de recordatorio (Content Template aprobado por Twilio) con 4 variables:
  `{{1}}` nombre del paciente · `{{2}}` nombre de la clínica · `{{3}}` fecha · `{{4}}` hora.

### 2.2 Configuración a nivel plataforma / por clínica (en Twilio)

Por cada clínica que contrate el servicio (o una cuenta Twilio de plataforma con
subcuentas/remitentes por clínica):

1. Cuenta **Twilio** con **WhatsApp Sender** aprobado (número emisor en formato E.164,
   p.ej. `+56912345678`).
2. **Content Template** aprobado con los 4 placeholders de §2.1. Anotar su **Content SID**
   (`HX...`).
3. En la consola de Twilio, configurar el **webhook entrante** del número a:
   `https://api.clariva.cl/api/v1/whatsapp/webhook` (método POST).
4. Tener a mano: **Account SID** (`AC...`), **Auth Token**, **número emisor** y **Content SID**.

### 2.3 Activación por clínica (lo hace el super-admin = tú)

En **`super-admin.clariva.cl` → /plataforma → Clínicas → (clínica) → WhatsApp**:

- `waTwilioSid` (AC…), `waTwilioToken` (se guarda **cifrado**), `waNumero` (E.164),
  `waTemplateSid` (HX…), `waHorasAntes` (ventana de envío), y marcar **`waEnabled`**.
- Al guardar, el sistema espeja `waEnabled`/`waNumero` al control-plane (enrutamiento del
  webhook) y la integración queda funcional para esa clínica.

> **Digital-Dent (ahora):** dejar `waEnabled = false`. No se configura nada en Twilio;
> el sistema queda **listo** para activarlo cuando se contrate, sin cambios de código.

### 2.4 Requisito de entorno

- `ENCRYPTION_KEY` (backend) debe ser **la misma del monolito**: con ella se cifran/
  descifran los auth tokens de Twilio y los tokens de Google ya guardados.

---

## 3. Crons (tareas programadas)

Recrear como jobs en Railway (o scheduler externo), autenticados con
`x-cron-secret: <CRON_SECRET>` (ver `docs/cutover.md` §2.5 y `docs/deploy-extras.md`):

| Tarea | Endpoint | Frecuencia |
|---|---|---|
| Recordatorios WhatsApp | `POST /api/v1/whatsapp/recordatorios` | cada 15–30 min |
| Sync Google Calendar | `POST /api/v1/google/sync` | cada ~15 min |
| Limpieza de demos | `POST /api/v1/demo/cleanup` | diaria |

Ambos crons recorren el **control-plane** y entran a la base de cada clínica que tenga la
integración activa, así que un solo job cubre a todas las clínicas.

---

## 4. Checklist rápido "dejar todo listo"

- [ ] Google: app OAuth creada, Calendar API habilitada, scopes + redirect URI, Client
      ID/Secret en Railway. Estado **Testing** con usuarios de prueba; verificación iniciada.
- [ ] WhatsApp: nada para Digital-Dent ahora (`waEnabled=false`). Documentado el alta para
      futuras clínicas (Twilio sender + template + webhook + panel super-admin).
- [ ] `ENCRYPTION_KEY` y `JWT_SECRET` iguales al monolito.
- [ ] Crons creados (al menos cleanup de demos; WA/Google al activarlos).
