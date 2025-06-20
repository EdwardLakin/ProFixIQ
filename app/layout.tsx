import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered vehicle diagnostics and repair assistant',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-header bg-background text-white">
        {children}
      </body>
    </html>
  );
}