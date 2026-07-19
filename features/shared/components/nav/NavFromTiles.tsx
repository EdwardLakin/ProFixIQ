//shared/components/nav/NavFromTiles.tsx
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import RoleHubTiles from "@/features/shared/components/RoleHubTiles/RoleHubTiles";
import type { Role, Scope } from "@/features/shared/components/RoleHubTiles/tiles";

export default function NavFromTiles({
  scope = "all",
  heading = "Navigation",
  description,
  rolesOverride,
}: {
  scope?: Scope | "all";
  heading?: string;
  description?: string;
  rolesOverride?: Role[];
}) {
  const supabase = createBrowserSupabase();
  const [roles, setRoles] = useState<Role[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setRoles([]);
            setUserEmail(null);
          }
          return;
        }

        if (!cancelled) setUserEmail(user.email ?? null);

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        const r = profile?.role as Role | undefined;
        if (!cancelled) setRoles(r ? [r] : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);


  if (rolesOverride && rolesOverride.length > 0) {
    return (
      <RoleHubTiles
        roles={rolesOverride}
        scope={scope}
        heading={heading}
        description={description}
        userEmail={userEmail}
      />
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[1800px] px-3 py-4 sm:px-5 lg:px-6">
        <h1 className="mb-2 text-3xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
          {heading}
        </h1>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-card backdrop-blur-xl"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <RoleHubTiles
      roles={roles}
      scope={scope}
      heading={heading}
      description={description}
      userEmail={userEmail}
    />
  );
}
