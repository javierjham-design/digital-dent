# Contrato del SVG del rostro (mapa de zonas faciales)

> Especificación para encargar la ilustración definitiva. Si el archivo entregado
> cumple esto, el sistema lo toma **sin tocar una línea de código**.
>
> ⚠️ **NO ENCARGAR TODAVÍA**: la lista de zonas está en revisión de un profesional
> del rubro (6 preguntas abiertas en `docs/ZONAS_FACIALES_PROPUESTA.md` pueden
> cambiar códigos). Encargar la ilustración después de congelar la lista — agregar
> una zona después implica volver al ilustrador. Nota: el título de la propuesta
> dice "28 zonas" pero sus tablas enumeran 32 ids (abajo); conciliar en la revisión.

## Entregables

Dos archivos SVG con **exactamente la misma estructura e ids**:

- `rostro-f.svg` — ilustración femenina
- `rostro-m.svg` — ilustración masculina

Solo cambia el dibujo base (rasgos/peinado); las zonas son las mismas.

## Estructura obligatoria

```
<svg viewBox="0 0 1000 1300">
  <g id="base">   … la ilustración (NO interactiva) …   </g>
  <g id="zonas">
    <path id="zona-FRENTE" d="…" />
    <path id="zona-GLABELA" d="…" />
    … un <path> por zona, con su id exacto …
  </g>
</svg>
```

Reglas:
- **viewBox `0 0 1000 1300`** en ambos archivos (mismas coordenadas F/M).
- **Un `<path>` cerrado por zona**, id `zona-{CODIGO}` con el código EXACTO de la
  tabla de abajo. Sin transforms anidados (coordenadas "horneadas"); `fill`
  transparente o ninguno — el color lo pinta la aplicación.
- **Lateralidad desde la perspectiva del PACIENTE**: su `_IZQ` se dibuja a la
  **derecha** del espectador (el rostro mira de frente).
- La base (`<g id="base">`) puede ser vector o imagen embebida; las zonas SIEMPRE
  vectoriales. No puede ser fotografía ni la imagen de referencia de otro producto:
  ilustración propia o con licencia.
- `zona-ROSTRO_COMPLETO` no es anatómica: dibujarla como un anillo/halo clicable en
  el borde del óvalo facial (ancla tratamientos de rostro completo: peelings,
  aparatología).

## Lista de ids (32) — ⚠️ provisional hasta la revisión profesional

| id del path | Zona (nombre visible) |
|---|---|
| `zona-FRENTE` | Frente |
| `zona-GLABELA` | Entrecejo |
| `zona-COLA_CEJA_IZQ` / `zona-COLA_CEJA_DER` | Cola de ceja |
| `zona-PERIORBITAL_LAT_IZQ` / `zona-PERIORBITAL_LAT_DER` | Patas de gallo |
| `zona-TEMPORAL_IZQ` / `zona-TEMPORAL_DER` | Sienes |
| `zona-SURCO_LAGRIMAL_IZQ` / `zona-SURCO_LAGRIMAL_DER` | Ojeras |
| `zona-MALAR_IZQ` / `zona-MALAR_DER` | Pómulos |
| `zona-SUBMALAR_IZQ` / `zona-SUBMALAR_DER` | Hueco de la mejilla |
| `zona-SURCO_NASOGENIANO_IZQ` / `zona-SURCO_NASOGENIANO_DER` | Surco nasogeniano |
| `zona-DORSO_NASAL` | Dorso de la nariz |
| `zona-PUNTA_NASAL` | Punta de la nariz |
| `zona-PERIORAL` | Líneas del labio |
| `zona-LABIO_SUPERIOR` | Labio superior |
| `zona-LABIO_INFERIOR` | Labio inferior |
| `zona-COMISURA_IZQ` / `zona-COMISURA_DER` | Comisuras |
| `zona-MARIONETA_IZQ` / `zona-MARIONETA_DER` | Líneas de marioneta |
| `zona-MENTON` | Mentón |
| `zona-LINEA_MANDIBULAR_IZQ` / `zona-LINEA_MANDIBULAR_DER` | Línea mandibular |
| `zona-MASETERO_IZQ` / `zona-MASETERO_DER` | Masetero |
| `zona-SUBMENTON` | Papada |
| `zona-ROSTRO_COMPLETO` | Rostro completo (anillo en el borde) |

## Referencia funcional

El placeholder actual (formas simples, mismas posiciones anatómicas y mismos ids)
vive en `shared/src/constants/zonas-faciales.ts` y se puede ver funcionando en la
app: sirve al ilustrador como referencia de QUÉ zona va DÓNDE y cómo interactúa.

## Cómo se integra el archivo entregado

1. Se copian los paths de `<g id="zonas">` del SVG entregado al campo `path` de
   cada zona en `shared/src/constants/zonas-faciales.ts` (única fuente).
2. La base (`<g id="base">`) reemplaza la base placeholder de
   `frontend/src/components/GraficoFacial.tsx` (variantes F/M).
3. Nada más: ids y viewBox coinciden → el mapa, los estados y el dibujo libre
   funcionan sin cambios.
