import './globals.css';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import React from 'react';

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get: (key) => cookieStore.get(key)?.value ?? '',
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = cookieStore.get('next-url')?.value || '/';

  if (user && path !== '/login') {
    return <meta httpEquiv="refresh" content="0;url=/login" />;
  }

  return (
    <html lang="en">
      <body className="bg-surface text-accent">{children}</body>
    </html>
  );
}