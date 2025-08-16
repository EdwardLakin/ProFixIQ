// app/layout.tsx
import "./globals.css";
import { Inter } from "next/font/google";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

import type { Database } from "@shared/types/types/supabase";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "ProFixIQ",
  description: "Auto diagnostics and inspections made easy",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerComponentClient<Database>({
    cookies: () => cookies(), // keep SSR-safe cookie access
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shop: {
    name: string | null;
    address: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    phone_number: string | null;
    email: string | null;
  } | null = null;

  if (user) {
    const { data } = await supabase
      .from("shops")
      .select(
        "name, address, city, province, postal_code, phone_number, email",
      )
      .eq("id", user?.user_metadata?.shop_id || "")
      .single();

    shop = data ?? null;
  }

  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Global site header: fixed + high z-index (sits above hero effects) */}
        <header className="fixed top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <div className="font-blackops text-orange-400 text-lg tracking-wide">
              ProFixIQ
            </div>
            <nav className="hidden sm:flex gap-4 text-sm text-gray-300">
              <a href="/" className="hover:text-orange-400 transition-colors">
                Home
              </a>
              <a
                href="/subscribe"
                className="hover:text-orange-400 transition-colors"
              >
                Plans
              </a>
              <a
                href="/dashboard"
                className="hover:text-orange-400 transition-colors"
              >
                Dashboard
              </a>
              <a
                href="mailto:support@profixiq.com"
                className="hover:text-orange-400 transition-colors"
              >
                Support
              </a>
            </nav>
          </div>
        </header>

        {/* Push page content below the fixed header */}
        <main className="pt-16">
          {/* Optional shop banner (z-20 keeps it above background too) */}
          {shop && (
            <div className="z-20 bg-gray-100 text-sm text-gray-800 p-2 border-b dark:bg-gray-900 dark:text-gray-300">
              <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between gap-2">
                <div>
                  <strong>{shop.name}</strong>
                  <p>
                    {shop.address}, {shop.city}, {shop.province}{" "}
                    {shop.postal_code}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p>📞 {shop.phone_number}</p>
                  <p>✉️ {shop.email}</p>
                </div>
              </div>
            </div>
          )}

          {children}
        </main>
      </body>
    </html>
  );
}