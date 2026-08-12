# WhatsApp por TuBot — contrato de integración

> **Estado:** CONTRATO PRELIMINAR (Fase 0). Propuesto por Cláriva; a validar/implementar
> por TuBot. Mientras tanto, `mock-tubot/` implementa este contrato para desarrollar sin
> credenciales. Cuando TuBot lo implemente, en Cláriva solo cambian la base URL y las
> credenciales por clínica.

## Alcance

TuBot es el **canal de WhatsApp** de Cláriva para **recordatorio y confirmación de horas por
plantilla**. Nada más. Cláriva llama a una API REST para **enviar** y recibe **webhooks
firmados** para las respuestas y los estados de entrega.

**Fuera de alcance (otro proyecto):** la integración inversa (TuBot leyendo la agenda de
Cláriva para agendar solo). Este contrato **no** la anticipa ni deja ganchos.

## Modelo (una clínica = una cuenta de TuBot)

- Cada **clínica de Cláriva** se corresponde con una **organización de TuBot**, con su
  **propia WABA + número** (Embedded Signup) y su **propia plantilla aprobada**.
- **`connectionId`**: identificador estable por clínica/conexión que **TuBot emite al
  conectar** la clínica. Va en la URL del webhook entrante y es lo que **rutea al tenant
  correcto** en Cláriva (reemplaza al ruteo por número del Twilio actual).

## Autenticación y firma

- **Cláriva → TuBot** (enviar): `Authorization: Bearer cnvk_<key>`. La key es **por clínica**
  y de ella sale la organización (jamás se manda el `organizationId` desde el cliente).
  Key inválida/revocada ⇒ **`401` uniforme**.
- **TuBot → Cláriva** (recibir): header `X-Tubot-Signature: sha256=<hex>` donde
  `<hex> = HMAC-SHA256(webhookSecret_por_conexión, raw_body)`. Cláriva **conserva el body
  crudo** para verificar. Firma inválida **o `connectionId` inexistente** ⇒ **`401`
  uniforme** (no se distingue el caso, para no filtrar qué conexiones existen).

## Enviar — Cláriva → TuBot (base `/public/v1`)

### `POST /messages/template`

Envía un recordatorio por plantilla aprobada, con botones de respuesta rápida.

Headers:
- `Authorization: Bearer cnvk_<key>`
- `Idempotency-Key: <string>` — **obligatorio**. Cláriva usa **`cita_<citaId>_<fechaCitaISO>_<n>`**
  donde `<n>` es el **número de intento**: el envío **automático** usa siempre `_1`; un
  **reenvío manual** (la secretaria aprieta "reenviar" porque la paciente dice que no le llegó)
  **incrementa** `n` (`_2`, `_3`, …). Así el reenvío manual **salta el dedupe** a propósito y sí
  se manda, mientras que un reintento del cron por timeout (mismo `n=1`) no duplica.
- `Content-Type: application/json`

Body:
```jsonc
{
  "to": "+56912345678",
  "templateName": "recordatorio_cita",
  "languageCode": "es",
  // Variables del cuerpo, ORDENADAS y SIN TOPE (WhatsApp admite más de 4).
  // Canónico: arreglo posicional. También se acepta el mapa { "1": "...", "2": "..." }.
  "variables": ["María", "Clínica Norte", "lunes 12 de agosto", "10:30"],
  "buttons": [
    { "type": "quick_reply", "payload": "CONFIRMAR" },
    { "type": "quick_reply", "payload": "CANCELAR" },
    { "type": "quick_reply", "payload": "REAGENDAR" }
  ]
}
```

**Idempotencia (TuBot):** TuBot deduplica por `(organización, Idempotency-Key)` durante al
menos **72 h**. Reintento con la misma key (mismo `n`) ⇒ devuelve el **mismo `messageId`** y
**no reenvía**. Esto cubre el caso real: `enviarRecordatoriosPendientes` corre cada ~20 min y
si una tanda se corta por timeout, la siguiente reintenta con el **mismo `n=1`** → no duplica.
Un **reenvío manual** usa un `n` mayor → key distinta → sí se envía.

Respuestas:
- `202` → `{ "messageId": "...", "status": "accepted" }`
- `422` → `{ "error": "template_not_approved", "message": "..." }` (ver *Degradación*)
- `429` → rate limit (ver *Límites de tasa*), con header `Retry-After: <segundos>`
- `401` → key inválida
- `4xx` de validación → `{ "error": "...", "message": "..." }`

### `POST /messages/text`

Acuse de recibo en texto libre ("¡Listo! Tu hora quedó confirmada"). **Sólo válido dentro de
la ventana de 24 h** que abre el paciente al tocar un botón. Body `{ "to", "text" }` ⇒
`202 { "messageId" }`.

### `GET /templates/:name?languageCode=es`

Estado de aprobación de la plantilla de esa clínica (su WABA), para la *Degradación*:
`200 { "name", "languageCode", "status": "APPROVED" | "PENDING" | "REJECTED" | "DISABLED", "reason"? }`.

