import React from 'react';
import '../public/output.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface text-accent">{children}</body>
    </html>
  );
}