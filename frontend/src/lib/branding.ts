// Marca de la clínica en la pestaña del navegador: pone el logo de la clínica
// como favicon y su nombre en el título. Cada clínica ve su propio logo arriba
// en la pestaña. Si la clínica no tiene logo, se conserva el favicon por defecto.
export function aplicarBrandingClinica(opts: { nombre?: string | null; logoUrl?: string | null }): void {
  const nombre = opts.nombre?.trim()
  if (nombre) document.title = `${nombre} — Cláriva`

  const logoUrl = opts.logoUrl?.trim()
  if (!logoUrl) return

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }
  if (link.href !== logoUrl) link.href = logoUrl
}
