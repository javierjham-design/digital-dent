# Asistente de IA de Cláriva

Consultas en lenguaje natural sobre los datos de una clínica, **solo lectura**, con
seudonimización de pacientes y límites de costo duros. Etapa 1 de 4 (backend, sin
pantalla todavía). Decisiones de diseño: `docs/PROMPT_ASISTENTE_IA.md`.

## Arquitectura (una página)

```
POST /api/v1/asistente/sesiones/:id/mensajes  { texto }
      │  cadena: requireAuth → requireTenant → requireModulo('asistente') → requireAsistenteHabilitado
      ▼
controllers/asistente.controller → services/asistente/sesiones.ejecutar…
      ▼
services/asistente/orquestador.ejecutarTurno
   1. límites (contadores desde AsistenteAuditoria, hora de la clínica) → 429 si excede
   2. seudonimiza la pregunta (seudonimo.haciaModelo): menciones/RUT/correo/teléfono→[DATO_OCULTO], nombres→PAC_n
   3. arma el prompt de sistema cacheado (contexto de clínica: nombre, rubro, tz, profesionales, boxes, medios)
   4. bucle tool-use con el proveedor (proveedor.ProveedorModelo):
        modelo pide herramienta → marco.ejecutarHerramienta (valida zod, verifica permiso,
        resuelve tokens→id, timeout 15s, acota filas, seudonimiza) → tool_result → repite (≤ MAX_ITERACIONES)
   5. verifica cifras del texto contra los resultados (verificacion.verificarCifras)
   6. guarda TODO seudonimizado (mensajes, resultados, mapa cifrado) + 1 fila de auditoría (siempre)
   7. rehidrata (seudonimo.desdeModelo) y responde { mensaje, resultados, cifrasNoVerificadas }
```

- **El proveedor es la única frontera con el SDK** (`services/asistente/proveedor.ts`).
  Interfaz `ProveedorModelo`; `ProveedorAnthropic` (real) y `ProveedorFalso` (tests).
  Cambiar a otro proveedor (OpenAI) es implementar la interfaz; nada más se toca.
- **Aislamiento**: el asistente accede a la base **solo** vía `tenantDb(req)` (los
  services existentes). No abre conexiones, roles ni pools nuevos.

## Dónde vive dato del paciente (para supresión y contrato con la clínica)

Todo en la **base del tenant** (aislamiento físico), y seudonimizado:

| Tabla | Qué guarda | Forma |
|---|---|---|
| `AsistenteSesion.mapaCifrado` | mapa token→id de la sesión | cifrado AES-256-GCM (`lib/crypto`) |
| `AsistenteMensaje.contenido` | pregunta/respuesta | seudonimizado (tokens PAC_n, no nombres) |
| `AsistenteResultado.filas` | tablas de resultados | seudonimizadas (identidad = token) |
| `AsistenteAuditoria` | uso/costo por turno | **sin contenido** (solo métricas) |

`DELETE /asistente/sesiones/:id` borra mensajes y resultados; la auditoría se conserva
(no tiene contenido y sostiene los contadores de costo). Nada de esto va a logs ni a
Sentry (el scrubber de `lib/observability` borra `texto`/`contenido`/`filas`/`mensajes`).

## Decisiones de negocio fijadas en código

Las herramientas no dejan estas definiciones al prompt; están en código:

- **Plan aprobado** = `PlanTratamiento.estado === 'ACTIVO'`.
- **Total de un plan** = suma de `precio × (1 − descuento/100)` de las acciones no
  canceladas (`tratamientos.service.totalesDePlan`, la misma que usa `listarPlanes`).
- **Abonado** = pagos de cobros PAGADO imputados a acciones + abono libre del plan
  (`CobroItem` con `tratamientoId = null` y cobro PAGADO).
- **Plan sin pago** = abonado 0. **Plan sin ejecución** = ninguna acción COMPLETADA.
- **Moroso / con saldo** = paciente con cobros en estado PENDIENTE (`reportes.morososDatos`).
- **Inactividad** (pacientes_inactivos_con_saldo) = medida contra la última cita REALIZADA.
- **Producción** (por profesional) = neto de acciones COMPLETADAS con `fechaCompletado`
  en el rango; **pagado** = cobros PAGADO imputados a esas acciones.
- **Inasistencia** (ocupacion_agenda) = cita `CANCELADA` (la agenda no modela un estado
  "no-show" aparte). El desglose por box queda para la etapa 3 (capa semántica).
