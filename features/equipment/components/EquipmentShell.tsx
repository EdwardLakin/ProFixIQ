"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import EquipmentAccountControls from "@/features/equipment/components/EquipmentAccountControls";
import {
  activeEquipmentShellKey,
  type EquipmentShellChild,
  type EquipmentShellItemKey,
} from "@/features/equipment/lib/equipmentShellNav";

export type EquipmentShellNavItem = {
  key: EquipmentShellItemKey;
  label: string;
  href: string;
  state: "live" | "planned";
  children?: readonly EquipmentShellChild[];
};

const ITEM =
  "flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
const ACTIVE =
  "bg-[color:var(--theme-surface-overlay)] shadow-[inset_3px_0_0_0_var(--accent-copper)]";
const CHILD =
  "block min-h-9 rounded-md px-3 py-1.5 text-xs font-medium text-[color:var(--theme-text-muted)] transition hover:bg-[color:var(--theme-surface-overlay)]";

function PlannedBadge() {
  return (
    <span className="rounded border border-[color:var(--theme-border-soft)] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--theme-text-muted)]">
      Soon
    </span>
  );
}

/**
 * Standalone Equipment product chrome: a persistent sidebar from the iPad
 * landscape breakpoint up, and a scrollable top bar below it. It replaces the
 * Shop desktop shell for every /equipment route.
 */
export default function EquipmentShell({
  items,
  homeHref = "/equipment/dashboard",
  children,
}: {
  items: readonly EquipmentShellNavItem[];
  /** Brand-link destination; the layout passes the first page the role can open. */
  homeHref?: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/equipment";
  const activeKey = activeEquipmentShellKey(pathname);

  return (
    <div className="flex min-h-screen w-full flex-col text-[color:var(--theme-text-primary)] lg:flex-row">
      <aside
        className="relative flex flex-col border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r"
        aria-label="Equipment workspace"
      >
        <div className="flex items-center gap-3 px-4 py-3 lg:py-5">
          <span
            aria-hidden="true"
            className="h-8 w-1.5 rounded-full bg-[color:var(--accent-copper)]"
          />
          <Link href={homeHref} className="leading-tight">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
              ProFixIQ
            </span>
            <span className="block text-lg font-bold">Equipment</span>
          </Link>
        </div>

        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-6"
          aria-label="Equipment sections"
        >
          {items.map((item) => {
            const active = activeKey === item.key;
            return (
              <div
                key={item.key}
                className="flex shrink-0 flex-row items-center gap-1 lg:flex-col lg:items-stretch lg:gap-0"
              >
                <Link
                  href={item.href}
                  className={`${ITEM} ${active ? ACTIVE : ""}`}
                  aria-current={
                    active && pathname.replace(/\/+$/, "") === item.href
                      ? "page"
                      : undefined
                  }
                >
                  <span>{item.label}</span>
                  {item.state === "planned" ? <PlannedBadge /> : null}
                </Link>
                {item.children?.length ? (
                  <div className="flex flex-row gap-1 lg:ml-3 lg:flex-col lg:gap-0 lg:border-l lg:border-[color:var(--theme-border-soft)] lg:pl-2">
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={CHILD}
                        aria-current={
                          pathname.replace(/\/+$/, "") === child.href
                            ? "page"
                            : undefined
                        }
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* Top-right of the bar below lg; pinned to the bottom of the sidebar from lg. */}
        <div className="absolute right-3 top-2 lg:static lg:mt-auto lg:border-t lg:border-[color:var(--theme-border-soft)] lg:p-3">
          <EquipmentAccountControls />
        </div>
      </aside>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
