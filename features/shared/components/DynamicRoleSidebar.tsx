"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import RoleNavAdmin from "@shared/components/RoleNavAdmin";
import RoleNavManager from "@shared/components/RoleNavManager";
import RoleNavTech from "@shared/components/RoleNavTech";
import RoleNavAdvisor from "@shared/components/RoleNavAdvisor";
import RoleNavOwner from "@shared/components/RoleNavOwner";
import RoleNavParts from "@shared/components/RoleNavParts";

// Staff-only roles (exclude "customer")
type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";

type Props = {
  role?: Role; // parent may pass a known role; if omitted, we fetch
};

// Narrow the raw DB role into our staff-only union
function normalizeRole(raw: string | null | undefined): Role | null {
  if (!raw) return null;
  if (
    raw === "owner" ||
    raw === "admin" ||
    raw === "manager" ||
    raw === "advisor" ||
    raw === "mechanic" ||
    raw === "parts"
  ) {
    return raw;
  }
  return null;
}

export default function DynamicRoleSidebar({ role }: Props): JSX.Element | null {
  const supabase = createClientComponentClient();
  const [detectedRole, setDetectedRole] = useState<Role | null>(null);

  // Prefer the explicit prop; otherwise fall back to a one-time fetch
  useEffect(() => {
    if (role) return; // parent provided role
    let mounted = true;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId || !mounted) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();

        if (!mounted) return;
        setDetectedRole(normalizeRole(profile?.role ?? null));
      } catch {
        if (mounted) setDetectedRole(null);
      }
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