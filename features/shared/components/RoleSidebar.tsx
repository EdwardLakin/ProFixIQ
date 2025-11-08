// features/shared/components/RoleSidebar.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  TILES,
  type Role,
  type Scope,
  type Tile,
} from "@/features/shared/config/tiles";
import { cn } from "@/features/shared/utils/cn";

export default function RoleSidebar() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();

  const [role, setRole] = useState<Role | null>(null);
  const [scopeFilter] = useState<Scope | "all">("all");

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", uid)
        .single();
      setRole((profile?.role as Role) ?? null);
    })();
  }, [supabase]);

  const tiles = useMemo(() => {
    if (!role) return [] as Tile[];
    return TILES.filter((t) => t.roles.includes(role)).filter(
      (t) => t.scopes.includes("all") || t.scopes.includes(scopeFilter),
    );
  }, [role, scopeFilter]);

  if (!role) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading navigation…
      </div>
    );
  }

  // group by first segment
  const groups = tiles.reduce<Record<string, Tile[]>>((acc, tile) => {
    const parts = tile.href.split("/").filter(Boolean);
    const group = parts[0] || "general";
    if (!acc[group]) acc[group] = [];
    acc[group].push(tile);
    return acc;
  }, {});

  // preferred ordering so it looks intentional
  const order = [
    "dashboard",
    "work-orders",
    "inspections",
    "parts",
    "tech",
    "ai",
    "compare-plans",
    "settings",
    "general",
  ];

  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <nav className="flex-1 overflow-y-auto py-4 space-y-4">
      {sortedGroups.map(([group, groupTiles]) => (
        <div key={group}>
          <p className="px-4 mb-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground/80">
            {labelForGroup(group)}
          </p>
          <div className="space-y-1">
            {groupTiles.map((t) => {
              const active =
                pathname === t.href || pathname.startsWith(t.href + "/");
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    "flex items-center justify-between gap-2 px-4 py-2 rounded-md text-sm transition",
                    active
                      ? "bg-muted/30 text-foreground"
                      : "text-muted-foreground hover:bg-muted/10 hover:text-foreground",
                  )}
                >
                  <span className="flex-1">{t.title}</span>
                  {t.cta ? (
                    <span className="text-xs text-muted-foreground">
                      {t.cta}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function labelForGroup(group: string): string {
  switch (group) {
    case "work-orders":
      return "Work Orders";
    case "inspections":
      return "Inspections";
    case "parts":
      return "Parts";
    case "dashboard":
      return "Management";
    case "tech":
      return "Tech";
    case "ai":
      return "AI";
    case "compare-plans":
      return "Billing";
    case "settings":
      return "Settings";
    default:
      return group.charAt(0).toUpperCase() + group.slice(1);
  }
}