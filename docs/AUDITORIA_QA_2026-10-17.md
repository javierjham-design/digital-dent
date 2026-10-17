# Auditoría de QA — Plataforma Cláriva (dental-platform)

**Fecha:** 2026-10-17 · **Alcance:** backend + frontend + web de `dental-platform` (NO incluye Conversia/TuBot, otro repo). **Modo:** solo-lectura (auditoría estática + suites automáticas), vía 7 agentes por dominio.

## Verificación automática (estado verde)
| Suite | Resultado |
|---|---|
| Typecheck backend / frontend / web | Limpio |
| Integración backend | 213/213 ✔ |
| Contrato FE↔BE | OK (301 rutas, 246 llamadas) |
| Build frontend + web | OK |
| Lint | 0 errores, 7 advertencias (deps useEffect, 1 var sin usar) |
| Unit `smoke.test.ts` | ⚠️ timeout del `beforeAll` — ambiental (import ~310s por correr 7 agentes + builds en paralelo; 14 pruebas `skipped`). Re-correr aislado. |

> Los tests verdes NO cubren los hallazgos de abajo: son de auditoría estática (correctitud, concurrencia, dinero, zona horaria, seguridad).

## Causas raíz recurrentes
1. TOCTOU sin lock/transacción → doble reserva, doble liquidación.
2. Normalización de teléfono inconsistente (dígitos completos vs últimos-8 vs solo-móvil) → duplicados y atribución cruzada.
3. Fecha-sola en UTC (`new Date("YYYY-MM-DD")`, `toISOString().slice(0,10)`) → desfase de un día; TZ Chile hardcodeada.
4. `PATCH /cobros/:id` sin permiso ni validación → descuadre de caja.
5. Hard-deletes que dejan referencias colgantes (cobro→movimiento, medio de pago→cobros).

---

## CRÍTICO
- **C1 · Secreto JWT con fallback público + `required()` que no falla** — `config/env.ts:5-11,39`; mismo en `google.ts:53-55` (stateSecret). Fallback `'dev-insecure-secret-change-me'`; `required()` nunca lanza. **Estado verificado 2026-10-17: `JWT_SECRET` NO está seteada en prod, pero `NEXTAUTH_SECRET` SÍ → prod firma con NEXTAUTH_SECRET, NO con el default público. Latente, no activo.** Fix: setear `JWT_SECRET` explícito + quitar el fallback hardcodeado del código.

## ALTO
- **H1 · Doble reserva por carrera (TOCTOU)** — `citas.service.ts:118-134` (crearCita), `agenda-online.service.ts:375-399` (reservarPublico), reprogramarCita:262-287, editarCita:157-205. Validan solape y luego `create` sin tx/lock. Coincide con el incidente real de 11 citas duplicadas; el advisory lock del PR #461 solo cubre el webhook.
- **H2 · `reservarPublico` usa `findFirst`** en vez de `findMany`+`some` — `agenda-online.service.ts:378-384`. Solape real no detectado → doble reserva.
- **H3 · Reabrir una cita CANCELADA pisa un cupo reocupado** — `citas.service.ts:321-353` + `Agenda.tsx:1352-1362`. Sin revalidar solape.
- **H4 · Zona horaria hardcodeada a Chile** — `tz.ts:6`, `atencion.ts:5`. `Configuracion.pais` no se usa para cupos. Latente (todos los tenants son chilenos).
- **H5 · Sin revocación de sesión** — `middlewares/tenant.ts` + `auth.service.ts:40-50`. `requireTenant` no revalida `user.activo` ni `passwordChangedAt` → empleado despedido conserva acceso hasta 12h.
- **H6 · `PATCH /cobros/:id` sin permiso ni zod** — `routes/index.ts:409`, `cobros.service.ts:374-390`. `estado`/`medioPagoId` no privilegiados → recepción reclasifica medio o marca PAGADO → descuadre.
- **H7 · `PATCH estado='ANULADO'` no anula de verdad** — `cobros.service.ts:387-390`. No pone `anulado=true` ni anula el MovimientoCaja → el cierre lo sigue contando.
- **H8 · `eliminarCobro` deja el movimiento de caja huérfano** — `cobros.service.ts:518-523`. `cobroId=null` → `cobroEsEfectivo(null)=true` → cuadre inflado.
- **H9 · Doble pago de liquidación por carrera** — `liquidaciones.service.ts:283-330`. Sin tx/lock y sin `@@unique(tratamientoId)` → profesional liquidado dos veces, permanente.
- **H10 · Webhook Meta rutea por `metaPageId` no-único** — `meta-leadads.service.ts:222-225` (control/schema.prisma:85 sin @unique). Dos clínicas con el mismo page_id → leads en la clínica equivocada (fuga cross-tenant).
- **H11 · `fusionarLeadsDuplicados` fusiona personas distintas y borra leads** — `crm.service.ts:1294-1339`. Agrupa por últimos-8 y hace `delete` → pérdida irreversible + citaId cross-paciente.
- **H12 · Fecha de evolución en el día equivocado** — `FichaPaciente.tsx:48` (hoyISO UTC) + `tratamientos.service.ts:503,509,514`. Registro legal.
- **H13 · KPIs del paciente no cuadran con el plan** — `pacientes.service.ts:363-365`. `realizado` sin descuento; `abonado` sin filtrar anulado.
- **H14 · Import duplica por RUT normalizado distinto** — `pacientes.service.ts:407-411,460-466` vs alta manual :218. Evade el `@unique`.

