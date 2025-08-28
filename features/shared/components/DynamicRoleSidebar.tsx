"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import RoleNavAdmin from "@shared/components/RoleNavAdmin";
import RoleNavTech from "@shared/components/RoleNavTech";
import RoleNavAdvisor from "@shared/components/RoleNavAdvisor";
import RoleNavOwner from "@shared/components/RoleNavOwner";
import RoleNavParts from "@shared/components/RoleNavParts";

type Props = {
  role?: string | null;
};

export default function DynamicRoleSidebar({ role }: Props) {
  const supabase = createClientComponentClient();

  const [detectedRole, setDetectedRole] = useState<string | null>(null);
  const effectiveRole = role ?? detectedRole;

  useEffect(() => {
    let mounted = true;
    if (role) return; // parent provided role, skip fetch

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId || !mounted) return;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();

        if (mounted && profile?.role) setDetectedRole(profile.role);
      } catch {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [role, supabase]);

  if (!effectiveRole) return null;

  switch (effectiveRole) {
    case "admin":
    case "manager":
      return <RoleNavAdmin />;
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