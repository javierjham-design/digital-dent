# Cláriva · Servidor MCP

Permite que **Claude** (Desktop o Code) consulte, en modo **solo lectura**, los
leads del CRM y las estadísticas de tu clínica en Cláriva.

- **Solo lectura.** No crea ni modifica nada.
- **Acotado a tu clínica.** Se autentica con una API key propia; no ve datos de otras clínicas.
- La API key va hasheada en el servidor; se muestra **una sola vez** al generarla.

## Herramientas que expone

| Herramienta | Qué hace |
|---|---|
| `buscar_leads` | Lista leads con filtros (estado, origen, texto, fechas). |
| `ver_lead` | Detalle de un lead + tracking + notas. |
| `resumen_crm` | Embudo del CRM: totales por estado y por origen. |
| `estadisticas_plataforma` | Pacientes, citas (hoy / próximos 7 días) y leads. |
| `ingresos_por_campana` | ROI por campaña: nº leads, nº convertidos e **ingreso real cobrado** (cobros PAGADOS) atribuido a cada campaña, con detalle por paciente (total cobrado, valor del plan, fecha del primer cobro). Filtros `desde`/`hasta`. |
| `pagos_paciente` | Pagos y plan de un paciente por id: nº de cobros, total cobrado, valor del plan y fecha del primer cobro (enriquece `ver_lead`). |

## Requisitos

- Node.js 18 o superior.
- Una **API key** de tu clínica: Cláriva → **CRM · Leads → Configuración → "Acceso para Claude (MCP)" → Generar**. Cópiala (no se vuelve a mostrar).

## Instalación

```bash
cd mcp-server
npm install
```

## Configuración en Claude Desktop

Edita el archivo de configuración de Claude Desktop:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "clariva": {
      "command": "node",
      "args": ["C:\\ruta\\a\\dental-platform\\mcp-server\\src\\index.mjs"],
      "env": {
        "CLARIVA_BASE_URL": "https://TU-APP.up.railway.app/api/v1",
        "CLARIVA_API_KEY": "clv_XXXXXXXXXXXXXXXXXXXX"
      }
    }
  }
}
```

Reinicia Claude Desktop. Deberías ver las herramientas de `clariva` disponibles.

## Configuración en Claude Code

```bash
claude mcp add clariva -- node "C:\\ruta\\a\\dental-platform\\mcp-server\\src\\index.mjs"
```

Define `CLARIVA_BASE_URL` y `CLARIVA_API_KEY` en el entorno (o en el bloque `env`
de la config del MCP).

## Probar rápido

```bash
CLARIVA_BASE_URL="https://TU-APP.up.railway.app/api/v1" \
CLARIVA_API_KEY="clv_..." \
node src/index.mjs
```

Si arranca sin errores (imprime "Servidor MCP de Cláriva listo"), la key es válida.

## Seguridad

- La key da acceso de **lectura** a datos de pacientes/leads (incluye PII). Trátala como una contraseña.
- Si se filtra, **revócala/rota** desde la misma pantalla de Cláriva (invalida la anterior al instante).
- Preferí no compartir el archivo de config con la key en claro.
