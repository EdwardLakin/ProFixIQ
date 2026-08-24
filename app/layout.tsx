import "./globals.css";
import "./light-mode-contrast.css";
import { Inter, Black_Ops_One } from "next/font/google";
import Script from "next/script";
import { headers } from "next/headers";
import { createServerSupabaseRSC } from "@/features/shared/lib/supabase/server";
import { getDashboardIdentity } from "@/features/dashboard/server/dashboard-shell-data";
import PwaRuntime from "@/features/shared/components/pwa/PwaRuntime";
import RootShellBoundary from "./RootShellBoundary";
import type { Metadata, Viewport } from "next";

import ThemedToaster from "@/features/shared/components/ThemedToaster";
import { isStandalonePublicRoute } from "@/features/shared/lib/routes/shellBoundaries";
import { isFleetProductHostname } from "@/features/fleet/lib/fleetProductRouting";

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
  appleWebApp: {
    capable: true,
    title: "ProFixIQ",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/pwa-icons/icon-192", sizes: "192x192", type: "image/png" },
      { url: "/pwa-icons/icon-512", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/pwa-icons/apple-touch-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0D172A",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hdrs = await headers();
  const pathname = hdrs.get("x-next-pathname") ?? "";
  const isFleetProductHost =
    hdrs.get("x-profixiq-product-host") === "fleet" ||
    isFleetProductHostname(hdrs.get("x-forwarded-host") ?? hdrs.get("host"));

  const shouldPreloadAppShell = !isStandalonePublicRoute(pathname);

  const [session, dashboardIdentity] = shouldPreloadAppShell
    ? await Promise.all([
        createServerSupabaseRSC()
          .auth.getSession()
          .then((result) => result.data.session),
        getDashboardIdentity(),
      ])
    : [null, null];

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
          backgroundImage: "var(--theme-gradient-panel)",
        }}
      >
        <RootShellBoundary
          initialIdentity={dashboardIdentity}
          initialSession={session}
        >
          {children}
        </RootShellBoundary>

        {isFleetProductHost ? null : <PwaRuntime />}
        <ThemedToaster />
      </body>
    </html>
  );
}
