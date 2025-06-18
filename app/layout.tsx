// app/layout.tsx
import './globals.css' // this will alias to src/styles.css or your Tailwind entrypoint
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered diagnostics and shop workflow automation',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground font-rubik">
        {children}
      </body>
    </html>
  )
}