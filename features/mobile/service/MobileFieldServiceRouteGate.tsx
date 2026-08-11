"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

type FieldAccess = {
  canAccessFieldService?: boolean;
  canConfigure?: boolean;
};

export default function MobileFieldServiceRouteGate({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const response = await fetch("/api/mobile/field-service/access", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => null);
      const access = (await response?.json().catch(() => null)) as FieldAccess | null;
      if (!active) return;

      const setupRoute = pathname === "/mobile/service/setup";
      if (
        response?.ok &&
        (access?.canAccessFieldService || (setupRoute && access?.canConfigure))
      ) {
        setAllowed(true);
        return;
      }

      router.replace(setupRoute && access?.canConfigure ? "/mobile/service/setup" : "/mobile");
    })();

    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!allowed) {
    return (
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4">
        <div className="h-32 animate-pulse rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]" />
      </main>
    );
  }

  return children;
}
