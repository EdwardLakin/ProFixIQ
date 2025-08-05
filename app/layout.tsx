// app/layout.tsx
import './globals.css';
import { Inter } from 'next/font/google';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import { cookies } from 'next/headers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'ProFixIQ',
  description: 'Auto diagnostics and inspections made easy',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shop = null;

  if (user) {
    const { data } = await supabase
      .from('shops')
      .select('name, address, city, province, postal_code, phone_number, email')
      .eq('id', user?.user_metadata?.shop_id || '')
      .single();

    shop = data;
  }

  return (
    <html lang="en">
      <body className={inter.className}>
        {/* You could also move this to a layout component if preferred */}
        {shop && (
          <div className="bg-gray-100 text-sm text-gray-800 p-2 border-b dark:bg-gray-900 dark:text-gray-300">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between gap-2">
              <div>
                <strong>{shop.name}</strong>
                <p>{shop.address}, {shop.city}, {shop.province} {shop.postal_code}</p>
              </div>
              <div>
                <p>📞 {shop.phone_number}</p>
                <p>✉️ {shop.email}</p>
              </div>
            </div>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}