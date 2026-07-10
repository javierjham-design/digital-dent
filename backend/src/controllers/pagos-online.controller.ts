import type { Request, Response } from 'express'
import { tenantDb, tenantDbPorSlug } from '@/middlewares/tenant'
import { apiBaseDe as apiBase, appBaseDe as appBase } from '@/lib/req-url'
import * as svc from '@/services/pagos-online.service'

export async function getConfig(req: Request, res: Response) {
  res.json(await svc.obtenerConfigPagos(tenantDb(req)))
}
export async function patchConfig(req: Request, res: Response) {
  res.json(await svc.guardarConfigPagos(tenantDb(req), req.body ?? {}))
}

export async function postLinkParaCobro(req: Request, res: Response) {
  const r = await svc.crearLinkParaCobro(tenantDb(req), req.params.id, {
    apiBase: apiBase(req), appBase: appBase(req), slug: req.clinica?.slug ?? '', creadoPorId: req.auth?.sub,
  })
  res.json(r)
}
export async function getPagosDeCobro(req: Request, res: Response) {
  res.json(await svc.listarPagosDeCobro(tenantDb(req), req.params.id))
}

// Webhook público de Flow: llega por slug de la clínica. Flow envía `token` como
// form-urlencoded y espera 200. Respondemos ok salvo error irrecuperable.
export async function postWebhookFlow(req: Request, res: Response) {
  try {
    const db = await tenantDbPorSlug(req.params.slug)
    const token = String((req.body ?? {}).token ?? req.query.token ?? '')
    if (db) await svc.procesarWebhookFlow(db, token)
  } catch { /* Flow reintenta; no exponemos el error */ }
  res.status(200).send('ok')
}

// Página de RETORNO de Flow (a donde vuelve el navegador del paciente al terminar).
// Flow la invoca por POST, por eso debe vivir en el backend (el SPA no acepta POST).
// La confirmación real del pago la hace el webhook; esta pantalla es solo UX.
export async function retornoFlow(req: Request, res: Response) {
  const slug = req.params.slug
  let nombre = 'la clínica'
  try {
    const db = await tenantDbPorSlug(slug)
    if (db) {
      const cfg = await db.configuracion.findUnique({ where: { id: 'singleton' }, select: { nombre: true } })
      if (cfg?.nombre) nombre = cfg.nombre
    }
  } catch { /* best-effort */ }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  res.status(200).type('html').send(`<!doctype html><html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pago recibido</title></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:460px;margin:12vh auto 0;padding:0 20px;text-align:center">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:32px 24px">
      <div style="width:64px;height:64px;border-radius:9999px;background:#dcfce7;color:#16a34a;font-size:34px;line-height:64px;margin:0 auto 12px">✓</div>
      <h1 style="font-size:20px;margin:0 0 6px">¡Gracias! Recibimos tu pago</h1>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 4px">Tu pago en <strong>${esc(nombre)}</strong> se está procesando y quedará confirmado en unos instantes.</p>
      <p style="color:#94a3b8;font-size:13px;margin:14px 0 0">Ya puedes cerrar esta ventana.</p>
    </div>
    <p style="color:#94a3b8;font-size:11px;margin-top:14px">Procesado de forma segura · vía Cláriva</p>
  </div>
</body></html>`)
}
