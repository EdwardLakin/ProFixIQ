"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import AppIcon from "features/launcher/components/AppIcon";
import { ALL_LAUNCHABLES } from "@/features/launcher/registry";
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
  | { items: IconItem[]; colsClass?: string } // explicit items mode
  | { items?: undefined; colsClass?: string }; // registry mode

const IconMenu = (props: Props) => {
  const pathname = usePathname();

  // If items are passed, render them (items mode) ----------------------------
  if (props.items && props.items.length > 0) {
    const cols = props.colsClass ?? "grid-cols-4";
    return (
      <section className="mt-4">
        <div className={`grid gap-3 ${cols}`}>
          {props.items.map((it) => (
            <Link key={it.href} href={it.href} className="block">
              <AppIcon icon={it.icon} label={it.title} badge={it.badge} active={it.active} />
              {it.subtitle && (
                <div className="mt-1 line-clamp-1 text-center text-[11px] text-white/60">{it.subtitle}</div>
              )}
            </Link>
          ))}
        </div>
      </section>
    );
  }

  // Otherwise, use registry mode --------------------------------------------
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
    return ALL_LAUNCHABLES.filter((a) => !a.roleGate || (role ? a.roleGate.includes(role as any) : false));
  }, [role]);

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
};

export default IconMenu;
export { IconMenu }; // named export for legacy imports