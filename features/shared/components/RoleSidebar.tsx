"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTechnicianCopilotAvailability } from "@/features/copilot/technician/client/useTechnicianCopilotAvailability";
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
import { canonicalizeRole } from "@/features/shared/lib/rbac";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";
import { useWorkspaceCapabilities } from "@/features/workspace/authorization/useWorkspaceCapabilities";
import { useNavigationQueueIndicators, type NavigationQueueKey } from "@/features/shared/hooks/useNavigationQueueIndicators";

const GROUP_ORDER = [
  "Dashboard",
  "Tech",
  "Operations",
  "Parts",
  "Tools",
  "Admin",
  "Billing",
  "Settings",
  "General",
];

function normalizeRole(raw: string | null | undefined): Role | null {
  const canonical = canonicalizeRole(raw);
  if (canonical === "unknown" || canonical === "customer") {
    return null;
  }
  return canonical;
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
  showQueueIndicators = true,
  inboxUnreadCount = 0,
}: {
  initialRole?: string | null;
  initialEmail?: string | null;
  showQueueIndicators?: boolean;
  inboxUnreadCount?: number;
}) {
  const pathname = usePathname();

  const role = normalizeRole(initialRole);
  const userEmail = initialEmail;
  const [scopeFilter] = useState<Scope | "all">("all");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const technicianCopilotAvailable = useTechnicianCopilotAvailability(
    role === "mechanic",
  );
  const { can: canWorkspace } = useWorkspaceCapabilities();
  const canManageWorkOrderAssignments = canWorkspace(
    WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
  );

  const tiles = useMemo(() => {
    if (!role) return [] as Tile[];

    const filteredTiles = TILES.filter(
      (t) =>
        t.roles.includes(role) ||
        (t.href === "/work-orders/view" && canManageWorkOrderAssignments),
    )
      .filter((t) => t.scopes.includes("all") || t.scopes.includes(scopeFilter))
      .filter((t) => canShowTileForEmail(t, userEmail))
      .filter(
        (t) =>
          !t.requiresTechnicianCopilot || technicianCopilotAvailable,
      );

    if (role === "owner") return getOwnerSidebarTiles(filteredTiles);
    return filteredTiles;
  }, [
    canManageWorkOrderAssignments,
    role,
    scopeFilter,
    technicianCopilotAvailable,
    userEmail,
  ]);

  const queueIndicators = useNavigationQueueIndicators(
    Boolean(role) && showQueueIndicators,
    tiles.some((tile) => tile.href === "/work-orders/fleet-requests"),
  );
  const queueKeyByHref: Record<string, NavigationQueueKey> = {
    "/work-orders/fleet-requests": "fleetIntake",
    "/work-orders/quote-review": "quoteReview",
    "/work-orders/view": "workOrders",
    "/parts": "parts",
    "/parts/requests": "parts",
    "/billing": "billing",
  };
  const hasQueue = (href: string) => Boolean(queueIndicators[queueKeyByHref[href]]);

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
        style={{ color: "var(--theme-sidebar-text,var(--theme-text-primary))" }}
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
        background: "var(--theme-gradient-panel)",
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
                  ? "color-mix(in srgb, var(--brand-primary,#C1663B) 55%, var(--theme-card-border,var(--theme-border-soft)))"
                  : "color-mix(in srgb, var(--theme-card-border,var(--theme-border-soft)) 85%, transparent)",
                background: hasActive
                  ? "color-mix(in srgb, var(--theme-sidebar-active-bg,var(--brand-primary,#C1663B)) 10%, var(--theme-sidebar-bg,var(--theme-surface-page)))"
                  : "color-mix(in srgb, var(--theme-sidebar-bg,var(--theme-surface-page)) 82%, var(--theme-surface-page))",
                color: "var(--theme-sidebar-text,var(--theme-text-primary))",
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
                      background:
                        "var(--theme-text-secondary,var(--theme-text-muted))",
                    }}
                  />
                )}

                <span
                  className="text-[0.64rem] font-semibold uppercase tracking-[0.2em]"
                  style={{
                    color: hasActive
                      ? "var(--theme-text-primary,var(--theme-text-inverse))"
                      : "var(--theme-text-secondary,var(--theme-text-muted))",
                  }}
                >
                  {group}
                </span>
              </span>

              <span className="ml-auto flex items-center gap-2">
                {showQueueIndicators && groupTiles.some((tile) => tile.href === "/chat") && inboxUnreadCount > 0 ? (
                  <span aria-label="Unread messages" title="Unread messages"
                    className="h-2 w-2 rounded-full bg-sky-500" />
                ) : null}
                {groupTiles.some((tile) => hasQueue(tile.href)) ? (
                  <span
                    aria-label={`${group} has outstanding work`}
                    title="Outstanding work"
                    className="h-2 w-2 rounded-full bg-amber-500"
                  />
                ) : null}
              {open ? (
                <ChevronDown
                  className="h-3.5 w-3.5"
                  style={{
                    color: hasActive
                      ? "var(--brand-primary,#C1663B)"
                      : "var(--theme-text-secondary,var(--theme-text-muted))",
                  }}
                />
              ) : (
                <ChevronRight
                  className="h-3.5 w-3.5"
                  style={{
                    color: hasActive
                      ? "var(--brand-primary,#C1663B)"
                      : "var(--theme-text-secondary,var(--theme-text-muted))",
                  }}
                />
              )}
              </span>
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
                          : "color-mix(in srgb, var(--theme-card-border,var(--theme-border-soft)) 85%, transparent)",
                        background: active
                          ? "var(--theme-sidebar-active-bg,var(--brand-primary,#C1663B))"
                          : "color-mix(in srgb, var(--theme-sidebar-bg,var(--theme-surface-page)) 58%, var(--theme-text-inverse) 4%)",
                        color: active
                          ? "var(--theme-sidebar-active-text,var(--theme-text-on-accent))"
                          : "var(--theme-sidebar-text,var(--theme-text-primary))",
                        boxShadow: active
                          ? "var(--theme-shadow-soft,0_14px_30px_var(--theme-surface-inset))"
                          : "none",
                      }}
                    >
                      <span
                        className="truncate text-[0.8rem] font-medium"
                        style={{
                          color: active
                            ? "var(--theme-sidebar-active-text,var(--theme-text-on-accent))"
                            : "var(--theme-text-primary,var(--theme-text-inverse))",
                        }}
                      >
                        {t.title}
                      </span>

                      {showQueueIndicators && t.href === "/chat" && inboxUnreadCount > 0 ? (
                        <span aria-label={`${inboxUnreadCount} unread messages`}
                          title={`${inboxUnreadCount} unread messages`}
                          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                      ) : null}
                      {hasQueue(t.href) ? (
                        <span
                          aria-label={`${t.title} has outstanding work`}
                          title="Outstanding work"
                          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        />
                      ) : null}
                      {t.cta ? (
                        <span
                          className="text-[0.68rem]"
                          style={{
                            color: active
                              ? "color-mix(in srgb, var(--theme-sidebar-active-text,var(--theme-text-on-accent)) 80%, transparent)"
                              : "var(--theme-text-secondary,var(--theme-text-muted))",
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
