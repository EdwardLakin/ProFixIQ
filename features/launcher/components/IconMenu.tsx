"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ALL_LAUNCHABLES } from "../registry";
import AppIcon from "./AppIcon";
import { usePathname } from "next/navigation";

type DB = Database;

export default function IconMenu() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [role, setRole] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      setRole(data?.role ?? null);
    })();
  }, [supabase]);

  const apps = useMemo(() => {
    return ALL_LAUNCHABLES.filter(a => !a.roleGate || (role ? a.roleGate.includes(role as any) : false));
  }, [role]);

  if (apps.length === 0) return null;

  return (
    <section className="mt-4">
      <div className="grid grid-cols-4 gap-3">
        {apps.map(app => {
          const active = pathname?.startsWith(app.route) ?? false;
          return (
            <Link key={app.slug} href={app.route} className="block">
              <AppIcon icon={app.icon} label={app.name} active={active} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