## MEDIO
- **M1 · Ningún `fetch` saliente tiene timeout** — Flow/TuBot/Graph/cron → upstream colgado estanca el loop/retiene el request.
- **M2 · Webhook Flow sin idempotencia atómica** — `pagos-online.service.ts:130-181` → doble email + doble conversión CRM si Flow reintrega.
- **M3 · Webhook Flow no valida `commerceOrder`/`amount`** — `pagos-online.service.ts:135-154`.
- **M4 · `POST /whatsapp/recordatorios` cross-tenant** — `whatsapp.controller.ts:38-49`. Cualquier admin procesa TODAS las clínicas + filtra IDs ajenos.
- **M5 · Reportes ignoran la zona horaria** — `lib/excel.ts:56-68` (parseDateRange). Registros 20:00-23:59 excluidos; `/reportes/cobros` vs `/cajas/reporte-pagos` no cuadran.
- **M6 · Borrar medio de pago rompe el histórico** — `catalogo.service.ts:331-335`. Hard-delete SetNull.
- **M7 · Se puede borrar el plan `BASICO`** — `admin.service.ts:642-646`. TRIAL que pague queda con plan inexistente (MRR $0).
- **M8 · Comisión sin redondear** — `cobros.service.ts:245,253`. Dinero con decimales (viola CLAUDE.md).
- **M9 · Split de pago ignorado en el cuadre** — `lib/caja.ts:86,95,101`. Latente (UI no envía split).
- **M10 · `totalesPlan` incluye acciones CANCELADAS** — `cobros.service.ts:72`. Permite sobre-abonar.
- **M11 · `monto` por ítem sin `.positive()`/`.int()`** — `schemas.ts:213` + `cobros.service.ts:131-132`. Ítems negativos corrompen saldos.
- **M12 · Dos sesiones de caja ABIERTA por doble-clic** — `lib/caja.ts:44-49`. Sin índice único parcial.
- **M13 · Editar un cobro no reconcilia items/caja** — `cobros.service.ts:405-411`. Cambiar monto no actualiza cobroItem ni MovimientoCaja; montoNeto/comisionMonto pueden ser negativos; cobro de sesión cerrada no recalcula el snapshot. (Toca la función de editar pago recién entregada.)
- **M14 · XSS almacenado en consentimiento firmado** — `consentimientos.service.ts:326-328`. `src` de la firma sin escapar.
- **M15 · Pacientes importados sin número de ficha** — `pacientes.service.ts:483` (createMany sin numero).
- **M16 · Import sin validar DV ni país** — `pacientes.service.ts:407-411`.
- **M17 · `eliminarCita` no emite `appointment.cancelled`** — `citas.service.ts:312-319`. TuBot manda recordatorio de cita borrada.
- **M18 · Match de teléfono inconsistente entre módulos** — dígitos completos vs últimos-8 → paciente duplicado.
- **M19 · `reprogramarCita` deja el lead desincronizado** — `citas.service.ts:242-296`. citaId/fechaAgenda a la cita cancelada.
- **M20 · `telCanonico` (últimos-8) mezcla móviles y fijos** — `crm.service.ts:39-45`. Raíz de H11.
- **M21 · CAPI: fijos hasheados sin código de país** — `meta.ts:44-48`. Pierden atribución Meta.
- **M22 · Cron auto-convierte leads por últimos-8 sin revisión** — `maintenance.ts:85-107`.
- **M23 · `marcarConvertidoPorCobro` atribuye por último-8** — `crm.service.ts:937-957`.
- **M24 · `leadDeCita` cae al "lead más reciente"** — `citas.service.ts:423-429`. Asistencia a campaña equivocada.
- **M25 · `reengancharLeadReagenda` revive no-shows viejos** — `citas.service.ts:453-457`.
- **M26 · `ingresosPorCampana` no determinista + ROI inflado** — `crm.service.ts:377-427`.

