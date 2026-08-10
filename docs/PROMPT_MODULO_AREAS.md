# Módulo de áreas clínicas — Dental · Estética facial · Médico

> Versión definitiva, 2026-08-07. Reemplaza cualquier versión anterior.
>
> **Decisiones ya tomadas:** diagrama facial estructurado (zonas clicables) **con capa de
> dibujo encima** · habilitación en **dos niveles** (módulo por clínica + toggle por
> profesional) · entrega **en una sola rama**, con las fases en el orden de abajo y dos
> checkpoints donde el desarrollador para y espera tu OK.

---

## Qué se está construyendo, en una frase

Que la misma plataforma sirva a un odontólogo, a un médico y a un profesional de estética
facial, cada uno con su catálogo, su ficha y su diagrama — y que un profesional que hace dos
de esas cosas las vea como pestañas dentro del mismo plan del mismo paciente.

## El prompt (copiar entero)

```
Contexto: Cláriva, SaaS multi-tenant en producción con 3 clínicas reales,
database-per-tenant. Leé docs/SESSION_HANDOFF.md y CLAUDE.md antes de empezar.

Vamos a construir el módulo de ÁREAS CLÍNICAS: DENTAL, ESTETICA, MEDICO. Todo en UNA rama,
respetando el orden de las fases (la 0 va primero por una razón que explico ahí) y parando
en los dos checkpoints marcados.

═══ CONCEPTO ═══

Un área se habilita en DOS niveles y necesita los dos:

1. NIVEL CLÍNICA (control-plane, comercial). Qué áreas contrató la clínica. Sumá los
   códigos a shared/src/constants/modulos.ts junto a `crm` y `agendamiento_online`, para
   que el super-admin las asigne y se puedan cobrar como extra. Por defecto una clínica
   nueva recibe el área que corresponde a su `vertical` (lib/verticales.ts): una dental
   nace con dental, una estética con estética. OJO con MODULOS_DEFAULT: las 3 clínicas
   actuales tienen que quedar exactamente como están hoy.

2. NIVEL PROFESIONAL (tenant). Qué áreas trabaja cada usuario. Seguí el patrón de los flags
   `puede*` del modelo User. Se configura en Equipo, en la pestaña de permisos. Un
   profesional puede tener dos (dental + estética es el caso típico).

Un área está disponible para alguien solo si la clínica la contrató Y el usuario la tiene.

═══ FASE 0 — BLINDAJE PREVIO (hacé esto ANTES que nada) ═══

Dos cosas que hoy son inofensivas porque todo es dental, y que se vuelven destructivas en
cuanto exista la primera prestación de otra área. Van primero, con sus tests, antes de
tocar el modelo.

0.1 — dedupePrestaciones (backend/src/services/catalogo.service.ts) fusiona prestaciones
usando nombre + categoría como clave, y corre en CADA ARRANQUE del backend sobre TODAS las
clínicas (se dispara desde src/index.ts). El día que exista una "Consulta" dental y una
"Consulta" estética en secciones homónimas, esa función las va a considerar duplicadas y
las va a FUSIONAR SOLA, en producción, reasignando tratamientos de un área a la otra.
Meté el área en prestacionKey. Test: dos prestaciones homónimas de áreas distintas NO se
fusionan; dos homónimas de la misma área sí (comportamiento actual intacto).

0.2 — Unicidad de nombres POR ÁREA, no global. Va a existir una sección "General" dental y
otra "General" de estética, y las dos son legítimas. Revisá todo constraint, índice único o
validación que hoy asuma nombre único de sección o de prestación, y hacelo por área. Si no,
la segunda área simplemente no va a poder crear sus secciones y el error no va a explicar
por qué.

═══ FASE 1 — MODELO DE DATOS ═══
═══ ⛔ CHECKPOINT 1: proponémelo y esperá mi OK antes de escribir una línea ⛔ ═══

- CategoriaPrestacion: campo `area`, default "DENTAL". El área vive en la CATEGORÍA, no en
  cada prestación: son 29 categorías a etiquetar en vez de 774 prestaciones, y las
  prestaciones heredan de su categoría. Todo lo existente queda DENTAL.

- User: los tres flags de área. Proponé booleanos (consistente con los `puede*`) o CSV
  (consistente con Clinica.modulos) y decime cuál conviene y por qué.

- ZonaFacial: catálogo de zonas clínicas por tenant (codigo, nombre, grupo, orden, activo).
  PROPONEME LA LISTA COMPLETA y esperá mi OK: se siembra en la base de cada clínica y la
  quiero validar con un profesional de estética antes de congelarla. Renombrar o agregar
  zonas después implica migrar datos clínicos ya cargados.

- Estado por zona: hoy `Diente` guarda estado por pieza y cara de cada ficha. Necesitamos el
  equivalente por zona facial. Proponé el modelo.

- Tratamiento: agregá la referencia a la zona facial. NO toques `diente` ni `cara` — el
  odontograma queda intacto. Un tratamiento dental usa diente/cara, uno estético usa zona,
  uno médico no usa ninguno de los tres.

- Capa de dibujo: modelo SEPARADO del de zonas. Ver fase 5.

- El área NO va en PlanTratamiento. Un mismo plan puede tener acciones dentales y faciales
  conviviendo: es el paciente que hace las dos cosas, que es justo el caso de negocio que
  este módulo quiere capturar. Si el área viviera en el plan, ese paciente necesitaría dos
  planes, dos presupuestos y dos saldos. El área se deriva de la categoría de la prestación
  de cada tratamiento.

Todo estrictamente ADITIVO. Regenerá init.sql (la guarda anti-drift lo va a exigir).

═══ FASE 2 — BACKEND ═══

- Filtro por área en el catálogo de prestaciones y en las categorías.
- El selector de prestaciones del plan devuelve solo las del área activa.
- Guard: un profesional no puede crear un tratamiento de un área que no tiene habilitada,
  ni la clínica una que no contrató. Reusá el patrón de requireModulo y requirePermiso; no
  inventes una cadena nueva si ya existe la equivalente.
- Liquidaciones, cobros, presupuestos y reportes NO cambian de lógica: un tratamiento es un
  tratamiento, sea del área que sea. Verificá que nada se rompa por los campos nuevos.

═══ FASE 3 — CATÁLOGO POR ÁREA (frontend) ═══

Cada área tiene su catálogo COMPLETO e independiente, no un subconjunto del dental. Las 774
prestaciones y 29 secciones actuales son todas dentales; estética y médico arrancan vacías y
cada clínica arma las suyas.

En la página de Prestaciones, arriba de todo: selector de área (Dental · Estética facial ·
Médico), mostrando solo las que la clínica contrató Y el usuario tiene. Si hay una sola, el
selector NO se muestra.

Todo lo de abajo opera dentro del área seleccionada, con las MISMAS capacidades: crear
secciones, renombrar, reordenar con las flechas, marcar "No liquidable", crear y editar
prestaciones, eliminar. Sin recortes — el catálogo estético tiene que poder hacer todo lo
que hace el dental.

El contador del encabezado ("774 prestaciones · 29 secciones") debe reflejar el ÁREA ACTIVA,
no el total global. Si un médico entra y lee 774, va a buscar prestaciones que no existen
en su área.

═══ FASE 4 — EQUIPO Y PLAN DE TRATAMIENTO ═══

- Equipo: toggles de área por profesional, en la misma pestaña de permisos.

- Detalle del plan: pestañas por área, mostradas SOLO si el profesional tiene más de una
  habilitada. Con una sola se ve directo, sin pestañas.
  · Dental → odontograma actual, sin ningún cambio.
  · Estética → gráfico facial (fase 5).
  · Médico → sin diagrama: solo el armado del plan desde el catálogo médico.

═══ FASE 5 — GRÁFICO FACIAL: DOS CAPAS SOBRE EL MISMO LIENZO ═══

Son dos cosas distintas que conviven visualmente pero NO comparten almacenamiento ni lógica.
Esto es lo más importante de la fase:

CAPA 1 — ZONAS CLÍNICAS (el equivalente del odontograma).
SVG de rostro donde cada zona es un path clicable con id. Se seleccionan una o varias zonas
y se les asignan prestaciones. Quedan con estado y color, como los dientes. Alimenta el
plan, el presupuesto, el cobro y la liquidación. Esto es lo facturable.

CAPA 2 — DIBUJO LIBRE (anotación clínica).
Barra de herramientas sobre el mismo lienzo: puntero, lápiz, círculo, línea, goma,
deshacer, reiniciar y toggle de género de la ilustración. Guardalo como TRAZOS VECTORIALES
(array de {herramienta, color, puntos}), NUNCA como imagen rasterizada: tiene que poder
editarse después y escalar sin pixelarse.

Reglas de la separación — son criterio de aceptación, no sugerencias:
- La goma borra trazos, JAMÁS zonas ni tratamientos.
- Un trazo nunca genera una prestación ni aparece en un presupuesto.
- Modo explícito: con el puntero se seleccionan zonas, con las herramientas se dibuja.
  Nunca los dos a la vez, para que nadie asigne una prestación queriendo dibujar.
- Borrar un plan o un tratamiento no borra los trazos, y viceversa.

Yo te entrego el SVG. Definí vos el contrato que necesitás (nombres de id, estructura de
grupos, cómo mapea cada path a un código de ZonaFacial, cómo conviven las variantes
femenina y masculina con los mismos ids) y decímelo en el CHECKPOINT 1, así lo encargo una
sola vez con las especificaciones exactas. Mientras no llegue, trabajá con un placeholder
de pocas zonas para poder avanzar.

═══ FASE 6 — A PRODUCCIÓN ═══
═══ ⛔ CHECKPOINT 2: parás y esperás mi OK antes de aplicar la migración ⛔ ═══

- Backup fresco antes (regla 10 de CLAUDE.md).
- `migrate:tenants -- --strict`. Confirmame OK en las 3 bases, no en 2 de 3.

═══ REGLAS QUE NO SE NEGOCIAN ═══

- Las 3 clínicas productivas no deben ver NINGÚN cambio hasta que se les habilite un área
  nueva. Es criterio de aceptación, no un detalle: probalo explícitamente, entrando como un
  usuario de digital-dent y verificando que catálogo, plan y ficha se ven igual que hoy.
- Probá contra una clínica DEMO (regla 9), nunca contra una productiva.
- No toques migrate-tenants.ts ni el pipeline de CAPI/Meta.
- Commits separados por fase. Si una fase se complica, que no arrastre a las anteriores.

═══ VERIFICACIÓN ═══

typecheck backend/frontend/web · toda la suite · lint · y una prueba e2e en una demo:
crear un plan con acciones de dos áreas distintas más trazos de dibujo, y comprobar que
borrar los trazos no toca los tratamientos, que el presupuesto suma las dos áreas, y que la
liquidación del profesional cuadra.

Actualizá docs/AI_CHANGELOG.md y docs/SESSION_HANDOFF.md al cerrar.
```

