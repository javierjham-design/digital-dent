# Áreas clínicas — runbook de migración y ROLLBACK

> Escrito ANTES de la ventana, para no improvisar a las 20:30. Acompaña a la rama
> `feat/areas-clinicas` y al script `backend/src/scripts/areas-fase6.ts`.

## Principio que hace todo reversible

La migración **solo AGREGA**: columnas nuevas con default, tablas nuevas vacías, un índice
más laxo que el que reemplaza, y un backfill que escribe únicamente una columna nueva
(`Prestacion.categoriaId`). **Ningún dato preexistente se modifica ni se borra.** Por eso:

- El **código viejo funciona con el esquema nuevo** (no lee las columnas nuevas; su
  validación de duplicados de secciones es a nivel de aplicación, no depende del índice).
- El **esquema es reversible por SQL explícito**, sin restaurar backup.

## Secuencia (ventana)

1. Backup fresco (regla 10) — es cinturón, no plan A.
2. `areas-fase6.ts --apply` (ver idempotencia abajo).
3. `migrate:tenants -- --strict` — **FRENO: si da 2/3, PARAR. No hay deploy con schema
   disparejo.** El esquema parcial es inofensivo bajo el código viejo; se diagnostica la
   base fallida y se reintenta (el script y el push son idempotentes).
4. *(sesión aparte, con Javier mirando)* merge + deploy + `/health`.
5. *(ídem)* Verificación como usuario de digital-dent: catálogo/plan/ficha idénticos.

## Idempotencia del paso 2 (reintentos seguros)

`areas-fase6.ts --apply` se puede re-correr entero tras una falla parcial; cada sentencia
es idempotente por construcción:

| Paso | Guarda |
|---|---|
| ADD COLUMN `area` / `categoriaId` | `IF NOT EXISTS` |
| DROP índice viejo / CREATE índice nuevo | `IF EXISTS` / `IF NOT EXISTS` |
| Siembra de secciones (montenegro/orodent) | `WHERE NOT EXISTS (SELECT 1 FROM "CategoriaPrestacion")` — un solo INSERT atómico; con la tabla ya poblada no inserta nada (digital-dent con sus 29 tampoco se toca) |
| Backfill `categoriaId` | `WHERE "categoriaId" IS NULL` — re-corrida no-op |
| `area_dental` en control | solo si el CSV no tiene ya un código `area_*` |

Las clínicas se procesan de forma independiente: si falla la 2ª, la 1ª queda completa y el
reintento la atraviesa sin efectos.

## ROLLBACK

### Nivel A — falló la verificación post-deploy (paso 5): revertir SOLO el deploy
- **Vía rápida:** Railway → redeploy del deployment ANTERIOR de BACKEND y FRONTEND
  (minutos, sin tocar git). **Vía permanente:** `git revert` del merge en `arch` + push.
- Con el código viejo arriba, el esquema nuevo queda **inerte**: prod vuelve al
  comportamiento actual al 100%. Cero pérdida de datos, nada que restaurar. Se diagnostica
  con calma y se re-despliega cuando esté resuelto.

### Nivel B — revertir también el esquema (solo si se aborta el módulo completo)
Primero Nivel A (nunca quitar esquema con el código nuevo arriba). Luego, por tenant:
1. `UPDATE "Prestacion" SET "categoriaId" = NULL;`
2. `ALTER TABLE "Prestacion" DROP CONSTRAINT IF EXISTS "Prestacion_categoriaId_fkey";
   ALTER TABLE "Prestacion" DROP COLUMN IF EXISTS "categoriaId";`
3. `DROP TABLE IF EXISTS "TratamientoZona","ZonaFicha","DibujoFacial","ZonaFacial";`
   (vacías: estética no se habilita a clínicas reales hasta congelar la lista de zonas)
4. Restaurar el unique global:
   `DROP INDEX IF EXISTS "CategoriaPrestacion_nombre_area_key";
    CREATE UNIQUE INDEX "CategoriaPrestacion_nombre_key" ON "CategoriaPrestacion"("nombre");`
   (seguro: no pueden existir homónimas si nadie creó secciones de otra área)
5. `ALTER TABLE "CategoriaPrestacion" DROP COLUMN IF EXISTS "area";`
6. En montenegro/orodent: `DELETE FROM "CategoriaPrestacion";` (tenían 0 filas; las
   sembradas son del paso 2). En digital-dent NO tocar: sus 29 secciones preexisten.
   ⚠️ **Este DELETE asume que nadie tocó las secciones sembradas.** Si el rollback
   ocurre días después, ANTES de borrar hay que verificar que ninguna sección
   sembrada tenga trabajo encima; si lo tiene, NO borrarla (dejarla como sección
   legítima de la clínica):
   - sin prestaciones apuntándole: `SELECT count(*) FROM "Prestacion" WHERE "categoriaId" = <id>` = 0
     (correr ANTES del paso 1, que pone los categoriaId en NULL), y
   - sin ediciones posteriores a la migración: nombre/orden/noLiquidable idénticos a
     los sembrados (el seed copia el string `Prestacion.categoria`, orden alfabético,
     `noLiquidable=false`) — cualquier rename, reorden manual o flag activado es
     trabajo de la clínica.
7. Flags de User (`areaDental/areaEstetica/areaMedico`): DROP COLUMN o dejar inertes.
8. Control: `UPDATE "Clinica" SET modulos = replace(modulos, ',area_dental', '');`
   (`vertical` puede quedar — es inerte).

### Nivel C — cuándo haría falta el backup
En esta ventana, **para nada previsto**: no se toca ningún dato existente. El backup cubre
solo el escenario de bug catastrófico no anticipado; el restore es quirúrgico por clínica
(`docs/BACKUPS.md`, ensayado semanalmente).

## Decisión de diseño (confirmada 2026-08-10)

**Las áreas NO forman parte de los bundles de plan.** El plan define capacidad comercial;
el área define la naturaleza del negocio. No se mezclan: un cambio de plan jamás quita ni
regala un área (`cambiarPlan` preserva los `area_*`); las áreas se asignan al crear la
clínica (vertical) y se cambian solo desde la tarjeta de módulos del super-admin.