## BAJO
- **L1** · Cron-secret/state OAuth comparados con `===` (no constante) — whatsapp/demo/google controllers, google.ts:65.
- **L2** · Rate-limit en memoria por proceso; `verifyToken` sin iss/aud.
- **L3** · Idempotencia de `POST /appointments` en memoria → falla con >1 instancia.
- **L4** · Import Google crea cita fantasma CONFIRMADA por coincidencia de nombre — google-sync.ts:628.
- **L5** · `emitirEventoCita` traga errores de DB sin registro — tubot-webhooks.ts:101.
- **L6** · WhatsApp entrante marca idempotencia antes de aplicar efectos — whatsapp.ts:202-251.
- **L7** · `edadTexto` frontend off-by-one (UTC) — FichaPaciente.tsx:50.
- **L8** · `fechaTentativa` guardada en UTC — tratamientos.service.ts:217,233.
- **L9** · Carrera en `aplicarAbonoLibreAAccion` (lee fuera de la tx).
- **L10** · Cobro anulado=true + estado=PAGADO contado distinto front/back.
- **L11** · `editarCita` no limpia `waDeliveryStatus/Reason`.
- **L12** · `findSolapada` asume citas <12-24h; sin tope superior.
- **L13** · `actualizarMedioPago` sin validar rango de comisión — catalogo.service.ts:320.
- **L14** · `eliminarPrestacion` devuelve 500 en vez de 409.
- **L15** · `actualizarPrestacion` sin validar precio/duración.
- **L16** · Reporte de morosos no filtra cobros anulados.
- **L17** · `cerrarSesion` API no valida `dejado+retirado==saldoReal`.
- **L18** · Abono libre al 100% no limpia el carrito (paraCobro).
- **L19** · `finalizarTodasLiquidaciones` no atómico.
- **L20** · `listarLeads` take:500 + filtro en memoria.
- **L21** · `ingestarLeadMeta` conserva el primer leadgenId (first-touch forzado).
- **L22** · N+1/escaneos completos en rutas calientes del CRM.
- **L23** · Reserva online excluye CONVERTIDO → lead duplicado.
- **L24** · Bundle frontend ~1.99 MB (candidato a code-splitting).
- **L25** · Split de pago inalcanzable desde la UI (relacionado con M9).

**Totales:** 1 Crítico (latente) · 14 Altos · 26 Medios · 25 Bajos. Hallazgos estáticos (no reproducidos en runtime); varios Altos de concurrencia respaldados por el incidente real de citas duplicadas.
