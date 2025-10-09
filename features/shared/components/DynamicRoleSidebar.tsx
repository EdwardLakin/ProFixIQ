// features/shared/components/DynamicRoleSidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

/** Small, consistent AI Planner link shown under any role nav */
function AIAgentLink() {
  return (
    <div className="mt-3 pt-3 border-t border-neutral-800">
      <Link
        href="/agent/planner"
        className="group flex items-center gap-2 rounded-lg border border-orange-500/60 bg-neutral-950 px-3 py-2 hover:bg-neutral-900"
      >
        <span className="text-lg leading-none">🤖</span>
        <span className="font-black text-orange-400 group-hover:text-orange-300"
              style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}>
          AI Planner
        </span>
      </Link>
      <p className="mt-1 text-xs text-neutral-500">
        Auto-create work orders, add lines, and email invoices.
      </p>
    </div>
  );
}

/** Wrap any role nav with the AI Planner link beneath */
function withAI(children: React.ReactNode) {
  return (
    <div className="flex flex-col">
      {children}
      <AIAgentLink />
    </div>
  );
}

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
      return withAI(<RoleNavOwner />);
    case "admin":
      return withAI(<RoleNavAdmin />);
    case "manager":
      return withAI(<RoleNavManager />);
    case "advisor":
      return withAI(<RoleNavAdvisor />);
    case "mechanic":
      return withAI(<RoleNavTech />);
    case "parts":
      return withAI(<RoleNavParts />);
    default:
      return null;
  }
}