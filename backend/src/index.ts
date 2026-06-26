import { createApp } from '@/app'
import { env } from '@/config/env'
import { dedupePrestacionesTodasLasClinicas } from '@/lib/maintenance'

const app = createApp()

app.listen(env.port, () => {
  console.log(`[clariva-backend] escuchando en http://localhost:${env.port} (${env.nodeEnv})`)
  // Mantenimiento al arrancar (no bloquea): fusiona prestaciones duplicadas en
  // todas las clínicas. Se puede desactivar con DISABLE_STARTUP_MAINTENANCE=1.
  if (process.env.DISABLE_STARTUP_MAINTENANCE !== '1') {
    void dedupePrestacionesTodasLasClinicas()
  }
})
