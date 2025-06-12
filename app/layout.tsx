import '../src/app/globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered repair assistant',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-accent">{children}</body>
    </html>
  );
}