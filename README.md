# Cláriva

SaaS multi-tenant de gestión para clínicas y centros (dental / médico / estética).
Agenda, fichas clínicas, presupuestos, cobros, caja, liquidaciones y panel de
super-administración, con confirmaciones por WhatsApp e integración con Google
Calendar.

## Arquitectura

Stack separado, **en producción** (rama `arch/split-frontend-backend`). El monolito
Next.js original fue retirado en el cutover del 2026-06-20 y eliminado del árbol el
2026-08-03; queda en el tag `monolito-final`. Estado y detalle en [`docs/`](docs/):

| Servicio | Carpeta | Rol |
|----------|---------|-----|
| **web** | `web/` | Sitio público / landing + landing pages de campaña |
| **frontend** | `frontend/` | SPA de las clínicas (Vite + React), por subdominio `<slug>.clariva.cl` |
| **backend** | `backend/` | API REST (Express + Prisma) |
| **shared** | `shared/` | DTOs y constantes compartidas |

- **Tenancy por subdominio** + **base de datos física por clínica**
  (database-per-tenant): un control-plane registra las clínicas y cada una tiene
  su propia base aislada. Ver `docs/architecture.md` y la decisión en
  `docs/AI_CHANGELOG.md`.
- **Hosting: Railway** (auto-deploy desde GitHub). Ver `docs/cutover.md` y
  `docs/deploy-extras.md`.

## Desarrollo

```bash
# Backend (http://localhost:4000)
cd backend && npm install && npm run dev

# Frontend / Web (Vite)
cd frontend && npm install && npm run dev
cd web && npm install && npm run dev
```

## Documentación

- `docs/architecture.md` — arquitectura y etapas de la migración.
- `docs/cutover.md` — runbook de despliegue en Railway.
- `docs/parity-matrix.md` · `docs/qa-report.md` — paridad y QA.
- `docs/AI_CHANGELOG.md` — historial de cambios.
- `docs/SESSION_HANDOFF.md` — estado actual (leer primero).
- `docs/AUDITORIA_2026-08.md` — auditoría técnica y prioridades.
- `docs/PROMPT_BACKUPS.md` — plan de backups por clínica.
