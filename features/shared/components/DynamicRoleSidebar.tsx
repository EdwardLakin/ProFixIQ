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

// Single source of truth for roles
type DbRole = Database["public"]["Enums"]["user_role_enum"];
type Props = { role?: DbRole };

export default function DynamicRoleSidebar({ role }: Props): JSX.Element | null {
  const supabase = createClientComponentClient<Database>();
  const [detectedRole, setDetectedRole] = useState<DbRole | null>(null);

  // if parent didn't provide a role, fetch once
  useEffect(() => {
    if (role) return;
    let mounted = true;

    (async () => {
      try {
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

        if (mounted) setDetectedRole((profile?.role as DbRole) ?? null);
      } catch {
        if (mounted) setDetectedRole(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [role, supabase]);

  const effectiveRole: DbRole | null = role ?? detectedRole;
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
      // Any role not in the staff set (e.g., if a future enum value appears)
      return null;
  }
}