// app/layout.tsx
import "./globals.css";
import { Inter, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { VoiceProvider } from "@/features/shared/voice/VoiceProvider";

import { Toaster } from "sonner";

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
      <body
        className="
          min-h-screen
          bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_70%)]
          text-white
          antialiased
        "
      >
        <Providers initialSession={session ?? null}>
          <VoiceProvider>
            {/* AppShell decides whether to wrap content in TabsBridge */}
            <AppShell>{children}</AppShell>
          </VoiceProvider>

          {/* ✅ Global Sonner toaster (single source of truth) */}
          <Toaster
            position="bottom-center"
            theme="dark"
            richColors
            toastOptions={{
              style: {
                background:
                  "radial-gradient(circle at top, rgba(15,23,42,0.96), #020617 70%)",
                border: "1px solid rgba(148, 163, 184, 0.5)",
                color: "#e5e7eb",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}