## Recibir — TuBot → Cláriva

`POST {CLARIVA_URL}/api/v1/whatsapp/webhook/{connectionId}`
Header `X-Tubot-Signature`. Body JSON crudo. Cláriva responde **`2xx` apenas acepta** (procesa
idempotente) y solo devuelve `5xx` si **no pudo aceptar** (para provocar reintento).

Tres eventos:

**1. `button`** — el paciente tocó un botón (camino principal):
```jsonc
{ "event": "button", "occurredAt": "2026-08-12T14:03:00Z",
  "from": "+56912345678", "providerMsgId": "wamid...IN",
  "replyTo": "wamid...OUT",  // messageId del recordatorio que enviamos
  "button": { "payload": "CONFIRMAR", "text": "Confirmar" } }
```

**2. `text`** — el paciente escribió en vez de tocar el botón (**respaldo**; Cláriva usa el
regex `interpretarRespuesta` degradado):
```jsonc
{ "event": "text", "from": "+56912345678", "providerMsgId": "wamid...IN",
  "replyTo": "wamid...OUT", "text": "sí, confirmo" }
```

**3. `status`** — estado de entrega del mensaje que **enviamos** (imprescindible para saber
que un recordatorio NO llegó):
```jsonc
{ "event": "status", "occurredAt": "2026-08-12T14:01:10Z",
  "providerMsgId": "wamid...OUT",
  "status": "sent" | "delivered" | "read" | "failed",
  "reason": "..." }   // presente sólo en failed (ej. número inexistente, bloqueó a la clínica)
```

**Idempotencia (Cláriva) — obligatoria:**
- `button`/`text`: dedupe por `providerMsgId` del inbound. Dos toques del mismo botón, o un
  reintento de TuBot, **no** producen dos transiciones de estado ni dos acuses.
- `status`: se aplica el estado **más avanzado** (`sent < delivered < read`, y `failed`
  aparte); reprocesar el mismo `status` es no-op.

## Estado de entrega visible en la agenda

- `failed` ⇒ además del log, Cláriva marca el recordatorio de esa cita como **"No se pudo
  entregar"** (con el motivo) y lo hace **visible en la agenda**, porque ese es el momento en
  que recepción tiene que volver a entrar. No queda solo en un log.
- `sent`/`delivered`/`read` actualizan el estado informativo del recordatorio (no cambian el
  estado de la cita).

## Reintentos del webhook (TuBot → Cláriva)

- TuBot **reintenta** ante **timeout** o respuesta **`5xx`**. Ante **`4xx` NO reintenta**
  (un `4xx` significa firma/contrato inválido: descartar, no insistir).
- Backoff exponencial propuesto: **0s, 30s, 2m, 10m, 30m, 2h, 6h**, hasta **~24 h** (7
  intentos). *(Valores a confirmar por TuBot.)*
- Cláriva es idempotente (arriba), así que los reintentos son seguros.

## Límites de tasa

- TuBot limita **por organización** (valores a fijar por TuBot; propuesto ~**10 req/s**,
  burst 20). Al exceder ⇒ `429` con `Retry-After: <segundos>`.
- **Qué hace Cláriva ante `429`:** respeta `Retry-After`, **corta la tanda** actual del cron
  (no hace loop apretado) y deja las citas no enviadas para la **próxima corrida** (~20 min).
  Como el envío es idempotente por `Idempotency-Key`, las que sí salieron **no se duplican**.

## Alta de una clínica (qué guarda Cláriva y de dónde sale)

TuBot, al conectar la clínica (Embedded Signup + emisión de credenciales), entrega:
- `apiKey` (`cnvk_…`) — se guarda **cifrada**.
- `connectionId` — `@unique`, rutea el webhook al tenant.
- `webhookSecret` — se guarda **cifrado**; verifica la firma del inbound.
- `templateName` (+ `languageCode`) — la plantilla aprobada de esa clínica.

Cláriva ya tenía y conserva: `waNumero` (display), `waEnabled`, `waHorasAntes`.

**Degradación (plantilla no aprobada):** antes de habilitar el servicio (y en la prueba de
conexión), Cláriva consulta `GET /templates/:name`. Si `status ≠ APPROVED`, **no habilita** y
muestra un mensaje claro ("plantilla pendiente de aprobación"). Nunca falla en silencio.

## Comportamiento de las respuestas (no cambia respecto de hoy)

- `CONFIRMAR` → cita a **CONFIRMADO** + acuse de texto.
- `CANCELAR` → **CANCELADA** + acuse.
- `REAGENDAR` → se **marca y se deriva a la clínica** (log + visible en agenda). El
  reagendamiento automático es de la integración inversa, **no** de este módulo.
- Sin respuesta → queda como está (no se insiste más de lo que ya define la lógica actual).

## Mock

`mock-tubot/` (Node, sin dependencias, puerto **4020**) implementa este contrato: los tres
`POST/GET` de envío + un **simulador** que firma y entrega webhooks entrantes (`button`,
`text`, `status`) a la URL de Cláriva. Ver `mock-tubot/README.md`.
