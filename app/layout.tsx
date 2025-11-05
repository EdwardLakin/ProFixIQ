import "./globals.css";
import { Roboto, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// 🆕 Voice imports
import { VoiceProvider } from "@/features/shared/voice/VoiceProvider";
import VoiceButton from "@/features/shared/voice/VoiceButton";

// 🆕 Toasts
import { Toaster } from "react-hot-toast";

// 🆕 GLOBAL inspection portal (client component, safe to render here)
import GlobalInspectionPortal from "@/features/inspections/components/GlobalInspectionPortal";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="en" className={`${roboto.variable} ${blackOps.variable}`}>
      <body className="bg-black text-white">
        <Providers initialSession={session ?? null}>
          {/* Everything below is client land */}
          <VoiceProvider>
            <AppShell>
              {session?.user ? (
                <TabsBridge>
                  <main>{children}</main>
                </TabsBridge>
              ) : (
                <main>{children}</main>
              )}
            </AppShell>

            {/* global inspection modal lives once, here */}
            <GlobalInspectionPortal />

            {/* floating voice button */}
            <VoiceButton />
          </VoiceProvider>

          {/* global toast container */}
          <Toaster position="bottom-center" />
        </Providers>
      </body>
    </html>
  );
}