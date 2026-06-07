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
  const hdrs = await headers();
  const pathname = hdrs.get("x-next-pathname") ?? "";

  const isPublicRoute =
    pathname === "/" ||
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
          {`(function(){try{var r=document.documentElement;var pref=localStorage.getItem('pfq-theme-mode')||'dark';var resolved=pref==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):pref;if(resolved!=='light'&&resolved!=='dark'){resolved='dark';}r.setAttribute('data-theme-preference',pref);r.setAttribute('data-theme-mode',resolved);}catch(_e){}})();`}
        </Script>
      </head>
      <body
        className="min-h-screen antialiased"
        style={{
          backgroundImage:
            "var(--app-shell-bg, radial-gradient(circle at top, rgba(59,130,246,0.12), transparent 56%), radial-gradient(circle at bottom, rgba(15,23,42,0.96), #020617 70%))",
        }}
      >
        {useAppShell ? (
          <Providers initialSession={session}>{appContent}</Providers>
        ) : (
          appContent
        )}

        <Toaster
          position="bottom-center"
          theme="dark"
          richColors
          toastOptions={{
            style: {
              background:
                "var(--theme-header-bg, radial-gradient(circle at top, rgba(15,23,42,0.96), #020617 70%))",
              border:
                "1px solid var(--theme-card-border, rgba(148, 163, 184, 0.5))",
              color: "var(--theme-text-primary, #e5e7eb)",
            },
          }}
        />
      </body>
    </html>
  );
}
