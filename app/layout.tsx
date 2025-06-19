import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered vehicle diagnostics for pros and DIYers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-white font-rubik antialiased">
        {children}
      </body>
    </html>
  );
}