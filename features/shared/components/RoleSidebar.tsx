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
import { ChevronDown, ChevronRight } from "lucide-react";

export default function RoleSidebar() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();

  const [role, setRole] = useState<Role | null>(null);
  const [scopeFilter] = useState<Scope | "all">("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // load role
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

  // all tiles for this role
  const tiles = useMemo(() => {
    if (!role) return [] as Tile[];
    return TILES.filter((t) => t.roles.includes(role)).filter(
      (t) => t.scopes.includes("all") || t.scopes.includes(scopeFilter),
    );
  }, [role, scopeFilter]);

  // group tiles by first segment
  const groups = useMemo(() => {
    const g = tiles.reduce<Record<string, Tile[]>>((acc, tile) => {
      const parts = tile.href.split("/").filter(Boolean);
      const key = parts[0] || "general";
      (acc[key] ||= []).push(tile);
      return acc;
    }, {});
    return g;
  }, [tiles]);

  // desired display order
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

  const sortedGroups = useMemo(
    () =>
      Object.entries(groups).sort(([a], [b]) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }),
    [groups],
  );

  // open the section that contains the current page
  useEffect(() => {
    if (!sortedGroups.length) return;
    const next: Record<string, boolean> = {};
    for (const [group, groupTiles] of sortedGroups) {
      const hasActive = groupTiles.some(
        (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
      );
      // default closed, but open the one that contains active
      next[group] = hasActive;
    }
    setOpenSections((prev) =>
      // keep any user toggles, but ensure active stays open
      Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, prev[k] ?? v ?? false]),
      ),
    );
  }, [pathname, sortedGroups]);

  if (!role) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Loading navigation…
      </div>
    );
  }

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <nav className="flex-1 overflow-y-auto py-4 space-y-3">
      {sortedGroups.map(([group, groupTiles]) => {
        const open = !!openSections[group];

        return (
          <div key={group} className="px-3">
            {/* section header */}
            <button
              type="button"
              onClick={() => toggleSection(group)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left",
                "text-[0.65rem] uppercase tracking-wide",
                "text-muted-foreground hover:text-foreground hover:bg-white/5",
              )}
            >
              <span>{labelForGroup(group)}</span>
              {open ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>

            {/* section body */}
            {open ? (
              <div className="mt-1 space-y-1">
                {groupTiles.map((t) => {
                  const active =
                    pathname === t.href || pathname.startsWith(t.href + "/");
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition",
                        active
                          ? "bg-white/5 text-foreground"
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{t.title}</span>
                      {t.cta ? (
                        <span className="text-xs text-muted-foreground/80">
                          {t.cta}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function labelForGroup(group: string): string {
  switch (group) {
    case "dashboard":
      return "Management";
    case "work-orders":
      return "Work Orders";
    case "inspections":
      return "Inspections";
    case "parts":
      return "Parts";
    case "tech":
      return "Tech";
    case "ai":
      return "AI";
    case "compare-plans":
      return "Billing";
    case "settings":
      return "Settings";
    case "general":
      return "General";
    default:
      return group.charAt(0).toUpperCase() + group.slice(1);
  }
}