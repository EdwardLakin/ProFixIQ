// app/layout.tsx

import './globals.css'
import type { Metadata } from 'next'
import { Black_Ops_One } from 'next/font/google'

const blackOpsOne = Black_Ops_One({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-blackopsone',
})

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered auto diagnostics and repair assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={blackOpsOne.variable}>
      <body className="bg-gradient-to-b from-black via-gray-900 to-black text-white font-sans min-h-screen">
        {children}
      </body>
    </html>
  )
}