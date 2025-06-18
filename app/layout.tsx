// app/layout.tsx
import '../public/output.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered diagnostics and workflow for pros and DIYers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-background text-white font-rubik min-h-screen">
        {children}
      </body>
    </html>
  );
}