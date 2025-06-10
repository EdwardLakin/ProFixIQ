import './globals.css'
import { Toaster } from 'react-hot-toast'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered repair assistant built for mechanics',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
        {children}
      </body>
    </html>
  )
}