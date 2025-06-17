// app/layout.tsx
import './globals.css';
import { Inter } from 'next/font/google';
import { ReactNode } from 'react';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import Header from '@/src/components/ui/Header';
import Footer from '@/src/components/ui/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'ProFixIQ',
  description: 'AI-powered automotive diagnostics and inspections',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabase = createServerClient({ cookies });
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  return (
    <html lang="en" className="bg-surface text-white">
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <Header user={user} />
        <main className="flex-grow container mx-auto px-4 py-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}