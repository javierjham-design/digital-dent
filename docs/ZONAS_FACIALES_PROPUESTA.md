# Mapa de zonas faciales — propuesta para revisión clínica

> **Para quién es este documento:** para el profesional de estética facial que va a validar
> el mapa antes de que se programe. No hace falta saber nada de software para revisarlo.
>
> **Por qué importa que se revise ahora:** cada zona tiene un *código* que queda grabado en
> cada tratamiento que se registre. Cambiar un código después de que haya pacientes con
> tratamientos cargados obliga a una migración de datos. Agregar zonas nuevas más adelante
> es barato; renombrar o fusionar las existentes, no.

---

## Cómo está armado

Cada zona tiene tres cosas separadas a propósito:

El **código** es el identificador interno. Nunca se ve en pantalla y nunca cambia.
El **nombre clínico** es el término anatómico correcto, para la ficha y la historia.
El **nombre visible** es cómo lo va a leer la paciente en su presupuesto impreso.

Esa separación permite que mañana se decida mostrar "líneas periorbitarias" en vez de "patas
de gallo" sin tocar un solo dato guardado.

Los códigos **no llevan el grupo adentro** (no son `TS_FRENTE` sino `FRENTE`). El agrupamiento
por tercios es una decisión de presentación y va a cambiar; el código no debe cambiar con él.

La lateralidad va en el código (`_IZQ` / `_DER`) porque cada lado se trata, se cotiza y se
evoluciona por separado.

---

## Núcleo — 28 zonas

Estas son las que yo dejaría en la primera versión. Cubren lo que se cotiza habitualmente en
toxina botulínica, rellenos, bioestimuladores e hilos.

### Tercio superior

| Código | Nombre clínico | Nombre visible | Lados |
|---|---|---|---|
| `FRENTE` | Región frontal | Frente | media |
| `GLABELA` | Complejo glabelar | Entrecejo | media |
| `COLA_CEJA_IZQ` · `COLA_CEJA_DER` | Cola de ceja | Cola de ceja | 2 |
| `PERIORBITAL_LAT_IZQ` · `_DER` | Región periorbitaria lateral | Patas de gallo | 2 |
| `TEMPORAL_IZQ` · `_DER` | Región temporal | Sienes | 2 |

### Tercio medio

| Código | Nombre clínico | Nombre visible | Lados |
|---|---|---|---|
| `SURCO_LAGRIMAL_IZQ` · `_DER` | Surco lagrimal | Ojeras | 2 |
| `MALAR_IZQ` · `_DER` | Región malar | Pómulos | 2 |
| `SUBMALAR_IZQ` · `_DER` | Región submalar | Hueco de la mejilla | 2 |
| `SURCO_NASOGENIANO_IZQ` · `_DER` | Surco nasogeniano | Surco nasogeniano | 2 |
| `DORSO_NASAL` | Dorso nasal | Dorso de la nariz | media |
| `PUNTA_NASAL` | Punta nasal | Punta de la nariz | media |

### Tercio inferior

| Código | Nombre clínico | Nombre visible | Lados |
|---|---|---|---|
| `LABIO_SUPERIOR` | Labio superior | Labio superior | media |
| `LABIO_INFERIOR` | Labio inferior | Labio inferior | media |
| `PERIORAL` | Región perioral | Líneas del labio | media |
| `COMISURA_IZQ` · `_DER` | Comisura labial | Comisuras | 2 |
| `MARIONETA_IZQ` · `_DER` | Surco labiomentoniano | Líneas de marioneta | 2 |
| `MENTON` | Región mentoniana | Mentón | media |
| `LINEA_MANDIBULAR_IZQ` · `_DER` | Reborde mandibular | Línea mandibular | 2 |
| `MASETERO_IZQ` · `_DER` | Músculo masetero | Masetero | 2 |
| `SUBMENTON` | Región submentoniana | Papada | media |

### Global

| Código | Nombre clínico | Nombre visible | Lados |
|---|---|---|---|
| `ROSTRO_COMPLETO` | Rostro completo | Rostro completo | media |

`ROSTRO_COMPLETO` no es una zona anatómica: existe porque hay tratamientos que no se anclan a
una región (peelings, skinbooster, limpiezas, aparatología). Sin ella, el sistema obligaría a
marcar zonas arbitrarias para cotizar un peeling, y los datos quedarían sucios.

---

## Opcionales — para decidir

Estas las dejaría fuera de la primera versión salvo que el profesional las use seguido.
Agregarlas después es barato.

| Código | Nombre clínico | Por qué está en duda |
|---|---|---|
| `ALA_NASAL_IZQ` · `_DER` | Alas nasales | Se trata poco por separado del dorso |
| `SURCO_MENTOLABIAL` | Surco mentolabial | Suele cotizarse dentro de mentón |
| `BICHAT_IZQ` · `_DER` | Bolsa adiposa de Bichat | ¿Es zona o es un procedimiento quirúrgico sin mapa? |
| `PARPADO_INF_IZQ` · `_DER` | Párpado inferior | Se solapa con surco lagrimal |
| `PREAURICULAR_IZQ` · `_DER` | Región preauricular | Casi siempre va dentro de "óvalo facial" |
| `CUELLO` | Región cervical anterior | ¿El mapa incluye cuello o es solo rostro? |
| `ESCOTE` | Región esternal | Mismo caso que cuello |

---

## Lo que necesito que el profesional responda

Son seis preguntas. De ellas dependen los códigos definitivos.

**Labios.** ¿Se cotizan por separado el superior y el inferior, o casi siempre como "labios"?
Si es lo segundo, conviene una sola zona `LABIOS` y evitamos que en cada presupuesto haya que
marcar dos.

**Perioral.** ¿El "código de barras" se trata como una sola región central, o distinguen lado
izquierdo y derecho?

**Masetero.** ¿Va como zona propia —tiene sentido, porque el bruxismo se trata aparte— o lo
consideran parte de la línea mandibular?

**Bichectomía.** ¿Es una zona que se marca en el mapa, o es un procedimiento que se cotiza
sin anclarlo a una región?

**Cuello y escote.** ¿El mapa debe llegar hasta ahí? La imagen de referencia los incluía. Si
sí, cambia el dibujo que hay que encargar.

**Nomenclatura visible.** ¿Los nombres de la columna "nombre visible" son los que quieren que
lea la paciente en el presupuesto, o prefieren los clínicos? Se puede cambiar después sin
costo, pero conviene arrancar bien.

---

## Consecuencia sobre el dibujo

El SVG que se encargue tiene que tener **un trazo por cada zona aprobada, con el código exacto
como identificador**. Esa es toda la especificación: si el archivo trae los ids de esta lista,
el sistema lo toma sin tocar código.

Por eso conviene cerrar la lista **antes** de encargar la ilustración: agregar una zona
después implica volver al ilustrador.

Dos cosas prácticas sobre el asset: no puede ser una fotografía (una foto no se divide en
regiones limpias) y no puede ser la imagen de la referencia, que es de otro producto. Tiene
que ser una ilustración vectorial propia o con licencia, y conviene que exista en versión
femenina y masculina, porque el sistema ya deriva cuál mostrar del sexo del paciente.
