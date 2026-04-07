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

function normalizeRole(raw: string | null | undefined): Role | null {
  const r = String(raw ?? "").toLowerCase().trim();
  if (!r) return null;
  if (r === "tech" || r === "technician") return "mechanic";
  if (r === "fleet pm" || r === "fleet_pm") return "fleet_manager";
  return r as Role;
}

export default function RoleSidebar() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const pathname = usePathname();

  const [role, setRole] = useState<Role | null>(null);
  const [scopeFilter] = useState<Scope | "all">("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

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

      setRole(normalizeRole(profile?.role ?? null));
    })();
  }, [supabase]);

  const tiles = useMemo(() => {
    if (!role) return [] as Tile[];

    return TILES.filter((t) => t.roles.includes(role)).filter(
      (t) => t.scopes.includes("all") || t.scopes.includes(scopeFilter),
    );
  }, [role, scopeFilter]);

  const groups = useMemo(() => {
    return tiles.reduce<Record<string, Tile[]>>((acc, tile) => {
      const key =
        tile.section?.trim() ||
        tile.href.split("/").filter(Boolean)[0] ||
        "General";
      (acc[key] ||= []).push(tile);
      return acc;
    }, {});
  }, [tiles]);

  const order = [
    "Tech",
    "Operations",
    "Parts",
    "Fleet",
    "Tools",
    "Admin",
    "Billing",
    "Settings",
    "General",
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

  useEffect(() => {
    if (!sortedGroups.length) return;

    const next: Record<string, boolean> = {};
    for (const [group, groupTiles] of sortedGroups) {
      const hasActive = groupTiles.some(
        (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
      );
      next[group] = hasActive;
    }

    setOpenSections((prev) =>
      Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, prev[k] ?? v ?? false]),
      ),
    );
  }, [pathname, sortedGroups]);

  if (!role) {
    return <div className="p-4 text-xs text-neutral-400">Loading navigation…</div>;
  }

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <nav
      className="metal-scroll flex-1 space-y-3 overflow-y-auto py-4"
      style={{
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.55), color-mix(in srgb, var(--brand-secondary, #0F172A) 82%, black), rgba(0,0,0,0.75))",
      }}
    >
      {sortedGroups.map(([group, groupTiles]) => {
        const open = !!openSections[group];
        const hasActive = groupTiles.some(
          (t) => pathname === t.href || pathname.startsWith(t.href + "/"),
        );

        return (
          <div key={group} className="px-3">
            <button
              type="button"
              onClick={() => toggleSection(group)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left",
                "text-[0.65rem] uppercase tracking-[0.16em]",
                "border text-neutral-300 transition-colors",
              )}
              style={{
                borderColor: hasActive
                  ? "color-mix(in srgb, var(--brand-primary, #C1663B) 70%, transparent)"
                  : "var(--metal-border-soft, rgba(148,163,184,0.3))",
                background: hasActive
                  ? "linear-gradient(135deg, color-mix(in srgb, var(--brand-primary, #C1663B) 12%, transparent), rgba(0,0,0,0.38))"
                  : "rgba(0,0,0,0.28)",
                boxShadow: hasActive
                  ? "0 0 20px color-mix(in srgb, var(--brand-primary, #C1663B) 24%, transparent)"
                  : "none",
              }}
            >
              <span className="flex items-center gap-2">
                {hasActive ? (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: "var(--brand-primary, #C1663B)",
                      boxShadow:
                        "0 0 14px color-mix(in srgb, var(--brand-primary, #C1663B) 70%, transparent)",
                    }}
                  />
                ) : null}
                <span>{group}</span>
              </span>
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />
              )}
            </button>

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
                        "group flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[0.8rem] transition-colors",
                        "border",
                      )}
                      style={{
                        borderColor: active
                          ? "color-mix(in srgb, var(--brand-primary, #C1663B) 70%, transparent)"
                          : "rgba(255,255,255,0.05)",
                        background: active
                          ? "linear-gradient(135deg, color-mix(in srgb, var(--brand-primary, #C1663B) 12%, transparent), rgba(0,0,0,0.38))"
                          : "linear-gradient(135deg, rgba(0,0,0,0.24), color-mix(in srgb, var(--brand-secondary, #0F172A) 34%, black))",
                        color: active ? "#ffffff" : "#a3a3a3",
                        boxShadow: active
                          ? "0 0 25px color-mix(in srgb, var(--brand-primary, #C1663B) 24%, transparent)"
                          : "none",
                      }}
                    >
                      <span className="truncate">{t.title}</span>
                      {t.cta ? (
                        <span className="text-[0.7rem] text-neutral-500 group-hover:text-neutral-200">
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
