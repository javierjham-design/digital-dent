# Checklist de QA — Lanzamiento producción

> Ejecutá cada caso marcando ✅ / ❌ / ⏭ (skip). Si falla algo, anotá: navegador, URL, paso exacto, screenshot.
> Mientras hagas QA, dejá un tab abierto con Railway → **servicio backend** → Deploy Logs para captar errores en vivo.

---

## 0. Estado de preparación (repaso 2026-06-20) y cómo leer este checklist

**Veredicto:** el código está **listo para el cutover**. Paridad funcional 100%
(`docs/parity-matrix.md`), DB-por-tenant completa (F1–F7), y verde en automatizado:
typecheck · 67/67 unit/smoke · **11/11 aislamiento físico** · contrato FE↔BE 130/116.
Lo que queda es el **pase manual** de este checklist contra los servicios desplegados.

**Este checklist se escribió para el monolito.** Aplican estas correcciones globales
para el stack nuevo (3 servicios Railway + DB-por-tenant). Léelas antes de empezar:

| En el checklist dice… | En el stack nuevo es… |
|---|---|
| `/api/...` | **`/api/v1/...`**, servido por el backend en `https://api.clariva.cl` |
| llamadas same-origin con cookie | la SPA llama al backend con **`Authorization: Bearer <JWT>`** (token en `localStorage`) |
| `/digital-dent-super-admin`, `/digital-dent-admin-login` | **`https://super-admin.clariva.cl`** → login modo plataforma (email) → **`/plataforma`** |
| `/usuarios` (como página) | **`/equipo`** (la API sigue siendo `/usuarios`) |
| "aislamiento por `clinicaId`" | **aislamiento FÍSICO**: cada clínica es una base distinta. Un id de otra clínica no existe en tu base → 404 por construcción. |

**Pre-requisitos del pase manual** (ver `docs/cutover.md`): los 3 servicios arriba,
`migrate:data --apply` corrido (para tener datos reales), y `JWT_SECRET`/`ENCRYPTION_KEY`
iguales al monolito (si no, no descifran tokens Twilio/Google ni valida sesiones viejas).

**Ya cubierto por tests automáticos** (el pase manual es confirmación, no descubrimiento):
toda la **Sección A** (aislamiento físico — los 11/11 de integración prueban A2–A6 con bases
separadas reales), y el contrato de que cada llamada del frontend tiene endpoint en el backend.

---

## A. Multi-tenancy — aislamiento FÍSICO (CRÍTICO — no se puede romper)

> **Pre-validado por los 11/11 tests de integración** (bases sqlite separadas por clínica).
> En DB-por-tenant un id de otra clínica **no existe** en tu base → 404 por construcción,
> no por un filtro `clinicaId`. Este pase manual confirma el comportamiento en prod.
>
> Necesitás **2 clínicas de prueba** con datos distintos. Ej.: `digital-dent` (migrada) y
> crear una segunda `qa-clinica` desde super-admin (provisiona su propia base física).
>
> Para A4–A6 (DevTools → Console, estando logueado en `qa-clinica`), usa la API real y el
> token Bearer guardado por la SPA:
> ```js
> const API = import.meta?.env?.VITE_API_URL || 'https://api.clariva.cl/api/v1'
> const T = localStorage.getItem('clariva_token')
> fetch(`${API}/pacientes/<id_de_digital_dent>`, { headers: { Authorization: `Bearer ${T}` } })
>   .then(r => console.log(r.status))   // espera 404
> ```

| # | Caso | Cómo testear | Esperado |
|---|------|--------------|----------|
| A1 | Crear segunda clínica | Super-admin → "Crear clínica nueva" → llenar todo | OK + contraseña aleatoria UNA vez + **base física propia provisionada** |
| A2 | Listado solo muestra mis pacientes | Login en `qa-clinica` → `/pacientes` → no debe ver pacientes de digital-dent | Solo pacientes de qa-clinica |
| A3 | URL directa cross-tenant bloquea | Copiá un id de paciente de digital-dent y en sesión qa-clinica navegá a `/pacientes/<id_de_digital_dent>` | 404 / Not found (el id no existe en su base) |
| A4 | API GET/PATCH cross-tenant rechazada | DevTools con el snippet de arriba: `GET /api/v1/pacientes/<id_digital_dent>` (y un PATCH) con Bearer | Status 404 |
| A5 | Cajas no leakean | Mismo snippet con `/api/v1/cajas/<id_otra_clinica>/movimientos` | 403 o 404 |
| A6 | Cobros no leakean | Idem con `/api/v1/cobros/<id_otra_clinica>` | 404 |
| A7 | Liquidaciones doctor solo ve las suyas | Crear liquidación en digital-dent para Dr. Aedo → login como Dr. Pabst → `/liquidaciones` | No debe ver la de Aedo |

