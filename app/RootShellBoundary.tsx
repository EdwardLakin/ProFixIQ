"use client";

import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import Providers from "./providers";
import BrandThemeBoot from "@/features/branding/components/BrandThemeBoot";
import AppShell from "@/features/shared/components/AppShell";
import {
  isOutsideDesktopAppShell,
  isStandalonePublicRoute,
} from "@/features/shared/lib/routes/shellBoundaries";
import { VoiceProvider } from "@/features/shared/voice/VoiceProvider";

type RootShellBoundaryProps = {
  children: ReactNode;
  initialIdentity?: ComponentProps<typeof AppShell>["initialIdentity"];
  initialSession: Session | null;
};

/**
 * Keeps root chrome aligned with the live route when authentication crosses
 * from a standalone public page into the protected application.
 */
export default function RootShellBoundary({
  children,
  initialIdentity,
  initialSession,
}: RootShellBoundaryProps) {
  const pathname = usePathname() ?? "/";

  if (isStandalonePublicRoute(pathname)) {
    return (
      <VoiceProvider>
        <BrandThemeBoot />
        {children}
      </VoiceProvider>
    );
  }

  return (
    <Providers initialSession={initialSession}>
      <VoiceProvider>
        <BrandThemeBoot />
        <AppShell
          initialIdentity={initialIdentity}
          initialOutsideDesktopShell={isOutsideDesktopAppShell(pathname)}
        >
          {children}
        </AppShell>
      </VoiceProvider>
    </Providers>
  );
}
