// features/shared/components/DynamicRoleSidebar.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import RoleNavAdmin from "@shared/components/RoleNavAdmin";
import RoleNavManager from "@shared/components/RoleNavManager";
import RoleNavTech from "@shared/components/RoleNavTech";
import RoleNavAdvisor from "@shared/components/RoleNavAdvisor";
import RoleNavOwner from "@shared/components/RoleNavOwner";
import RoleNavParts from "@shared/components/RoleNavParts";

type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts" | null;

type Props = {
  role?: Role;
};

export default function DynamicRoleSidebar({ role }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [detectedRole, setDetectedRole] = useState<Role>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const effectiveRole: Role = role ?? detectedRole;

  useEffect(() => {
    let mounted = true;
    if (role) return; // parent provided role, skip fetch

    (async () => {
      try {
        setLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id ?? null;
        if (!mounted || !userId) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (mounted) setDetectedRole((profile?.role as Role) ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [role, supabase]);

  if (loading && !effectiveRole) {
    // Optional: subtle placeholder to prevent layout shift
    return <div className="text-sm text-neutral-400">Loading…</div>;
  }

  if (!effectiveRole) return null;

  switch (effectiveRole) {
    case "admin":
      return <RoleNavAdmin />;
    case "manager":
      return <RoleNavManager />;
    case "mechanic":
      return <RoleNavTech />;
    case "advisor":
      return <RoleNavAdvisor />;
    case "owner":
      return <RoleNavOwner />;
    case "parts":
      return <RoleNavParts />;
    default:
      return null;
  }
}