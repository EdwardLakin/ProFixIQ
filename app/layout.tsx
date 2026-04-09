import "./globals.css";
import { Inter, Black_Ops_One } from "next/font/google";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { VoiceProvider } from "@/features/shared/voice/VoiceProvider";
import BrandThemeBoot from "@/features/branding/components/BrandThemeBoot";

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
        className="min-h-screen text-white antialiased"
        style={{
          backgroundImage:
            "var(--app-shell-bg, radial-gradient(circle at top, rgba(249,115,22,0.18), transparent 55%), radial-gradient(circle at bottom, rgba(15,23,42,0.96), #020617 70%))",
        }}
      >
        <Providers initialSession={session ?? null}>
          <VoiceProvider>
            <BrandThemeBoot />
            <AppShell>{children}</AppShell>
          </VoiceProvider>

          <Toaster
            position="bottom-center"
            theme="dark"
            richColors
            toastOptions={{
              style: {
                background:
                  "var(--theme-header-bg, radial-gradient(circle at top, rgba(15,23,42,0.96), #020617 70%))",
                border: "1px solid var(--theme-card-border, rgba(148, 163, 184, 0.5))",
                color: "var(--theme-text-primary, #e5e7eb)",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
