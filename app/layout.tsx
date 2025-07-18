import './globals.css';
import type { Metadata } from 'next';
import Providers from './providers';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered vehicle diagnostics and repair assistant',
};

<Toaster position="top-center" />

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-header bg-background text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}