---

## B. Auth y permisos

| # | Caso | Cómo testear | Esperado |
|---|------|--------------|----------|
| B1 | Login con creds incorrectas | /login con password mala | Error sin revelar si user existe |
| B2 | Logout limpia sesión | Logout → intentar volver a /agenda | Redirect a /login |
| B3 | Role admin tiene todos los permisos | Login como admin → todos los toggles "Permisos" en /usuarios funcionan | Todo accesible |
| B4 | Role doctor NO ve panel admin | Login doctor → intentar `/equipo` | Redirect/404 o filtrado a su propio user |
| B5 | `puedeRecibirPagos=false` no puede recaudar | Crear user sin permiso → intentar POST /api/cobros | 403 |
| B6 | `puedeEditarPagos=false` no puede anular | Mismo user → intentar anular cobro | 403 |
| B7 | `puedeGestionarLiquidaciones=false` no crea liquidación | Mismo user → intentar generar liquidación | 403 |
| B8 | Cambio de contraseña forzado primer login | Crear clínica nueva → login con password aleatoria del admin | Pantalla forzando cambio antes de continuar |
| B9 | Doctor no puede bloquear agenda de otro doctor | Login Dr. Aedo → POST `/api/bloqueos` con `doctorId` de Dr. Pabst | 403 |

---

## C. Agenda

| # | Caso | Esperado |
|---|------|----------|
| C1 | Vista Semanal muestra citas y bloqueos | Ver con varios eventos | Citas color por estado, bloqueos grises 🚫 |
| C2 | Vista Diaria muestra citas y bloqueos | Cambiar de vista | Lista ordenada por hora con filas grises de bloqueos |
| C3 | Vista Diaria Global muestra citas Y bloqueos | Idem | Columnas por doctor con bloques grises |
| C4 | Click en cita abre modal correcto | Click en una | Modal con paciente, estado, acciones |
| C5 | Click en bloqueo abre modal de bloqueo | Click en uno gris | Modal "Bloqueo de agenda" con eliminar |
| C6 | Crear cita en horario libre funciona | Click en slot libre | Modal crear cita |
| C7 | Crear cita sobre bloqueo rechaza | Forzar POST `/api/citas` en horario bloqueado | 409 con mensaje claro |
| C8 | Mover cita actualiza Google Calendar | Drag&drop o edit fecha | Verificar en Google Calendar tab |
| C9 | Anular cita borra evento de Google | Cambiar estado a CANCELADA | Evento desaparece de Google |
| C10 | Crear bloqueo aparece en Google Calendar | Botón "Bloquear horario" | Evento 🚫 en Google |
| C11 | Sobrecupos no respetan bloqueos visualmente | Modo sobrecupo no muestra bloqueos | Por diseño: bloqueos no aplican a sobrecupo |
| C12 | Receso visible como fuera de horario | Doctor con receso 13-14h | Slots de 13-14h no clickeables |
| C13 | Confirmar por WhatsApp abre link correcto | Modal cita → WhatsApp | Abre wa.me con mensaje formato OK |
| C14 | Cambio de estado queda en CitaLog | Cambiar estado y ver historial | Log con quién, cuándo, de qué a qué |

---

## D. Pacientes

| # | Caso | Esperado |
|---|------|----------|
| D1 | Crear paciente con todos los campos | Form completo | OK, aparece en lista |
| D2 | RUT chileno se valida | RUT mal escrito | Validación o mensaje |
| D3 | RUT vacío permitido (extranjeros) | Sin RUT | OK |
| D4 | Importar pacientes desde Excel | Botón importar con archivo válido | Muestra resumen, no duplica |
| D5 | Exportar pacientes a Excel | Botón exportar | Descarga archivo con datos |
| D6 | Ficha clínica permite agregar tratamientos | En ficha → agregar tratamiento | OK |
| D7 | Tratamiento COMPLETADO bloquea revertir | Sin permiso `puedeRevertirCompletado` | No puede |
| D8 | Recibir pago desde ficha funciona | Tab "Recibir pago" con caja abierta | Cobro creado, items linkeados |
| D9 | Sin caja abierta NO permite recaudar | Cerrar todas las cajas → intentar | Mensaje claro, link a abrir |
| D10 | Odontograma se guarda al cambiar | Marcar diente, esperar autosave | Persiste al recargar |

---

## E. Cobros y Caja

