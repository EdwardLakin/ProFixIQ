// app/layout.tsx
import "./globals.css";
import { Inter, Roboto, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// voice
import { VoiceProvider } from "@/features/shared/voice/VoiceProvider";
import VoiceButton from "@/features/shared/voice/VoiceButton";
// toast
import { Toaster } from "react-hot-toast";

// 🔹 new: main UI font
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// keep these for landing / hero
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
    <html
      lang="en"
      // 🔹 order matters: UI = inter, but we still expose roboto + blackops vars
      className={`${inter.variable} ${roboto.variable} ${blackOps.variable}`}
    >
      <body className="bg-black text-white">
        <Providers initialSession={session ?? null}>
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
            <VoiceButton />
          </VoiceProvider>
          <Toaster position="bottom-center" />
        </Providers>
      </body>
    </html>
  );
}