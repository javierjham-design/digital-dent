# Session Handoff

> **Lee este archivo PRIMERO al iniciar una sesión.** Resume exactamente dónde quedó el trabajo, sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-06-12
- **Sesión:** Fase de maduración comercial pre-lanzamiento. Commits de la sesión: PWA (`315c964`), agenda+UX (`7d504a3`), y drag&drop + toasts + seguridad (último).

---

## Estado general

La plataforma (**Cláriva**, `app.clariva.cl` + subdominios por clínica) está en fase de pulido final para lanzamiento comercial este mes. Funciona en Railway con auto-deploy desde `master`.

## Qué se hizo en esta sesión

1. **PWA instalable** (commit `315c964`): manifest + íconos generados + service worker conservador (no cachea HTML/API) + banner de instalación (`components/PWASetup.tsx`). Artículos de ayuda sobre instalación agregados al manual.

2. **Agenda — mejora funcional mayor** (ver entrada 2026-06-11 en `AI_CHANGELOG.md`):
   - Estados clínicos completos: Agendada → Confirmada → **En espera** → **En atención** → Atendida (+ No asistió / Cancelada). Fuente única: `lib/cita-estados.ts`.
   - Flujo de recepción con un clic: botón de acción principal en el detalle de cita y quick-action por fila en vista Diaria (`siguienteEstado()`).
   - **Editar / Reagendar cita** (modal nuevo): fecha, hora, duración, doctor, motivo, notas. El PATCH loguea "Reagendada de X a Y".
   - **Anti doble-reserva** en backend (`lib/citas.ts` → `findCitaSolapada`): POST y PATCH devuelven 409 si el doctor ya tiene cita activa solapada. Sobrecupos exentos por diseño.
   - Sin `window.location.reload()`: todo usa `router.refresh()` + toasts → no se pierden filtros/vista/scroll.

3. **Base visual premium**:
   - Tipografía **Inter** (next/font) en toda la app.
   - `components/ui/Toaster.tsx`: sistema de toasts global (`toast.success/error/info`), montado en dashboard y super-admin.
   - `tabular-nums`, focus-visible consistente, `prefers-reduced-motion` en `globals.css`.

4. **Consistencia de estados** en dashboard, ficha del paciente y reportes (importan de `lib/cita-estados.ts`).

## Verificación

- `npx tsc --noEmit` limpio.
- `npx next build` **completo y exitoso** en Windows (el bug intermitente de prerender `_not-found` no apareció).

## Qué se hizo además (2026-06-12)

5. **Drag & drop en agenda**: arrastrar cita = reagendar; estirar = cambiar duración. Backend valida; revert + toast si rechaza.
6. **Toasts globales**: los 15 `alert()` de la plataforma convertidos a `toast.error`.
7. **Hardening de seguridad** (ver `docs/SECURITY.md`): headers HTTP (HSTS/CSP/nosniff/etc.), rate limiting de login (5 fallos/15min por usuario, 30 por IP) y de API global (300/min/IP), sesiones JWT de 12 h, contraseñas mínimo 8 con letra y número, bcrypt cost 12.

## Qué quedó pendiente

- **2FA TOTP para super-admin** (la cuenta más valiosa de la plataforma).
- **Sentry + monitoreo de uptime** (UptimeRobot u otro apuntando a app.clariva.cl).
- **Verificar backups Postgres en Railway** (retención + prueba de restore).
- **Super Admin**: el dashboard general podría sumar accesos rápidos y gráfico de MRR histórico.
- **QA checklist** `docs/QA_CHECKLIST_LANZAMIENTO.md` sigue pendiente de ejecución por el usuario.
- **Google OAuth verification** (para sacar la app de modo Testing) — trámite del usuario con Google.
- Operacional: política de privacidad, términos, monitoreo de errores (Sentry), verificación de backups, casilla soporte@clariva.cl.

## Decisiones técnicas relevantes de hoy

- `Cita.estado` sigue siendo String (no enum) → agregar estados fue no-destructivo.
- Las citas históricas solapadas no se tocan; la validación aplica solo a escrituras nuevas.
- El label de `PENDIENTE` ahora es **"Agendada"** en toda la UI (la constante en DB no cambió).

## Cómo probar rápido la agenda nueva

1. `/agenda` → click en un slot → agendar (toast verde, sin recarga de página).
2. Intentar agendar otra cita al mismo doctor en el mismo horario → error 409 con mensaje claro.
3. Click en cita → "Editar / Reagendar" → cambiar hora → guardar → ver log "Reagendada" en el historial.
4. Vista Diaria → botón de acción rápida por fila: Confirmar → Llegó → Pasar al sillón → Finalizar.