| # | Caso | Esperado |
|---|------|----------|
| E1 | Abrir caja con saldo declarado | Click "Abrir caja" → ingresar monto | Estado pasa a ABIERTA |
| E2 | Registrar cobro genera MovimientoCaja | Crear cobro PAGADO | Aparece en agenda de la caja |
| E3 | Cobro con comisión calcula neto | Medio con comisión 3% | montoNeto = monto × 0.97 |
| E4 | Registrar gasto manual funciona | Botón gasto en caja | Aparece como EGRESO |
| E5 | Anular movimiento requiere motivo | Botón anular | Modal pide motivo ≥4 chars |
| E6 | Cerrar caja calcula diferencia | Cerrar con saldo distinto al esperado | Muestra sobrante/faltante |
| E7 | Caja cerrada NO recibe cobros | Intentar POST /api/cobros con caja cerrada | 409 con mensaje |
| E8 | Histórico de cierres navegable | /cobros/caja/[id]/sesion/[sesionId] | Vista read-only completa |
| E9 | Reporte imprimible PDF correcto | Click imprimir | Layout A4 con cuadre |
| E10 | Anular cobro: PATCH y mov se anulan | Anular un cobro con motivo | Cobro anulado + MovimientoCaja anulado |
| E11 | Editar cobro requiere `puedeEditarPagos` | Sin permiso | 403 |
| E12 | Abono libre sin tratamientos | Modo abono libre con concepto custom | Cobro creado sin tratamientoId |

---

## F. Liquidaciones

| # | Caso | Esperado |
|---|------|----------|
| F1 | Doctor común solo ve sus liquidaciones | Login doctor → /liquidaciones | Vista simplificada con sus liquidaciones |
| F2 | Doctor común NO ve botón "Generar" | Idem | Botón ausente |
| F3 | Admin ve todas las liquidaciones | Login admin | Tabla completa con filtros |
| F4 | Generar liquidación incluye tratamientos COMPLETADOS sin liquidar | Período con datos | Liquidación con N items |
| F5 | Liquidación con porcentaje calcula bien | Contrato 40% | totalLiquidado = totalBruto × 0.4 |
| F6 | Liquidación con monto fijo calcula bien | Contrato $10000/trat | totalLiquidado = N × 10000 |
| F7 | Aprobar liquidación cambia estado | Estado BORRADOR → APROBADA | OK |
| F8 | Pagar liquidación setea fechaPago | Estado APROBADA → PAGADA | fechaPago = now |
| F9 | Ver detalle muestra items | Botón "Ver detalle" | Modal con tabla de items |
| F10 | Imprimir abre reporte | Botón imprimir | Nueva pestaña con PDF layout |
| F11 | Sin tratamientos completados → error 400 | Período vacío | Mensaje claro |

---

## G. Google Calendar (sync)

| # | Caso | Esperado |
|---|------|----------|
| G1 | Conectar Google funciona | /configuracion → "Conectar Google" | Vuelve con banner verde |
| G2 | Listar calendarios | /usuarios → "Cargar calendarios" | Dropdown con calendarios |
| G3 | Asignar calendario a doctor persiste | Selector | DB actualizada |
| G4 | Sync inicial trae citas como Citas (matching) | Botón "Sincronizar ahora" tras asignar | Citas con paciente reconocido aparecen como CITA, no bloqueo |
| G5 | Eventos ambiguos quedan como bloqueo | Evento sin nombre claro | Bloqueo 🚫 |
| G6 | Convertir bloqueos a citas funciona | Botón "Convertir bloqueos a citas" | Cuenta de convertidos correcta |
| G7 | Crear cita en Cláriva → aparece en Google | Crear cita en /agenda | Evento en Google con título correcto |
| G8 | Editar cita actualiza Google | PATCH cita | Evento Google reflejado |
| G9 | Cancelar cita borra de Google | Estado CANCELADA | Evento desaparece |
| G10 | Crear bloqueo en Cláriva → aparece en Google | Bloqueo nuevo | 🚫 en Google |
| G11 | Cron cada 5 min trae cambios | Crear evento manual en Google, esperar 5 min | Aparece en Cláriva |
| G12 | Cláriva siempre gana en conflicto | Editar mismo evento en ambos | Versión Cláriva sobrevive |
| G13 | Sync con user sin calendarId no rompe | Sync general con un doctor sin calendarId | OK, lo saltea |
| G14 | Desconectar Google limpia calendarIds | Botón desconectar | Todos los users quedan con calendarId=null |

---

## H. Super-admin (gestor de plataforma)

