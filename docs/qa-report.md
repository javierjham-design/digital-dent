# Informe de QA y paridad — Etapa 4 (cierre)

> Consolida la auditoría de paridad y la batería de pruebas del nuevo stack
> (backend Express `/api/v1` + frontend SPA) frente al monolito Next.js.
> Fecha: 2026-06-17 · Rama: `arch/split-frontend-backend` · master/monolito intactos.

## 1. Veredicto

**GO para el cutover (Etapa 5).** El backend está 100% portado y verificado en sus
propiedades críticas (auth, aislamiento multi-tenant, doble reserva, facturación).
**Paridad funcional al 100%: todos los gaps de la matriz fueron cerrados**
(2026-06-17) — Presupuestos, Reportes, cambiar-password, comentarios, mensajes,
resumen/KPIs, import/export/template y Ayuda. No quedan gaps pendientes.
Recomendado: pase del checklist manual contra staging antes de retirar el monolito.

## 2. Qué se verificó (todo verde)

| Suite | Alcance | Resultado |
|-------|---------|-----------|
| Lógica pura (Vitest) | billing/MRR, solapamiento, máquina de estados de cita, crypto AES-256-GCM | 44/44 ✓ |
| Smoke HTTP (supertest, sin DB) | health, helmet/x-powered-by, 401 en protegidas y admin, JWT inválido, 404; ensamblado del grafo de imports | 11/11 ✓ |
| Integración (sqlite efímera) | login dual, aislamiento multi-tenant (pacientes/citas), mutación cruzada bloqueada, doble reserva 409 + sobrecupo, gating de roles | 15/15 ✓ |
| Contrato FE↔BE | 111 llamadas del frontend mapeadas a rutas del backend | 111/111 ✓ |
| Typecheck backend / Build frontend | `tsc --noEmit` / `vite build` | ✓ / ✓ |

**Total: 70/70 tests automatizados verdes.** Reproducible con `npm test`,
`npm run test:integration`, `npm run test:contract` (backend).

## 3. Propiedad crítica: aislamiento multi-tenant

Verificado **a nivel de stack completo** (HTTP→middleware→service→DB):
- Una clínica no lista ni obtiene pacientes/citas de otra.
- `GET/PATCH` de un recurso ajeno → 404 y el recurso ajeno queda intacto.
- No se puede agendar usando paciente/doctor de otra clínica.
- Admin de clínica no accede a `/admin/*` (403); super-admin sí, pero no a rutas de clínica.

Es la garantía de seguridad #1 de un SaaS multi-tenant y la mayor preocupación de
esta migración: **probada en runtime**, no solo por inspección.

## 4. Estado de paridad (resumen de `parity-matrix.md`)

- **API:** ~100% portada. 5 endpoints sin equivalente, **ninguno usado por la SPA**
  (sin features rotas): `cambiar-password`, `comentarios`, `mensajes`, `[id]/resumen`,
  import/export de pacientes.
- **UI:** 4 vistas sin portar — **Presupuestos** y **Reportes** (media; el cliente
  FE ya existe, falta la página), home de dashboard y ayuda (bajas).

## 5. Gaps y plan antes de retirar el monolito

| ID | Gap | Estado |
|----|-----|--------|
| P1 | Página Presupuestos (SPA) | ✅ Cerrado. |
| P2 | Página Reportes (SPA) | ✅ Cerrado. |
| E1 | `cambiar-password` (back+UI) | ✅ Cerrado. |
| E2 | `comentarios` administrativos | ✅ Cerrado. |
| E3 | `mensajes` (historial) | ✅ Cerrado. |
| E4 | `resumen`/KPIs del paciente | ✅ Cerrado. |
| E5 | import/export/template pacientes | ✅ Cerrado. |
| — | Ayuda | ✅ Cerrado. Home: no era gap (redirige a /agenda). |

**No quedan gaps pendientes.** Tests: 55/55 unit+smoke · 22/22 integración · contrato 116/116.

## 6. Riesgos residuales para el cutover (Etapa 5)

1. **Datos en producción**: las suites de integración corren sobre sqlite efímera,
   nunca sobre Railway. Antes del switch, hacer un pase del checklist manual
   (`qa-checklist.md`) contra una DB de **staging** con datos reales.
2. **CORS / cookies**: el backend ya restringe `corsOrigins`; validar el dominio
   real del frontend en el cutover.
3. **Schema ownership**: hoy el schema vive en el monolito y el backend tiene copia
   sincronizada; al cutover el backend pasa a ser dueño único (documentar en Etapa 5).
4. **Bundle del frontend** (~600 KB por FullCalendar): code-split pendiente (no
   bloqueante; tech-debt de rendimiento).
5. **Secretos**: `JWT_SECRET` y `ENCRYPTION_KEY` deben existir y ser estables en
   producción (el token cifrado de Twilio depende de `ENCRYPTION_KEY`).

## 7. Recomendación

1. Cerrar P1 + P2 (y decidir E1/E2) — trabajo acotado de UI.
2. Pase manual del `qa-checklist.md` contra staging.
3. Proceder a Etapa 5 (2 servicios Railway + DNS + retiro del monolito).