- Cortes de fecha en **hora de la clínica** (`lib/tz`, `America/Santiago`).

## Herramientas (etapa 1)

`buscar_paciente`, `ficha_resumen`, `planes_sin_pago`, `planes_sin_ejecucion`,
`pacientes_inactivos_con_saldo`, `produccion_por_profesional` (gestor de liquidaciones o
el propio doctor), `cuadre_caja` (`puedeGestionarCajas`), `ocupacion_agenda`,
`embudo_crm` (módulo `crm` + `puedeGestionarCrm`). `planes_*` e inactivos exigen
`puedeVerReportes`. El registro se filtra por permisos **antes** de llamar al modelo y se
re-verifica al ejecutar (mismas reglas que `middlewares/permiso.ts` y `modulo.ts`).

### Cómo se agrega una herramienta

1. Crear un objeto `Herramienta` en `services/asistente/herramientas/` con `nombre`,
   `descripcion`, `parametros` (zod), `requiere`/`puedeVer`, `identidad` (columnas que son
   id de paciente/lead), `tokensParametro` (si recibe un token), y `ejecutar(ctx, params)`
   que devuelve `{ columnas, filas, totalFilas, resumen? }`. Reusar la consulta de un
   service existente (no duplicar la definición de negocio).
2. Registrarla en `herramientas/index.ts` (`REGISTRO`).
3. El marco se encarga de validar, permisos, tokens, timeout, cap y seudonimización.

## Configuración (env) y límites

| Env | Default | Qué |
|---|---|---|
| `ASISTENTE_ENABLED` | `false` | interruptor GLOBAL (503 si off) |
| `ANTHROPIC_API_KEY` | — | obligatoria solo si está encendido |
| `ASISTENTE_MODEL` | `claude-sonnet-4-6` | modelo del proveedor |
| `ASISTENTE_MAX_ITERACIONES` | 6 | tope de vueltas de tool-use por turno |
| `ASISTENTE_MAX_TOKENS_SALIDA` | 1500 | max_tokens de la respuesta |
| `ASISTENTE_TIMEOUT_MS` | 45000 | timeout de la llamada al proveedor (1 reintento) |
| `ASISTENTE_LIMITE_USUARIO_DIA` | 60 | consultas por usuario/día |
| `ASISTENTE_LIMITE_CLINICA_DIA` | 300 | consultas por clínica/día |
| `ASISTENTE_LIMITE_CLINICA_MES_USD` | 40 | tope mensual USD por clínica |
| `ASISTENTE_MAX_FILAS_MODELO` | 200 | filas que ve el modelo |
| `ASISTENTE_MAX_FILAS_RESULTADO` | 5000 | filas guardadas (tabla/Excel) |
| `ASISTENTE_PRECIOS_JSON` | — | override de la tabla de precios |

Constantes en código (no env): timeout por herramienta 15 s, por turno 60 s, historial 20
mensajes. **Modelo/precios**: la tabla incluye los IDs reales de hoy
(`claude-sonnet-4-6` 3/15/0,30/3,75, `claude-opus-4-8` 5/25/0,50/6,25, `claude-haiku-4-5`
1/5/0,10/1,25, `claude-fable-5` 10/50/1/12,5 — USD/millón entrada/salida/caché-leída/
caché-escrita) y también las claves `claude-sonnet-5`/`claude-opus-5` del diseño original,
por si esos IDs existen y se setean por env. "Sonnet 5 / Opus 5" del diseño ≈ estos.

## Runbook: cómo apagar el asistente

- **Para una clínica**: super-admin → quitar el módulo `asistente` de la clínica
  (`PATCH /admin/clinicas/:id/modulos`). La entrada de navegación desaparece sola (etapa 2).
- **Para todas**: `ASISTENTE_ENABLED=false` en Railway (backend). Todas las rutas
  `/api/v1/asistente/*` responden 503. Las tablas quedan inertes; no hay nada más que revertir.

## Cumplimiento

El mapa cifrado, el historial y la auditoría viven en la base del tenant y se documentan
acá como lugares donde vive dato del paciente. Pendiente del usuario (no del código):
acuerdo de tratamiento de datos con Anthropic y verificación de retención cero (ZDR) de la
organización antes de encender en una clínica productiva. El `mcp-server/` existente sigue
mandando leads identificables a Claude Desktop: deuda documentada, fuera de estas etapas.
