// Inicializa Sentry lo ANTES posible. Se importa como PRIMERA línea de index.ts
// para que quede activo antes de cargar el resto de la app. Sin SENTRY_DSN no hace
// nada (ver observability.ts).
import { initSentry } from '@/lib/observability'

initSentry()
