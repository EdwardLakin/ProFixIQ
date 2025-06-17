import '../public/output.css'; // Tailwind output with custom styles
import { ReactNode } from 'react';

export const metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered vehicle diagnostics and repair automation',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}