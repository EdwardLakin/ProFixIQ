"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  TILES,
  canShowTileForEmail,
  type Role,
  type Scope,
  type Tile,
} from "@/features/shared/config/tiles";
import {
  OWNER_GROUP_ORDER,
  getOwnerSidebarTiles,
} from "@/features/shared/lib/ownerSidebarNav";
import { cn } from "@/features/shared/utils/cn";
import { ChevronDown, ChevronRight } from "lucide-react";

const GROUP_ORDER = [
  "Dashboard",
  "Tech",
  "Operations",
  "Parts",
  "Fleet",
  "Property",
  "Tools",
  "Admin",
  "Billing",
  "Settings",
  "General",
];

function normalizeRole(raw: string | null | undefined): Role | null {
  const r = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (!r) return null;

  if (r === "tech" || r === "technician") return "mechanic";
  if (r === "fleet pm" || r === "fleet_pm") return "fleet_manager";

  return r as Role;
}

function isRouteMatch(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/") return pathname === "/";
  return pathname.startsWith(`${href}/`);
}

function getCanonicalActiveTile(pathname: string, tiles: Tile[]): Tile | null {
  const matching = tiles.filter((tile) => isRouteMatch(pathname, tile.href));
  if (matching.length === 0) return null;
  return matching.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

export default function RoleSidebar({
  initialRole = null,
  initialEmail = null,
}: {
  initialRole?: string | null;
  initialEmail?: string | null;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const pathname = usePathname();

  const [role, setRole] = useState<Role | null>(normalizeRole(initialRole));
  const [userEmail, setUserEmail] = useState<string | null>(initialEmail);
  const [scopeFilter] = useState<Scope | "all">("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      setUserEmail(session?.user?.email ?? null);
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

    const filteredTiles = TILES.filter((t) => t.roles.includes(role))
      .filter((t) => t.scopes.includes("all") || t.scopes.includes(scopeFilter))
      .filter((t) => canShowTileForEmail(t, userEmail));

    if (role === "owner") return getOwnerSidebarTiles(filteredTiles);
    return filteredTiles;
  }, [role, scopeFilter, userEmail]);

  const canonicalActiveTile = useMemo(
    () => getCanonicalActiveTile(pathname, tiles),
    [pathname, tiles],
  );

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

  const sortedGroups = useMemo(() => {
    const groupOrder = role === "owner" ? OWNER_GROUP_ORDER : GROUP_ORDER;
    return Object.entries(groups).sort(([a], [b]) => {
      const ia = groupOrder.indexOf(a);
      const ib = groupOrder.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [groups, role]);

  useEffect(() => {
    if (!sortedGroups.length) return;

    const next: Record<string, boolean> = {};
    for (const [group, groupTiles] of sortedGroups) {
      const hasActive = canonicalActiveTile
        ? groupTiles.some((t) => t.href === canonicalActiveTile.href)
        : groupTiles.some((t) => isRouteMatch(pathname, t.href));
      next[group] = hasActive;
    }

    setOpenSections((prev) =>
      Object.fromEntries(
        Object.entries(next).map(([k, v]) => [k, prev[k] ?? v ?? false]),
      ),
    );
  }, [pathname, sortedGroups, canonicalActiveTile]);

  if (!role) {
    return (
      <div
        className="p-4 text-xs"
        style={{ color: "var(--theme-sidebar-text,#d4d4d8)" }}
      >
        Loading navigation…
      </div>
    );
  }

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <nav
      className="flex-1 overflow-y-auto space-y-3 py-3"
      style={{
        background:
          "linear-gradient(to bottom, color-mix(in srgb, var(--theme-sidebar-bg,#020617) 92%, black), var(--theme-sidebar-bg,#020617), color-mix(in srgb, var(--theme-sidebar-bg,#020617) 80%, black))",
      }}
    >
      {sortedGroups.map(([group, groupTiles]) => {
        const open = !!openSections[group];
        const hasActive = canonicalActiveTile
          ? groupTiles.some((t) => t.href === canonicalActiveTile.href)
          : groupTiles.some((t) => isRouteMatch(pathname, t.href));

        return (
          <div key={group} className="px-2.5">
            <button
              type="button"
              onClick={() => toggleSection(group)}
              className={cn(
                "flex w-full items-center justify-between px-2.5 py-2 text-left transition-all",
                "border",
              )}
              style={{
                borderRadius: "var(--theme-radius-lg,0.75rem)",
                borderColor: hasActive
                  ? "color-mix(in srgb, var(--brand-primary,#C1663B) 55%, var(--theme-card-border,#334155))"
                  : "color-mix(in srgb, var(--theme-card-border,#334155) 85%, transparent)",
                background: hasActive
                  ? "color-mix(in srgb, var(--theme-sidebar-active-bg,var(--brand-primary,#C1663B)) 10%, var(--theme-sidebar-bg,#020617))"
                  : "color-mix(in srgb, var(--theme-sidebar-bg,#020617) 82%, black)",
                color: "var(--theme-sidebar-text,#D4D4D8)",
                boxShadow: hasActive
                  ? "0 0 0 1px color-mix(in srgb, var(--brand-primary,#C1663B) 20%, transparent)"
                  : "none",
              }}
            >
              <span className="flex items-center gap-2">
                {hasActive ? (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{
                      background: "var(--brand-primary,#C1663B)",
                      boxShadow:
                        "0 0 12px color-mix(in srgb, var(--brand-primary,#C1663B) 65%, transparent)",
                    }}
                  />
                ) : (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full opacity-40"
                    style={{
                      background: "var(--theme-text-secondary,#94A3B8)",
                    }}
                  />
                )}

                <span
                  className="text-[0.64rem] font-semibold uppercase tracking-[0.2em]"
                  style={{
                    color: hasActive
                      ? "var(--theme-text-primary,#FFFFFF)"
                      : "var(--theme-text-secondary,#94A3B8)",
                  }}
                >
                  {group}
                </span>
              </span>

              {open ? (
                <ChevronDown
                  className="h-3.5 w-3.5"
                  style={{
                    color: hasActive
                      ? "var(--brand-primary,#C1663B)"
                      : "var(--theme-text-secondary,#94A3B8)",
                  }}
                />
              ) : (
                <ChevronRight
                  className="h-3.5 w-3.5"
                  style={{
                    color: hasActive
                      ? "var(--brand-primary,#C1663B)"
                      : "var(--theme-text-secondary,#94A3B8)",
                  }}
                />
              )}
            </button>

            {open ? (
              <div className="mt-2 space-y-1.5 pl-2.5">
                {groupTiles.map((t) => {
                  const active = canonicalActiveTile
                    ? canonicalActiveTile.href === t.href
                    : isRouteMatch(pathname, t.href);

                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className="group flex items-center justify-between gap-2 border px-2.5 py-2 transition-all"
                      style={{
                        borderRadius: "var(--theme-radius-md,0.5rem)",
                        borderColor: active
                          ? "var(--theme-sidebar-active-bg,var(--brand-primary,#C1663B))"
                          : "color-mix(in srgb, var(--theme-card-border,#334155) 85%, transparent)",
                        background: active
                          ? "var(--theme-sidebar-active-bg,var(--brand-primary,#C1663B))"
                          : "color-mix(in srgb, var(--theme-sidebar-bg,#020617) 58%, white 4%)",
                        color: active
                          ? "var(--theme-sidebar-active-text,#000000)"
                          : "var(--theme-sidebar-text,#D4D4D8)",
                        boxShadow: active
                          ? "var(--theme-shadow-soft,0_14px_30px_rgba(0,0,0,0.35))"
                          : "none",
                      }}
                    >
                      <span
                        className="truncate text-[0.8rem] font-medium"
                        style={{
                          color: active
                            ? "var(--theme-sidebar-active-text,#000000)"
                            : "var(--theme-text-primary,#FFFFFF)",
                        }}
                      >
                        {t.title}
                      </span>

                      {t.cta ? (
                        <span
                          className="text-[0.68rem]"
                          style={{
                            color: active
                              ? "color-mix(in srgb, var(--theme-sidebar-active-text,#000000) 80%, transparent)"
                              : "var(--theme-text-secondary,#94A3B8)",
                          }}
                        >
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
