// app/mobile/layout.tsx
"use client";

import { usePathname } from "next/navigation";

import { MobileShell } from "components/layout/MobileShell";
import TabsBridge from "@/features/shared/components/tabs/TabsBridge";
import { isStandalonePublicRoute } from "@/features/shared/lib/routes/shellBoundaries";

import "./mobile-command.css";
import "./mobile-command-overrides.css";
import "./mobile-route-surfaces.css";
import "./mobile-work-command.css";
import "./field-hub.css";

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/mobile";
  const shell = <MobileShell>{children}</MobileShell>;

  if (isStandalonePublicRoute(pathname)) {
    return shell;
  }

  return <TabsBridge>{shell}</TabsBridge>;
}
