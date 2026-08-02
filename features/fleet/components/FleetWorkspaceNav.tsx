"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  Gauge,
  ReceiptText,
  ShieldCheck,
  Truck,
} from "lucide-react";

type FleetRoutePrefix = "/fleet" | "/portal/fleet";

const ITEMS = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "units", label: "Units", icon: Truck },
  { key: "maintenance", label: "Maintenance", icon: ShieldCheck },
  { key: "service-requests", label: "Requests", icon: ClipboardList },
  { key: "billing", label: "Billing", icon: ReceiptText },
] as const;

function hrefFor(prefix: FleetRoutePrefix, key: (typeof ITEMS)[number]["key"]) {
  if (key === "overview") return prefix === "/fleet" ? "/fleet/tower" : prefix;
  return `${prefix}/${key}`;
}

export default function FleetWorkspaceNav({
  routePrefix,
}: {
  routePrefix: FleetRoutePrefix;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Fleet workspace"
      className="sticky top-12 z-30 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)]/95 px-3 py-2 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto">
        {ITEMS.map((item) => {
          const href = hrefFor(routePrefix, item.key);
          const active =
            pathname === href ||
            (item.key !== "overview" && pathname.startsWith(`${href}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-sky-300 px-3 py-2 text-xs font-semibold text-slate-950"
                  : "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-secondary)] transition hover:text-[color:var(--theme-text-primary)]"
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
