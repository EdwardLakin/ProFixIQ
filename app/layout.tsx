// app/layout.tsx
import "./globals.css";
import { Inter, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { VoiceProvider } from "@/features/shared/voice/VoiceProvider";
import VoiceButton from "@/features/shared/voice/VoiceButton";
import { Toaster } from "react-hot-toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
      className={`${inter.variable} ${blackOps.variable} dark`}
      suppressHydrationWarning
    >
      <body className="bg-background text-white">
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