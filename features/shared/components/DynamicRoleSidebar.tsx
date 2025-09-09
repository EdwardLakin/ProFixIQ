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

type Db = Database;
type DbRole = Db["public"]["Enums"]["user_role_enum"] | null | undefined;
type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";

export default function DynamicRoleSidebar({ role }: { role?: Role }): JSX.Element | null {
  const supabase = createClientComponentClient<Db>();
  const [detectedRole, setDetectedRole] = useState<Role | null>(null);

  useEffect(() => {
    if (role) return;

    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid || !mounted) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .maybeSingle();

      const r = profile?.role as DbRole;
      const narrowed: Role | null =
        r === "owner" || r === "admin" || r === "manager" || r === "advisor" || r === "mechanic" || r === "parts"
          ? (r as Role)
          : null;

      if (mounted) setDetectedRole(narrowed);
    })();

    return () => {
      mounted = false;
    };
  }, [role, supabase]);

  const effective = role ?? detectedRole;
  if (!effective) return null;

  switch (effective) {
    case "owner":
      return <RoleNavOwner />;
    case "admin":
      return <RoleNavAdmin />;
    case "manager":
      return <RoleNavManager />;
    case "advisor":
      return <RoleNavAdvisor />;
    case "mechanic":
      return <RoleNavTech />;
    case "parts":
      return <RoleNavParts />;
    default:
      return null;
  }
}