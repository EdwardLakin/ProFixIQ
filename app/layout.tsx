import "./globals.css";
import { Inter, Black_Ops_One } from "next/font/google";
import Script from "next/script";
import Providers from "./providers";
import AppShell from "@/features/shared/components/AppShell";
import { headers } from "next/headers";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getDashboardIdentity } from "@/features/dashboard/server/dashboard-shell-data";
import { VoiceProvider } from "@/features/shared/voice/VoiceProvider";
import BrandThemeBoot from "@/features/branding/components/BrandThemeBoot";
import PwaRuntime from "@/features/shared/components/pwa/PwaRuntime";
import type { Metadata, Viewport } from "next";

import ThemedToaster from "@/features/shared/components/ThemedToaster";

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

export const metadata: Metadata = {
  title: "ProFixIQ | The operating system for modern repair shops",
  description:
    "Voice inspections, technician-built repairs, approvals, parts workflows, workforce operations, and fleet transparency—connected in one repair shop operating system.",
  applicationName: "ProFixIQ",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ProFixIQ", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1729",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-next-pathname") ?? "";

  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/launch") ||
    pathname.startsWith("/offline") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/mobile/sign-in") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/auth/reset") ||
    pathname.startsWith("/auth/set-password") ||
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/compare-plans") ||
    pathname.startsWith("/subscribe") ||
    pathname.startsWith("/demo") ||
    pathname.startsWith("/portal/auth/") ||
    pathname.startsWith("/portal/join/") ||
    pathname.startsWith("/portal/confirm");

  const useAppShell = !isPublicRoute;

  const [session, dashboardIdentity] = useAppShell
    ? await Promise.all([
        createServerSupabaseRSC()
          .auth.getSession()
          .then((result) => result.data.session),
        getDashboardIdentity(),
      ])
    : [null, null];

  const appContent = (
    <VoiceProvider>
      <BrandThemeBoot />
      {useAppShell ? (
        <AppShell initialIdentity={dashboardIdentity}>{children}</AppShell>
      ) : (
        children
      )}
    </VoiceProvider>
  );

  return (
    <html
      lang="en"
      className={`${inter.variable} ${blackOps.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script id="pfq-theme-preload" strategy="beforeInteractive">
          {`(function(){try{var r=document.documentElement;var pref=localStorage.getItem('pfq-theme-mode')||localStorage.getItem('theme')||'system';if(pref!=='light'&&pref!=='dark'&&pref!=='system'){pref='system';}var resolved=pref==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):pref;r.setAttribute('data-theme-preference',pref);r.setAttribute('data-theme-mode',resolved);r.classList.toggle('dark',resolved==='dark');r.style.colorScheme=resolved;}catch(_e){}})();`}
        </Script>
      </head>
      <body
        className="min-h-screen antialiased"
        style={{
          backgroundImage:
            "var(--theme-gradient-panel)",
        }}
      >
        {useAppShell ? (
          <Providers initialSession={session}>{appContent}</Providers>
        ) : (
          appContent
        )}

        <PwaRuntime />
        <ThemedToaster />
      </body>
    </html>
  );
}
