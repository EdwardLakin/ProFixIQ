import "./globals.css";
import "./light-mode-contrast.css";
import { Inter, Black_Ops_One } from "next/font/google";
import Script from "next/script";
import { headers } from "next/headers";
import { resolveRootShellContext } from "@/features/dashboard/server/root-shell-context";
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

const siteDescription =
  "Heavy-duty and automotive repair shop software for voice inspections, technician-built repairs, parts workflows, approvals, field service, and fleet maintenance.";

export const metadata: Metadata = {
  metadataBase: new URL("https://profixiq.com"),
  title: {
    default: "ProFixIQ | Heavy-Duty & Automotive Repair Shop Software",
    template: "%s | ProFixIQ",
  },
  description: siteDescription,
  applicationName: "ProFixIQ",
  openGraph: {
    type: "website",
    siteName: "ProFixIQ",
    title: "ProFixIQ | Heavy-Duty & Automotive Repair Shop Software",
    description: siteDescription,
    url: "https://profixiq.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "ProFixIQ | Heavy-Duty & Automotive Repair Shop Software",
    description: siteDescription,
  },
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
  const productHostHeader = hdrs.get("x-profixiq-product-host");
  const isFleetProductHost =
    productHostHeader === "fleet" ||
    isFleetProductHostname(hdrs.get("x-forwarded-host") ?? hdrs.get("host"));
  const productHost = isFleetProductHost
    ? "fleet"
    : productHostHeader === "ops"
      ? "ops"
      : null;

  const shouldPreloadAppShell = !isStandalonePublicRoute(pathname);

  const rootShellContext = shouldPreloadAppShell
    ? await resolveRootShellContext()
    : null;
  const session = rootShellContext?.session ?? null;
  const dashboardIdentity = rootShellContext?.dashboardIdentity ?? null;

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
          productHost={productHost}
        >
          {children}
        </RootShellBoundary>

        {isFleetProductHost ? null : <PwaRuntime />}
        <ThemedToaster />
      </body>
    </html>
  );
}
