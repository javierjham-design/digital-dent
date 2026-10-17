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

## Ronda 2 — re-auditoría completa sobre el código ya remediado (2026-10-17)

Se repitió la auditoría con 7 agentes solo-lectura sobre TODO el código (incl. los ~12
deploys de la ronda 1) para cazar regresiones nuevas. Las suites no detectaban nada, pero
los agentes hallaron **regresiones introducidas por los propios fixes** + huecos nuevos.
**TODO lo siguiente quedó CORREGIDO y verificado (231 tests, contrato, builds verdes):**

- **Reportes#1 [ALTO · regresión del fix M5]** `rangoTz` desfasaba un día los campos
  *fecha-sola* (fechaPago/fechaCompletado a medianoche UTC) en TODA clínica chilena. Fix:
  `rangoUtc` (límites UTC de día) para fechaPago/fechaCompletado; `rangoTz` (zona clínica)
  solo para instantes (createdAt/cita.fecha/movimiento.fecha). + guard sin-filtro (Reportes#3).
- **Dinero#1/#2 [ALTO · regresión del fix M13]** editar/borrar un cobro de una sesión CERRADA
  descuadraba el arqueo sellado. Fix: `calcularResumenSesion` CONGELA el cuadre de una sesión
  cerrada (saldoEsperado/ingresosEfectivo/egresos desde los campos sellados; nunca recomputa).
- **Dinero#3/#4 [MEDIO]** al editar monto/medio ahora se recalcula comisión+neto; editar el
  monto de un pago DIVIDIDO se rechaza (como multi-ítem). + `metodoPago` ahora privilegiado (#8).
- **Agenda#2 [MEDIO]** `editarCita` (arrastrar/reagendar) ahora va en `$transaction` +
  `lockAgendaDoctor` + re-chequeo de solape, como crear/reprogramar/reservar.
- **Agenda#1 [ALTO latente]** `PAIS_TZ` completado (SV/HN/NI/DO) + `tzDePais` uppercase.
- **Reportes#2 [MEDIO · regresión del fix L14]** `eliminarPrestacion` borraba los montos-fijos
  ANTES del delete fallido → pérdida irreversible. Fix: ambos en `$transaction` (rollback). +
  `crearPrestacion` valida precio `>=0` (Reportes#5).
- **Clínico#1 [MEDIO · regresión]** quitar `skipDuplicates` (por SQLite) abortaba TODO el import
  ante una carrera de RUT en prod (Postgres). Fix: `skipDuplicates` solo fuera de VITEST.
- **Clínico#2 [MEDIO]** pestaña Evoluciones mostraba la fecha-sola en zona local (off-by-one).
  Fix: `fmtEvolucion` (fecha-sola → UTC; timestamp real → local).
- **Seguridad#1 [ALTO]** un no-admin con `puedeGestionarEquipo` podía crearse/crear un admin.
  Fix: `crearUsuario` exige actor admin para `role==='admin'` (como `actualizarUsuario`).
- **Seguridad#2 [MEDIO · regresión del fix M2]** el claim de Flow marcaba PAGADO antes de
  reconciliar y no era transaccional → cobro impago permanente si fallaba. Fix: claim +
  reconciliación del cobro en UNA `$transaction` (el reintento de Flow la reintenta).
- **Seguridad#4 [BAJO]** `invalidateUserCache` se cablea al cambiar `activo` (lockout inmediato).
- **Barrido#1 [MEDIO]** `/emails/enviar` aceptaba `html` crudo (HTML arbitrario con la identidad
  de Cláriva). Fix: se elimina el passthrough; el cuerpo SIEMPRE se arma con plantillas (escapan).
- **Barrido#2 [BAJO]** `listarMovimientos` de caja usa `rangoFechasUtc` (zona clínica).

Pruebas nuevas: `caja-cierre-congelado`, `reportes-fecha`, `usuarios-crear`, + casos en
`cobros-editar` (comisión/split). Tests: 223 → **231**.

### Diferido de la ronda 2 (fundamentado — no bloquean la operación)
- **Dinero#5** cancelar una acción PAGADA no vuelca su pago a abono libre (infla el tope): requiere
  tocar el flujo de cancelación con datos reales; es imprecisión de tope, no pérdida de dinero.
- **Dinero#6** no hay reversa de una liquidación finalizada (el `@@unique` la sella): requiere
  diseñar un endpoint de reversa + claw-back; post-lunes.
- **Dinero#7/#9/#10**, **Reportes#4/#6/#7**, **Agenda#3/#4/#5/#6**, **Clínico#3/#4/#5/#6**,
  **CRM (todos)**, **Barrido#3/#4/#5**: latentes, no-chilenos, perf, UX menor o pre-existentes.

### Diferido DELIBERADAMENTE (con fundamento — no son bloqueantes de la operación)
- **M9** split de pago en el cuadre: latente (la UI nunca envía pago dividido; tocar la matemática del cuadre por un camino inalcanzable no compensa el riesgo).
- **M18/M20/M22/M23/M24/M25** unificación amplia del matching por teléfono + atribución (auto-conversión, reenganche): se hizo el peor caso (H11, pérdida de datos) de forma segura; el resto cambia el matching de leads en prod y amerita validación con datos reales. Son problemas de PRECISIÓN de atribución/reportes, no de pérdida de datos ni de operación.
- **L2** rate-limit por proceso (necesita store compartido tipo Redis) · **L3** idempotencia de POST /appointments (lado TuBot, store persistente) · **L4** cita fantasma por nombre (import Dentalink intencional; riesgo gateado tras `recapturaNoShowEnabled`=OFF) · **L6** idempotencia del entrante WhatsApp (reestructurar ruta sensible por edge raro) · **L8/L12** latentes · **L19** finalización masiva (completitud parcial es aceptable/reportada) · **L22** N+1 (perf) · **L23/L25** capacidades intencionalmente no usadas · **L24** tamaño de bundle (perf).
- **C1 infra**: setear `JWT_SECRET` explícito en Railway (la vulnerabilidad YA quedó cerrada por código; es belt-and-suspenders; pasos dados al dueño).
