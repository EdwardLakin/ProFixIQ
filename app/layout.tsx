// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { Black_Ops_One } from 'next/font/google'

const blackOpsOne = Black_Ops_One({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-blackops',
})

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered vehicle diagnostics and repair assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body
        className={`${blackOpsOne.variable} font-sans bg-gradient-to-b from-gray-900 via-black to-gray-900 text-white min-h-screen`}
      >
        {children}
      </body>
    </html>
  )
}