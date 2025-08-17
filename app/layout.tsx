// app/layout.tsx
import "./globals.css";
import { Inter, Black_Ops_One } from "next/font/google";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const blackOps = Black_Ops_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackops",
});

export const metadata: Metadata = {
  title: "ProFixIQ",
  description:
    "AI-powered diagnostics, inspections, and work order automation for pros and DIYers.",
  themeColor: "#ff6a00",
  openGraph: {
    title: "ProFixIQ",
    description:
      "AI-powered diagnostics, inspections, and work order automation for pros and DIYers.",
    type: "website",
    url: "https://profixiq.com",
    images: [{ url: "https://profixiq.com/og-image.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ProFixIQ",
    description: "Streamline repairs with AI diagnostics and smart shop tools.",
    images: ["https://profixiq.com/og-image.jpg"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerComponentClient<Database>({
    cookies: () => cookies(),
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shop:
    | {
        name: string | null;
        address: string | null;
        city: string | null;
        province: string | null;
        postal_code: string | null;
        phone_number: string | null;
        email: string | null;
      }
    | null = null;

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
      {/* Apply both font variables + Inter class for sane defaults */}
      <body className={`${inter.variable} ${blackOps.variable} ${inter.className}`}>
        {/* GLOBAL NAVBAR (separate from hero title) */}
        <header className="fixed top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur border-b border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
            <Link
              href="/"
              className="font-blackops text-orange-400 tracking-wide"
            >
              ProFixIQ
            </Link>
            <nav className="hidden sm:flex gap-4 text-sm text-gray-300">
              <Link href="/" className="hover:text-orange-400 transition-colors">
                Home
              </Link>
              <Link
                href="/subscribe"
                className="hover:text-orange-400 transition-colors"
              >
                Plans
              </Link>
              <Link
                href="/dashboard"
                className="hover:text-orange-400 transition-colors"
              >
                Dashboard
              </Link>
              <a
                href="mailto:support@profixiq.com"
                className="hover:text-orange-400 transition-colors"
              >
                Support
              </a>
            </nav>
          </div>
        </header>

        {/* Push all pages below the fixed header */}
        <main className="pt-16">
          {/* Optional shop banner for signed-in users */}
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