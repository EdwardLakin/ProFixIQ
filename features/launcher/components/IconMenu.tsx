// features/launcher/components/IconMenu.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { ALL_LAUNCHABLES } from "../registry";
import AppIcon from "./AppIcon";
import type { ReactNode } from "react";

type DB = Database;

export type IconItem = {
  href: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badge?: number | "dot";
  active?: boolean;
};

type Props =
  | { items: IconItem[]; colsClass?: string }   // explicit items mode
  | { items?: undefined; colsClass?: string };  // registry mode

export default function IconMenu(props: Props) {
  const pathname = usePathname();

  // ✅ Hooks must run on every render, even if we later render "items" mode.
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [role, setRole] = useState<string | null>(null);

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
    return ALL_LAUNCHABLES.filter(
      (a) => !a.roleGate || (role ? a.roleGate.includes(role as any) : false)
    );
  }, [role]);

  // ---------- Render ----------
  // Items mode
  if (props.items && props.items.length > 0) {
    const cols = props.colsClass ?? "grid-cols-4";
    return (
      <section className="mt-4">
        <div className={`grid gap-3 ${cols}`}>
          {props.items.map((it) => (
            <Link key={it.href} href={it.href} className="block">
              <AppIcon
                icon={it.icon}
                label={it.title}
                badge={it.badge}
                active={it.active}
              />
              {it.subtitle && (
                <div className="mt-1 line-clamp-1 text-center text-[11px] text-white/60">
                  {it.subtitle}
                </div>
              )}
            </Link>
          ))}
        </div>
      </section>
    );
  }

  // Registry mode
  if (apps.length === 0) return null;

  return (
    <section className="mt-4">
      <div className="grid grid-cols-4 gap-3">
        {apps.map((app) => {
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