---

## Especificación de la ilustración (para quien la diseñe)

**Encargala después del CHECKPOINT 1**, cuando tengas los códigos exactos de zona. Si la
pedís antes, va a haber que rehacerla para que los `id` calcen.

Un archivo **SVG** (no PNG ni JPG) de un rostro en vista frontal, con:

- **Cada zona clínica como un `<path>` independiente**, con `id` legible, en minúsculas y sin
  tildes: `frente`, `entrecejo`, `patas-gallo-izq`, `surco-nasogeniano-der`,
  `labio-superior`, `menton`, `cuello`…
- Zonas agrupadas por región en `<g>` (tercio superior, medio, inferior, cuello).
- **Ningún punto de la cara pertenece a dos zonas**: los paths no se superponen.
- Sin texto incrustado, sin degradados, sin filtros ni efectos.
- `viewBox` normalizado, sin `width`/`height` fijos, para que escale.
- `fill` plano y sólido en cada path, para recolorearlo por CSS según el estado clínico.
- **Dos variantes, femenina y masculina, con los MISMOS `id`**, para que el toggle de género
  no cambie ninguna lógica de la aplicación.
- Imagen propia o con licencia comercial. La captura de referencia es de otro producto.

## Decisiones de diseño y por qué

**El área vive en la categoría, no en la prestación.** 29 categorías contra 774 prestaciones.
Etiquetar categorías es una tarde; etiquetar prestaciones una por una es una semana y se
desincroniza sola.

