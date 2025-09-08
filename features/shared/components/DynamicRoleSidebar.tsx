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

// Staff-only roles (exclude "customer")
type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";
type DbRole = Database["public"]["Enums"]["user_role_enum"] | null | undefined;

export type DynamicRoleSidebarProps = {
  /** If provided, we won't fetch the role from Supabase */
  role?: Role;
};

function normalizeRole(raw: DbRole): Role | null {
  switch (raw) {
    case "owner":
    case "admin":
    case "manager":
    case "advisor":
    case "mechanic":
    case "parts":
      return raw;
    default:
      return null;
  }
}

export default function DynamicRoleSidebar({ role }: DynamicRoleSidebarProps): JSX.Element | null {
  const supabase = createClientComponentClient<Database>();
  const [detectedRole, setDetectedRole] = useState<Role | null>(null);

  // If no prop provided, fetch once from Supabase
  useEffect(() => {
    if (role) return;

    let mounted = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || !mounted) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      if (mounted) setDetectedRole(normalizeRole(profile?.role));
    })();

    return () => {
      mounted = false;
    };
  }, [role, supabase]);

  const effectiveRole: Role | null = role ?? detectedRole;
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