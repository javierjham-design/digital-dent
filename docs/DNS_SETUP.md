# DNS y dominios — Plataforma multi-tenant

Esta plataforma soporta dos modos de acceso por clínica:

1. **Por subdominio** (modo final, cuando exista un dominio propio).
   `cumbres.tudominio.cl`, `everest.tudominio.cl`, etc.
2. **Por path** (modo fallback, sin DNS configurado).
   `https://digital-dent-production.up.railway.app/c/cumbres/login`

Ambos modos conviven: el modo subdominio se activa **sólo si la variable de entorno `PLATFORM_DOMAIN` está definida** en Railway. Si no, todo funciona por path.

---

## 1. Modo path (activo hoy)

No requiere DNS. Cada clínica recibe una URL como:

```
https://<host-railway>/c/<slug>/login
```

El middleware (`proxy.ts`) detecta el segmento `/c/<slug>/`, hace rewrite interno a la ruta real (`/login`, `/`, etc.) e inyecta el header `x-clinica-slug` para que el login sepa contra qué clínica autenticar.

**Ventaja:** funciona sin tocar DNS.
**Desventaja:** la URL no es bonita ni "white-label".

Usuario y contraseña por defecto de cada clínica nueva:

- **Usuario:** `Administrador`
- **Contraseña:** `ADMIN22` (debe cambiarse en el primer login)

---

## 2. Modo subdominio (cuando tengas un dominio)

### Paso 1 — Comprar dominio

Cualquier registrador (NIC.cl, Namecheap, Cloudflare, etc.). Recomendado: **Cloudflare** por DNS rápido y SSL gratuito wildcard.

### Paso 2 — Apuntar el dominio a Railway

En Railway → Project → tu servicio → **Settings → Networking → Custom Domain**.

Añade dos dominios:

| Dominio                  | Tipo  | Para qué sirve                                    |
| ------------------------ | ----- | ------------------------------------------------- |
| `tudominio.cl`           | A/CNAME | Página raíz (puede redirigir a página comercial) |
| `*.tudominio.cl`         | CNAME wildcard | Todas las clínicas (cumbres, everest, ...)|

Railway te dará el destino CNAME que apunta a su edge (algo como `xxx.up.railway.app`). Configura ambos registros en tu DNS:

```
Tipo   Nombre        Valor                          TTL
CNAME  @             <host>.up.railway.app         3600  (o A record si tu DNS no permite CNAME en root)
CNAME  *             <host>.up.railway.app         3600
```

Railway emite **SSL automático** para el dominio raíz y para cada subdominio que reciba tráfico (vía Let's Encrypt + ALPN/HTTP-01). El wildcard no necesita certificado wildcard explícito: cada subdominio nuevo obtiene su propio cert al primer request.

### Paso 3 — Configurar `PLATFORM_DOMAIN`

En Railway → tu servicio → **Variables**:

```
PLATFORM_DOMAIN=tudominio.cl
```

(Sin `www.`, sin `https://`, sin path. Sólo el dominio raíz.)

Reinicia el servicio.

A partir de ese momento:
- `cumbres.tudominio.cl` → middleware detecta `cumbres` y lo trata como tenant.
- `tudominio.cl` → trata como raíz (puede mostrar landing).
- El modo path `/c/<slug>/...` sigue funcionando como respaldo.

### Paso 4 — `NEXTAUTH_URL`

Si la app sigue accediéndose principalmente por `digital-dent-production.up.railway.app`, deja `NEXTAUTH_URL` apuntando ahí. Cuando migres todo el tráfico al dominio propio, actualízalo a `https://tudominio.cl` para que los callbacks de NextAuth funcionen correctamente.

> Importante: NextAuth con cookies de sesión funciona **por dominio**. Si un usuario inicia sesión en `cumbres.tudominio.cl`, su cookie queda en `cumbres.tudominio.cl` y NO se comparte con `everest.tudominio.cl`. Eso es lo deseado: cada clínica tiene su propia sesión.

---

## 3. Crear una clínica nueva

Como super-admin (`/digital-dent-super-admin/clinicas/nueva`):

1. Llena el nombre y el slug (ej. `cumbres`).
2. Al crear, la plataforma genera automáticamente:
   - Usuario `Administrador` con clave `ADMIN22`.
   - Catálogo de prestaciones copiado desde la plantilla.
3. Entrega al cliente la URL correspondiente:
   - **Con dominio:** `https://cumbres.tudominio.cl/login`
   - **Sin dominio:** `https://digital-dent-production.up.railway.app/c/cumbres/login`
4. El Administrador entra con `Administrador` / `ADMIN22` y la plataforma lo **forzará a cambiar la contraseña** antes de continuar (página `/cambiar-password`).

---

## 4. Migración de path → subdominio

Cuando cambies de modo path a modo subdominio:

- Las URLs antiguas `/c/<slug>/...` **siguen funcionando** (el middleware mantiene ambos modos).
- Comunica a cada clínica la nueva URL bonita.
- No se requiere migración de datos ni de sesiones — sólo cambiar el bookmark.

---

## 5. Checklist de DNS antes de migrar

- [ ] Dominio comprado y delegado a tu DNS provider.
- [ ] Registro A o CNAME para `@` (raíz) apuntando a Railway.
- [ ] Registro CNAME wildcard `*` apuntando a Railway.
- [ ] Custom Domain agregado en Railway (raíz y wildcard).
- [ ] SSL emitido (Railway lo muestra en verde "Active").
- [ ] Variable `PLATFORM_DOMAIN` añadida y servicio reiniciado.
- [ ] Probar `tudominio.cl` → carga.
- [ ] Probar `digital-dent.tudominio.cl/login` → carga login de la clínica.
- [ ] Login funciona, JWT se emite, sesión persiste.
- [ ] Probar `cualquier-otra.tudominio.cl/login` → muestra "Clínica no encontrada" si no existe el slug.