> Acceso: **`https://super-admin.clariva.cl`** → login en modo plataforma (con **email**,
> cuenta de `control.PlatformAdmin`) → entra a **`/plataforma`**.

| # | Caso | Esperado |
|---|------|----------|
| H1 | Login super-admin con creds correctas | OK | Entra a `/plataforma` (dashboard) |
| H2 | Usuario común NO accede a super-admin | Login normal de clínica → intentar `/plataforma` | Redirige a `/agenda` (no es platform admin) |
| H3 | Crear clínica nueva | Form completo | Password aleatoria mostrada UNA vez, copiable |
| H4 | Slug duplicado rechazado | Mismo nombre | Error claro |
| H5 | Slug reservado rechazado | nombre = "admin" / "api" / "app" | Error claro |
| H6 | Cambiar plan de clínica | Botón en detalle | Persiste, AuditLog generado |
| H7 | Suspender clínica bloquea login de sus users | Suspender → user de esa clínica intenta login | No puede entrar |
| H8 | Reactivar reactiva login | Reactivar | Vuelve a funcionar |
| H9 | Extender trial actualiza trialHasta | Extender +30 días | Fecha correcta |
| H10 | Resetear password genera aleatoria | Reset sin escribir custom | Nueva password aparece UNA vez |
| H11 | Registrar pago manual con monto > $20M rechazado | Intentar | 400 con mensaje |
| H12 | Registrar pago manual con monto razonable OK | $50.000 | Pago creado, proximoCobro actualizado, AuditLog escrito |
| H13 | Eliminar pago revierte proximoCobro | Borrar último pago | Estado coherente |
| H14 | AuditLog persiste acciones | Verificar en DB que tabla AuditLogAdmin tiene entradas | Una por cada acción crítica |

---

## I. Performance y stress

| # | Caso | Esperado |
|---|------|----------|
| I1 | Agenda con 200+ citas/semana renderiza | Generar datos de prueba | < 2 seg first paint |
| I2 | Lista de pacientes con 1000+ items | Búsqueda y scroll | Sin freeze |
| I3 | Generar liquidación con 200+ tratamientos | Período grande | < 5 seg |
| I4 | Reporte de caja con 500+ movimientos | Imprimir | PDF se genera |
| I5 | Backup de DB funciona (Railway) | Verificar en dashboard de Railway que backup automático corre | OK |

---

## J. Recuperación ante fallas

| # | Caso | Esperado |
|---|------|----------|
| J1 | Google API caída no rompe creación de cita | Bloquear network a googleapis.com | Cita se guarda, `googleSyncError` marcado |
| J2 | DB lenta no bloquea más de N segundos | (más bien observacional) | Sin requests colgados |
| J3 | Cron cae 1 vez y se recupera al siguiente ciclo | Forzar fallo del cron | Próximo ciclo funciona |

---

## K. Lanzamiento — pre-venta

Estos son tareas de OPERACIÓN, no QA, pero son parte del lanzamiento:

- [ ] **Backup de DB**: Confirmá en Railway que existe backup automático (Postgres → Backups). Hacer un restore de prueba a una DB efímera.
- [ ] **Monitoreo de errores**: Instalar Sentry (o equivalente). Capturar errores client + server.
- [ ] **Contacto de soporte**: Definir email/canal donde las clínicas reportan bugs. Documentar.
- [ ] **Política de SLA**: Definir tiempo de respuesta a bugs (ej: bug crítico ≤ 4hs, alto ≤ 24hs).
- [ ] **Verificación Google OAuth**: Iniciar el proceso de verification con Google. Tarda 1-6 semanas. Mientras tanto, modo testing → cada clínica nueva agregada como test user a mano.
- [ ] **Política de privacidad y términos**: Publicar en clariva.cl. Obligatorio para Google verification y para vender.
- [ ] **Contrato comercial**: Modelo de contrato con la clínica (responsabilidades, SLA, precio, terminación).
- [ ] **Onboarding clínica nueva**: Documento paso a paso para el cliente (cómo conectar Google, asignar calendarios, etc.).
- [ ] **Plan de comunicación de downtime**: Cómo avisás a clínicas si Railway cae.

---

## Cómo reportar un bug

Cuando algo falle:

1. **Capturá screenshot** de la pantalla con el error.
2. **Anotá la URL exacta** (copiá la del browser).
3. **Pegá el stack trace** si aparece (sino, abrí DevTools → Network → click en la request que falló → tab Response).
4. **Indicá los pasos**: "1) Entré a X, 2) Hice click en Y, 3) Apareció Z".
5. **Mandalo a Claude Code** con el contexto y arreglamos en el momento.
