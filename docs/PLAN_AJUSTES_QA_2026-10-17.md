# Plan de ajustes QA — objetivo: funcional y seguro para el lunes 2026-10-19

Basado en `AUDITORIA_QA_2026-10-17.md`. Hoy sábado 2026-10-17; la plataforma se usa el lunes.

## Principios (fin de semana, sin romper prod)
- Solo cambios de **código probados** + deploy incremental con las suites verdes (typecheck + integración + contrato + lint).
- **NADA de migraciones apuradas ni refactors grandes de CRM** este fin de semana (riesgo de romper). Las migraciones van con backup y, de preferencia, con la plataforma sin uso (domingo).
- Cada ola = commit propio + deploy a `arch`/`master` (auto-deploy Railway).
- Priorizar lo que afecta la **operación diaria del lunes**: caja/cobros, agenda, registros clínicos.

## Prioridad por impacto en el lunes

### OLA 1 — Integridad de dinero + permisos de cobros (code-only, alto valor) · HOY
- **H6** `PATCH /cobros/:id`: agregar `estado` y `medioPagoId` a `CAMPOS_PRIVILEGIADOS` (exige `puedeEditarPagos`) + validar body con zod.
- **H7** Bloquear `estado='ANULADO'` vía PATCH → redirigir al flujo `anularCobro` (motivo + anula MovimientoCaja + auditoría).
- **H8** `eliminarCobro`: dentro de la tx, anular/borrar el `MovimientoCaja` asociado (no dejar huérfano que cuente como efectivo).
- **M13** `actualizarCobro`: al cambiar `monto` actualizar el `MovimientoCaja.monto`; guardar `montoNeto/comisionMonto` con guard `>=0`; bloquear edición de `monto` en cobros multi-ítem (no corromper el plan); avisar/bloquear edición de cobro de sesión CERRADA.
- **M8** redondear comisión (`Math.round`).
- **M10** `totalesPlan` excluir acciones CANCELADO (alinear con `totalesDePlan`).
- **M11** validar `monto` de cada ítem `> 0` (zod + `validarItemsCobro`).
- **L13 / L15 / L16** validar rango de comisión (0-100) y precio en catálogo; morosos filtrar `anulado`.

