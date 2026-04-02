//shared/components/nav/NavFromTiles.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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
  if (rolesOverride && rolesOverride.length > 0) {
    return (
      <RoleHubTiles
        roles={rolesOverride}
        scope={scope}
        heading={heading}
        description={description}
      />
    );
  }

  const supabase = createClientComponentClient<Database>();
  const [roles, setRoles] = useState<Role[]>([]);
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
          if (!cancelled) setRoles([]);
          return;
        }

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

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-2 text-3xl font-blackops tracking-[0.08em] text-[var(--accent-copper-light)]">
          {heading}
        </h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-white/10 bg-black/30 shadow-card backdrop-blur-xl"
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
    />
  );
}
