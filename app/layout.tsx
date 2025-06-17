// app/layout.tsx

import '../public/output.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered diagnostics and repair assistant for vehicles',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Rubik:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}