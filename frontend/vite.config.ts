import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // En dev, /api se redirige al backend Express para evitar CORS.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    // Code-split: separa vendors grandes en chunks propios para que el bundle
    // principal sea liviano y se cacheen aparte (cambian poco entre deploys).
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          fullcalendar: [
            '@fullcalendar/core', '@fullcalendar/react',
            '@fullcalendar/daygrid', '@fullcalendar/timegrid', '@fullcalendar/interaction',
          ],
        },
      },
    },
  },
})
