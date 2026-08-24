"use client";

import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import Providers from "./providers";
import BrandThemeBoot from "@/features/branding/components/BrandThemeBoot";
import { toFleetInternalPath } from "@/features/fleet/lib/fleetProductRouting";
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
  productHost?: "fleet" | "ops" | null;
};

function resolveShellPathname(
  pathname: string,
  productHost: RootShellBoundaryProps["productHost"],
): string {
  if (productHost === "fleet") {
    return toFleetInternalPath(pathname) ?? pathname;
  }

  if (
    productHost === "ops" &&
    (pathname === "/" || pathname === "/ops" || pathname === "/ops/")
  ) {
    return "/ops";
  }

  return pathname;
}

/**
 * Keeps root chrome aligned with the live route when authentication crosses
 * from a standalone public page into the protected application.
 */
export default function RootShellBoundary({
  children,
  initialIdentity,
  initialSession,
  productHost = null,
}: RootShellBoundaryProps) {
  const pathname = usePathname() ?? "/";
  const shellPathname = resolveShellPathname(pathname, productHost);

  if (isStandalonePublicRoute(shellPathname)) {
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
          initialOutsideDesktopShell={isOutsideDesktopAppShell(shellPathname)}
        >
          {children}
        </AppShell>
      </VoiceProvider>
    </Providers>
  );
}
