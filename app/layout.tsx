// app/layout.tsx
import "./globals.css";
import { Roboto, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// Fonts: body → Roboto, headers/buttons → Black Ops One
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});
const blackOps = Black_Ops_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-blackops",
  display: "swap",
});

export const metadata = {
  title: "ProFixIQ",
  description: "Tech tools for modern shops",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-side session check (no flash of tabs for signed-out users)
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="en" className={`${roboto.variable} ${blackOps.variable}`}>
      <body className="bg-black text-white">
        <Providers>
          <AppShell>
            {session?.user ? (
              <TabsBridge>
                <main>{children}</main>
              </TabsBridge>
            ) : (
              <main>{children}</main>
            )}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}