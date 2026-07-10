"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/features/shared/utils/cn";
import { canonicalizeRole, type CanonicalRole } from "@/features/shared/lib/rbac";

export type OperationalView = {
  href: string;
  label: "Shop Overview" | "Work Order Board" | "Attendance & Activity";
  roles: CanonicalRole[];
};

export const OPERATIONAL_VIEWS: OperationalView[] = [
  {
    href: "/dashboard",
    label: "Shop Overview",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "parts", "dispatcher", "driver", "fleet_manager", "lead_hand", "foreman"],
  },
  {
    href: "/work-orders/board",
    label: "Work Order Board",
    roles: ["owner", "admin", "manager", "advisor", "mechanic", "lead_hand", "foreman"],
  },
  {
    href: "/dashboard/workforce/attendance",
    label: "Attendance & Activity",
    roles: ["owner", "admin", "manager"],
  },
];

export function getOperationalViewsForRole(role?: string | null): OperationalView[] {
  const normalized = canonicalizeRole(role);
  return OPERATIONAL_VIEWS.filter((view) => view.roles.includes(normalized));
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/operations";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OperationalViewSwitcher({
  role,
  className,
}: {
  role?: string | null;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const views = getOperationalViewsForRole(role);

  if (views.length <= 1) return null;

  const currentQuery = searchParams.toString();

  return (
    <nav
      aria-label="Operational views"
      className={cn(
        "flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-black/25 p-1 text-sm",
        className,
      )}
    >
      {views.map((view) => {
        const active = isActive(pathname, view.href);
        const href = active && pathname === "/work-orders/board" && currentQuery
          ? `${view.href}?${currentQuery}`
          : view.href;

        return (
          <Link
            key={view.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-xl px-3 py-2 font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70",
              active && "bg-orange-500/20 text-orange-100 shadow-[inset_0_0_0_1px_rgba(251,146,60,0.35)]",
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
