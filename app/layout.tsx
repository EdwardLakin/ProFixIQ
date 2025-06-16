// app/layout.tsx
import React from 'react';
import '../app/globals.css'; // ✅ Tailwind theme utilities: text-accent, shadow-card, etc.

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface text-black">{children}</body>
    </html>
  );
}