import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Digital-Dent | Sistema de Gestión Dental',
  description: 'Plataforma de gestión para clínica dental Digital-Dent Temuco',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