**El área no vive en el plan de tratamiento.** Las pestañas de la referencia están *dentro*
de un mismo plan. Si el área estuviera en el plan, el paciente que hace dental y estética
necesitaría dos planes, dos presupuestos y dos saldos — justo el caso que este módulo quiere
capturar.

**Las zonas y el dibujo son almacenamientos distintos.** Si comparten uno, la goma termina
borrando tratamientos facturables, o aparecen trazos en un presupuesto. Se ven en el mismo
lienzo; no son la misma cosa.

**Dos niveles de habilitación.** El de clínica te deja venderlo como add-on igual que CRM y
agendamiento online. El de profesional evita que a un odontólogo le aparezcan zonas faciales
en su plan. Hacen falta los dos.

**La fase 0 va primero.** `dedupePrestaciones` corriendo en cada arranque sobre todas las
clínicas, con una clave que ignora el área, es un borrado silencioso de datos clínicos
esperando a que exista el catálogo estético. Hoy no puede pasar; el día que se cargue la
primera prestación estética homónima, sí. Se cierra antes de crear la posibilidad.

## Lo que quedó fuera a propósito

Nada de agenda por área, ni reportes segmentados por área, ni consentimientos específicos de
estética, ni fotografías antes/después. Todo eso es razonable y probablemente aparezca
después; meterlo ahora convierte una entrega grande en una interminable.
