import { createApp } from '@/app'
import { env } from '@/config/env'

const app = createApp()

app.listen(env.port, () => {
  console.log(`[clariva-backend] escuchando en http://localhost:${env.port} (${env.nodeEnv})`)
})
