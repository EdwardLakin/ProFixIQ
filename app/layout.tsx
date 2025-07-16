import './globals.css';
import type { Metadata } from 'next';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered vehicle diagnostics and repair assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-header bg-background text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}