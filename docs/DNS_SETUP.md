# DNS y dominios — Plataforma multi-tenant

Esta plataforma soporta dos modos de acceso:

1. **Por subdominio** (modo final, recomendado).
2. **Por path** (modo fallback, sin DNS configurado — funciona hoy).

El modo subdominio se activa **sólo si la variable `PLATFORM_DOMAIN` está
definida en Railway**. Si no, todo sigue funcionando por path.

---

## Arquitectura con dominio propio

Asumamos que tu dominio es `tudominio.cl`. La plataforma reconoce estos subdominios:

| URL                              | Qué muestra                                      |
| -------------------------------- | ------------------------------------------------ |
| `tudominio.cl` o `www.tudominio.cl` | Landing pública (marketing, precios, contacto)   |
| `super-admin.tudominio.cl`       | Panel super-admin (solo tú)                      |
| `super-admin.tudominio.cl/login` | Login del super-admin                            |
| `digital-dent.tudominio.cl`      | Plataforma de la clínica "digital-dent"          |
| `digital-dent.tudominio.cl/login`| Login de la clínica                              |
| `montenegro.tudominio.cl`        | Plataforma de la clínica "montenegro"            |
| ... cualquier `<slug>.tudominio.cl` | Plataforma de esa clínica                     |

**Subdominios reservados** (no se pueden usar como slug de clínica):
`super-admin`, `www`, `admin`, `api`, `app`, `mail`, `login`, `auth`,
`panel`, `dashboard`, `support`, `soporte`, `help`, `ayuda`, `blog`,
`docs`, `status`, `cdn`, `assets`, `static`.

Cada subdominio tiene su **propia cookie de sesión**, por lo que puedes:
- Estar logueado como super-admin en una pestaña.
- Estar logueado como Administrador de Montenegro en otra pestaña.
- Estar logueado como Doctor de Digital-Dent en otra pestaña.
- Todas al mismo tiempo, en el mismo navegador, sin que se interfieran.

---

## Modo path (activo hoy, sin DNS)

Sin configurar dominio, las URLs son:

```
https://digital-dent-production.up.railway.app/                      ← landing pública
https://digital-dent-production.up.railway.app/digital-dent-admin-login ← super-admin
https://digital-dent-production.up.railway.app/c/digital-dent/login  ← clínica
https://digital-dent-production.up.railway.app/c/montenegro/login    ← clínica
```

**Limitación del modo path**: como solo hay un dominio,
**solo puedes tener una sesión activa por navegador**.
Para tener varias clínicas abiertas en paralelo, usa ventanas incógnito
o perfiles distintos de Chrome — o pasa al modo subdominio.

---

## Pasos para activar el modo subdominio

### 1. Comprar dominio

Cualquier registrador (NIC.cl, Namecheap, Cloudflare, Hover, etc.).
**Recomendado: Cloudflare** por DNS rápido y SSL gratuito wildcard.

### 2. Apuntar DNS a Railway

En tu DNS provider, configura:

| Tipo  | Nombre      | Valor                            | Propósito                        |
| ----- | ----------- | -------------------------------- | -------------------------------- |
| A     | `@`         | (IP de Railway)                  | Raíz: `tudominio.cl`            |
| CNAME | `www`       | `<host>.up.railway.app`          | `www.tudominio.cl`               |
| CNAME | `*`         | `<host>.up.railway.app`          | **Wildcard** (todos los subdominios) |

> Cloudflare permite `CNAME @` con flattening — más cómodo que A.
> El wildcard `*` es lo que permite que `cualquier-cosa.tudominio.cl` apunte a Railway.

### 3. Añadir custom domains en Railway

En Railway → tu servicio → **Settings → Networking → Custom Domain**.
Añade los tres:
- `tudominio.cl`
- `www.tudominio.cl`
- `*.tudominio.cl` (wildcard)

Railway emite **SSL automático** para cada uno vía Let's Encrypt.
El wildcard genera certificado on-demand al recibir el primer request en
cada subdominio nuevo.

### 4. Configurar variable de entorno

En Railway → Variables:

```
PLATFORM_DOMAIN=tudominio.cl
```

(Sin `www.`, sin `https://`, sin path. Solo el dominio raíz.)

Reinicia el servicio.

### 5. Verificar

| URL                                  | Debe mostrar                          |
| ------------------------------------ | ------------------------------------- |
| `https://tudominio.cl`               | Landing pública                       |
| `https://www.tudominio.cl`           | Landing pública (mismo contenido)     |
| `https://super-admin.tudominio.cl`   | Login super-admin                     |
| `https://digital-dent.tudominio.cl`  | Login de la clínica Digital-Dent      |
| `https://montenegro.tudominio.cl`    | Login de la clínica Montenegro        |
| `https://no-existe.tudominio.cl`     | Login con error "clínica no encontrada" |

### 6. (Opcional) `NEXTAUTH_URL`

NextAuth con Credentials + JWT funciona automáticamente con subdominios
porque las cookies son **host-only** (sin `Domain` attribute), por lo
que cada subdominio tiene su sesión aislada.

Si configuras `NEXTAUTH_URL`, ponlo en el dominio raíz:
```
NEXTAUTH_URL=https://tudominio.cl
```
(Sirve solo para la generación de URLs absolutas internas.
No afecta las cookies por subdominio.)

---

## Compatibilidad con el modo path

**El modo path sigue funcionando aunque tengas dominio configurado**:
- `digital-dent-production.up.railway.app/c/digital-dent/login` → sigue activo.
- `tudominio.cl/c/digital-dent/login` → también funciona (alternativa).

Esto te permite migrar progresivamente: comunicar la nueva URL a cada
clínica, sin romper bookmarks viejos.

---

## Crear una clínica (super-admin)

En `super-admin.tudominio.cl/clinicas/nueva`:

1. Nombre y slug (ej: `cumbres`).
2. La plataforma genera automáticamente:
   - Usuario `Administrador` con clave `ADMIN22`.
   - Catálogo de prestaciones copiado de la plantilla.
3. Comparte con el cliente:
   - **URL final** (cuando tengas dominio): `https://cumbres.tudominio.cl/login`
   - **URL alternativa**: `https://digital-dent-production.up.railway.app/c/cumbres/login`
4. El Administrador entra con `Administrador` / `ADMIN22` y la plataforma
   lo fuerza a cambiar la contraseña en el primer login.

Las URLs son **copiables desde el panel** (listado y detalle de cada clínica).

---

## Checklist de DNS antes de migrar

- [ ] Dominio comprado y delegado al DNS provider.
- [ ] Registro `A` o `CNAME` para `@` apuntando a Railway.
- [ ] Registro `CNAME` para `www` apuntando a Railway.
- [ ] Registro `CNAME` wildcard `*` apuntando a Railway.
- [ ] Custom Domain agregado en Railway: raíz, `www`, wildcard.
- [ ] SSL emitido (Railway lo muestra "Active" en verde).
- [ ] Variable `PLATFORM_DOMAIN` en Railway, sin protocolo ni path.
- [ ] Servicio reiniciado.
- [ ] Probar `tudominio.cl` → landing.
- [ ] Probar `super-admin.tudominio.cl` → login super-admin.
- [ ] Probar `digital-dent.tudominio.cl/login` → login de la clínica.
- [ ] Probar entrar a 2 clínicas distintas en pestañas paralelas — deben
      mantener sesiones aisladas.
