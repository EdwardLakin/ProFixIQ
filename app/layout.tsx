import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered vehicle diagnostics and repair automation',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-accent font-sans antialiased">
        {children}
      </body>
    </html>
  )
}