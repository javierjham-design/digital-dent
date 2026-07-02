#!/usr/bin/env node
// Servidor MCP de Cláriva. Expone a Claude (Desktop / Code) herramientas
// READ-ONLY para consultar los leads del CRM y estadísticas de la clínica.
// Se autentica con una API key por clínica (X-API-Key) contra el backend de
// Cláriva. No expone datos de otras clínicas ni permite escritura.
//
// Variables de entorno requeridas:
//   CLARIVA_BASE_URL  ej: https://tu-app.up.railway.app/api/v1
//   CLARIVA_API_KEY   la key generada en CRM → Configuración → "Acceso para Claude (MCP)"

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE = (process.env.CLARIVA_BASE_URL || '').replace(/\/+$/, '')
const KEY = process.env.CLARIVA_API_KEY || ''

if (!BASE || !KEY) {
  console.error('[clariva-mcp] Faltan CLARIVA_BASE_URL y/o CLARIVA_API_KEY en el entorno.')
  process.exit(1)
}

async function api(path, params) {
  const url = new URL(`${BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url, { headers: { 'X-API-Key': KEY, Accept: 'application/json' } })
  const text = await res.text()
  if (!res.ok) throw new Error(`Cláriva respondió ${res.status}: ${text.slice(0, 400)}`)
  return text
}

const asText = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] })

const server = new McpServer({ name: 'clariva', version: '1.0.0' })

server.tool(
  'buscar_leads',
  'Busca leads/prospectos del CRM de la clínica. Filtros opcionales por estado, origen, texto (nombre/teléfono/email/campaña) y rango de fechas. Devuelve hasta 500.',
  {
    estado: z.enum(['NUEVO', 'CONTACTADO', 'AGENDADO', 'CONVERTIDO', 'PERDIDO']).optional(),
    origen: z.string().optional().describe('FORMULARIO | META | INSTAGRAM | AGENDA_ONLINE | MANUAL | OTRO'),
    q: z.string().optional().describe('texto libre: nombre, teléfono, email o campaña'),
    desde: z.string().optional().describe('fecha inicio YYYY-MM-DD'),
    hasta: z.string().optional().describe('fecha fin YYYY-MM-DD'),
  },
  async (args) => asText(await api('/ext/leads', args)),
)

server.tool(
  'ver_lead',
  'Devuelve el detalle completo de un lead por su id, incluyendo tracking (UTM, click-ids), estado del embudo y el historial de notas.',
  { id: z.string().describe('id del lead') },
  async ({ id }) => asText(await api(`/ext/leads/${encodeURIComponent(id)}`)),
)

server.tool(
  'resumen_crm',
  'Resumen del embudo del CRM: total de leads y cantidades por estado y por origen.',
  {},
  async () => asText(await api('/ext/resumen')),
)

server.tool(
  'estadisticas_plataforma',
  'Estadísticas generales de la clínica: pacientes (total/activos), citas (hoy y próximos 7 días) y leads (por estado y origen).',
  {},
  async () => asText(await api('/ext/stats')),
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[clariva-mcp] Servidor MCP de Cláriva listo (read-only).')
