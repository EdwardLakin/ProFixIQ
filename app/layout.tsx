import './globals.css';
import type { Metadata } from 'next';
import Providers from './providers'; // 👈 new file

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
        <Providers>{children}</Providers> {/* Wrap children in provider */}
      </body>
    </html>
  );
}