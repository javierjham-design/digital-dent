# Checklist de QA E2E — nuevo stack (Etapa 4-4)

> Verificación funcional del SPA + API antes del cutover. La parte **automática**
> ya corre verde (ver más abajo); la parte **manual** requiere ojos sobre la UI
> con datos reales y se recorre con la clínica de prueba `digital-dent`.

## Parte automática (ya verde)

| Check | Comando | Resultado |
|-------|---------|-----------|
| Lógica pura + smoke (sin DB) | `cd backend && npm test` | 55/55 ✓ |
| Integración multi-tenant + auth (sqlite) | `cd backend && npm run test:integration` | 15/15 ✓ |
| **Contrato FE↔BE** (toda llamada del front tiene ruta en el back) | `cd backend && npm run test:contract` | 111/111 ✓ |
| Typecheck backend | `cd backend && npm run typecheck` | ✓ |
| Build frontend | `cd frontend && npm run build` | ✓ |

## Puesta en marcha local (para la parte manual)

```bash
# 1. Backend (usa la MISMA DATABASE_URL que el monolito; solo lectura/escritura normal)
cd backend && cp .env.example .env   # completar DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npm run prisma:generate && npm run dev          # http://localhost:4000

# 2. Frontend (proxya /api → :4000)
cd frontend && npm run dev                      # http://localhost:5173
```

> ⚠️ Apunta a una DB de staging si es posible. Si se usa la de producción, hacerlo
> en horario de bajo uso; las operaciones son las normales de la app (no destructivas).

## Flujos críticos (manual) — marcar al verificar

### Autenticación y ruteo
- [ ] Login de clínica (slug + usuario + contraseña) entra a `/agenda`.
- [ ] Login de plataforma (toggle "Soy administrador de la plataforma", email) entra a `/plataforma`.
- [ ] Un super-admin que navega a una ruta de clínica es redirigido a `/plataforma` (y viceversa).
- [ ] Token inválido/expirado → 401 → limpia sesión y redirige a `/login`.
- [ ] Logout limpia el token y vuelve a `/login`.

### Agenda
- [ ] Vista semanal carga citas del profesional con su horario (business hours).
- [ ] Crear cita (paciente existente con buscador) → aparece en el calendario.
- [ ] Crear cita con paciente nuevo (alta inline) funciona.
- [ ] Arrastrar/redimensionar una cita la reagenda; si choca, **revierte** con aviso.
- [ ] Intentar agendar sobre otra cita del mismo profesional → bloqueo (salvo sobrecupo).
- [ ] Cambiar estado por el flujo (Agendada→Confirmada→…→Atendida); acción siguiente destacada.
- [ ] Bloqueo de agenda: crear y eliminar.
- [ ] Vista diaria lista citas con acción rápida de estado.

### Pacientes y ficha
- [ ] Listado de pacientes; buscador por nombre/RUT (`?q=`) filtra.
- [ ] Abrir ficha: pestañas Datos / Citas / Planes / Evoluciones / Odontograma.
- [ ] Editar datos demográficos + flags clínicos → guarda.
- [ ] Plan de tratamiento: crear, agregar acción (prestación + pieza), cambiar estado.
- [ ] Evolución: agregar nota.
- [ ] Odontograma: click en pieza → estado → color se actualiza y persiste.

### Cobros y caja
- [ ] Estado de caja (ABIERTA/CERRADA/SIN_SESION) correcto.
- [ ] Abrir sesión con saldo declarado; resumen muestra apertura/ingresos/egresos/esperado.
- [ ] Recibir pago (paciente + ítems + medio de pago) registra movimiento e ingreso.
- [ ] Registrar egreso; anular un movimiento; anular un cobro.
- [ ] Cerrar sesión con arqueo (diferencia declarada vs esperado).

### Liquidaciones
- [ ] Generar liquidación por profesional + período.
- [ ] Cambiar estado inline (BORRADOR→APROBADA→PAGADA).
- [ ] Contratos: listar activos + crear (porcentaje / monto fijo).

### Catálogo
- [ ] Prestaciones: listar / crear / editar / eliminar.
- [ ] Equipo (usuarios): listar / crear / editar permisos; doctores.
- [ ] Configuración de la clínica: guardar nombre/contacto/plantilla WhatsApp.

### Reportes
- [ ] Descargar cada XLSX (pacientes, citas, cobros, tratamientos, liquidaciones, caja, morosos) con auth, desde `/reportes`.

### Otros (gaps cerrados)
- [ ] Cambiar contraseña desde el header; primer ingreso fuerza el cambio.
- [ ] Ficha: KPIs en el encabezado + tabs Comentarios y Mensajes.
- [ ] Pacientes: Exportar XLSX, descargar Plantilla, Importar (solo admin) con resumen de resultado.
- [ ] Presupuestos: crear con ítems y cambiar estado.
- [ ] Ayuda (`/ayuda`): búsqueda y categorías.

### Super-admin (plataforma)
- [ ] Dashboard: KPIs + MRR.
- [ ] Clínicas: cartera con estado de pago; alta de clínica muestra credenciales (una vez).
- [ ] Detalle de clínica: cambiar plan/ciclo/precio/próximo cobro.
- [ ] Suspender / reactivar + notas internas.
- [ ] Extender trial.
- [ ] Restablecer contraseña del admin (muestra la temporal).
- [ ] Pagos de suscripción: registrar / eliminar (recalcula próximo cobro).
- [ ] Extras facturables: crear / pausar / eliminar.
- [ ] Config WhatsApp/Twilio (SID/número/template/token) guarda; token se cifra.
- [ ] Leads: listado de prospectos.
- [ ] Planes de suscripción: crear / editar precio / activar-desactivar.

## Gaps conocidos
- **Ninguno.** Paridad funcional al 100% (ver `parity-matrix.md` §C). Tech-debt no funcional: code-split del bundle del frontend (~630 KB por FullCalendar).
