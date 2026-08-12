# mock-tubot

Mock de **TuBot** (canal WhatsApp) para desarrollar la integración de Cláriva **sin
credenciales**. Implementa el contrato de [`docs/TUBOT_WHATSAPP.md`](../docs/TUBOT_WHATSAPP.md).
Sin dependencias (Node 18+): `http` + `crypto` + `fetch` nativos.

## Correr

```bash
node mock-tubot/server.mjs
# o: npm --prefix mock-tubot start
```

Variables (todas con default para dev):

| Env | Default | Qué es |
|---|---|---|
| `PORT` | `4020` | Puerto del mock |
| `CLARIVA_WEBHOOK_BASE` | `http://localhost:4000/api/v1/whatsapp/webhook` | Base del webhook de Cláriva (se le agrega `/{connectionId}`) |
| `WEBHOOK_SECRET` | `dev-webhook-secret` | Secreto con el que el mock **firma** `X-Tubot-Signature` |
| `API_KEY` | `cnvk_dev` | Key que acepta en `Authorization: Bearer` |
| `LENIENT_AUTH` | — | `1` = acepta cualquier `cnvk_…` (dev) |
| `RATE_LIMIT_PER_MIN` | `0` | `>0` simula `429` (con `Retry-After`) |

## Enviar (lo que hace Cláriva → TuBot)

```bash
# Plantilla (con Idempotency-Key obligatorio)
curl -s localhost:4020/public/v1/messages/template \
  -H 'Authorization: Bearer cnvk_dev' -H 'Idempotency-Key: cita_abc_2026-08-12T10:30' \
  -H 'Content-Type: application/json' \
  -d '{"to":"+56912345678","templateName":"recordatorio_cita","languageCode":"es",
       "variables":["María","Clínica Norte","lunes 12 de agosto","10:30"],
       "buttons":[{"type":"quick_reply","payload":"CONFIRMAR"},
                  {"type":"quick_reply","payload":"CANCELAR"},
                  {"type":"quick_reply","payload":"REAGENDAR"}]}'
# → 202 { messageId, status:"accepted" }   (reintento con la misma key ⇒ deduped:true)

# Estado de la plantilla (para el degrade)
curl -s localhost:4020/public/v1/templates/recordatorio_cita -H 'Authorization: Bearer cnvk_dev'
```

## Recibir (simular TuBot → Cláriva)

El mock **firma** y hace `POST` al webhook de Cláriva. Necesitás un `connectionId` de una
clínica de prueba.

```bash
# El paciente toca "CONFIRMAR"
curl -s localhost:4020/_sim/inbound -H 'Content-Type: application/json' \
  -d '{"connectionId":"conn_demo","from":"+56912345678","payload":"CONFIRMAR","replyTo":"mock_out_0001"}'

# Texto libre (respaldo)
curl -s localhost:4020/_sim/inbound -H 'Content-Type: application/json' \
  -d '{"connectionId":"conn_demo","from":"+56912345678","text":"sí confirmo"}'

# Estado de entrega: falló (número inexistente / bloqueó a la clínica)
curl -s localhost:4020/_sim/status -H 'Content-Type: application/json' \
  -d '{"connectionId":"conn_demo","providerMsgId":"mock_out_0001","status":"failed","reason":"invalid_number"}'

# Forzar una plantilla NO aprobada (probar la degradación)
curl -s localhost:4020/_sim/template-status -H 'Content-Type: application/json' \
  -d '{"name":"recordatorio_cita","status":"PENDING"}'
```

Las rutas `/_sim/*` son **control del mock**, no parte del contrato: existen sólo para
empujar eventos entrantes durante el desarrollo.