### OLA 2 — Concurrencia de agenda + registros clínicos (code-only) · HOY
- **H2** `reservarPublico` → `findMany`+`some` (como `findSolapada`).
- **H1** envolver `crearCita` y `reservarPublico` en el advisory lock por (doctorId, día) que ya usa el webhook (patrón PR #461) → cerrar la doble reserva concurrente.
- **H3** `cambiarEstadoCita` → al pasar de CANCELADA/NO_ASISTIO a un estado que ocupa, revalidar solape (throw conflict).
- **H12** `hoyISO()` → calcular "hoy" en la TZ de la clínica, no UTC.
- **M17** `eliminarCita` → emitir `appointment.cancelled` a TuBot.
- **L11** `editarCita` → limpiar `waDeliveryStatus/Reason`.

### OLA 3 — Integridad de datos + seguridad rápida (code-only) · MAÑANA (domingo)
- **H13** KPIs paciente → aplicar descuento + filtrar `anulado`.
- **H14 / M15 / M16** import pacientes → normalizar RUT igual que el alta manual (`normalizarDoc`) + asignar `numero` (correlativo) + validar DV/país.
- **M14** `firmar()` consentimiento → validar/escapar el `src` de la firma.
- **M4** `POST /whatsapp/recordatorios` → exigir `isPlatformAdmin`/cron-secret.
- **M1** `AbortSignal.timeout()` en los fetch salientes (Flow/TuBot/Graph).
- **L1** usar `cronSecretValido()` (timing-safe) en los 3 controllers.
- **C1 (código)** quitar el fallback hardcodeado `'dev-insecure-secret-change-me'` (que `required()` lance si falta).

### OLA 4 — Requieren migración / dedup previo (con backup; idealmente domingo sin uso)
- **C1 (infra)** setear `JWT_SECRET` explícito en prod = igualar a `NEXTAUTH_SECRET` (no invalida sesiones). *Lo hace el dueño en Railway o me autoriza.*
- **H9** `@@unique(tratamientoId)` en LiquidacionItem → el **lock/tx es code-only (hacer en Ola 1/2)**; el `@@unique` necesita verificar sin-duplicados + migración.
- **H10** `@unique` en `metaPageId` (control) → verificar que no haya dos clínicas con el mismo page_id; mientras, code-fix `orderBy` determinista + alerta si ambiguo.
- **M12** índice único parcial `(cajaId, ABIERTA)` → mientras, guard en tx al abrir.

### DIFERIDO (post-lunes, requieren diseño; latentes o no afectan la operación diaria)
- **H4** TZ multi-país (no hay tenants no-chilenos).
- **H5** revocación de sesión (revalidar `user.activo`/versión de token).
- **M5** reportes TZ (afecta reportes, no la operación diaria).
- **M2/M3** idempotencia/monto Flow.
- **CRM atribución (M18–M26)** + unificar normalización de teléfono — refactor grande, no tocar apurado.
- Resto de Bajos (L2–L10, L12, L14, L17–L25).

## Cronograma
- **Sábado:** Ola 1 + Ola 2 (caja + agenda + registros). Deploy incremental.
- **Domingo:** Ola 3 + lock/tx de H9 (code-only). Migraciones (@@unique, índices) + set `JWT_SECRET` con backup, plataforma sin uso.
- **Lunes AM:** smoke final + verificación en vivo.

## Estado — COMPLETO (desplegado a prod, suites verdes en cada ola)
- [x] Ola 1 (dinero/cobros) · [x] Ola 2 (agenda/clínico) · [x] Ola 3 (import/seguridad)
- [x] Ola 4 (locks liquidación/caja + @@unique H9 + ruteo Meta H10) · [x] Ola 5 (zona horaria)
- [x] Ola 6 (revocación de sesión H5 + Lows) · [x] Ola 7 (CRM seguro) · [x] Ola 8 (abono L9)
- [x] Ola 9 (medios/planes/lead/Flow M6/M7/M19/M2/M3)

**Resuelto:** C1 (código) + los 14 Altos + la mayoría de Medios y Bajos. Verificado con 223 tests de integración, typecheck/lint limpios, y datos de prod sin duplicados para las migraciones.

### Diferido DELIBERADAMENTE (con fundamento — no son bloqueantes de la operación)
- **M9** split de pago en el cuadre: latente (la UI nunca envía pago dividido; tocar la matemática del cuadre por un camino inalcanzable no compensa el riesgo).
- **M18/M20/M22/M23/M24/M25** unificación amplia del matching por teléfono + atribución (auto-conversión, reenganche): se hizo el peor caso (H11, pérdida de datos) de forma segura; el resto cambia el matching de leads en prod y amerita validación con datos reales. Son problemas de PRECISIÓN de atribución/reportes, no de pérdida de datos ni de operación.
- **L2** rate-limit por proceso (necesita store compartido tipo Redis) · **L3** idempotencia de POST /appointments (lado TuBot, store persistente) · **L4** cita fantasma por nombre (import Dentalink intencional; riesgo gateado tras `recapturaNoShowEnabled`=OFF) · **L6** idempotencia del entrante WhatsApp (reestructurar ruta sensible por edge raro) · **L8/L12** latentes · **L19** finalización masiva (completitud parcial es aceptable/reportada) · **L22** N+1 (perf) · **L23/L25** capacidades intencionalmente no usadas · **L24** tamaño de bundle (perf).
- **C1 infra**: setear `JWT_SECRET` explícito en Railway (la vulnerabilidad YA quedó cerrada por código; es belt-and-suspenders; pasos dados al dueño).
