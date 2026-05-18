import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Cláriva · Gestión dental multi-clínica',
  description: 'Plataforma SaaS de gestión para clínicas dentales — agenda, fichas, presupuestos, cobros y liquidaciones.',
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
