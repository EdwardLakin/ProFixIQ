"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import type { ShopAssistantAlert } from "@/features/shop-assistant/server/state/types";

type Props = {
  alerts: ShopAssistantAlert[];
};

function levelClasses(level: ShopAssistantAlert["level"]): string {
  if (level === "critical") {
    return "border-red-400/35 bg-red-500/10";
  }
  if (level === "warning") {
    return "border-amber-400/35 bg-amber-500/10";
  }
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]";
}

export default function ShopAlertList({ alerts }: Props) {
  const pathname = usePathname();
  const mobileSurface = pathname.startsWith("/mobile");

  if (alerts.length === 0) {
    return (
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
        No proactive shop alerts are active right now.
      </section>
    );
  }

  return (
    <section aria-label="Proactive shop alerts" className="space-y-2">
      {alerts.slice(0, 8).map((alert) => {
        const href = alert.href
          ? mobileSurface
            ? (resolveMobileHref(alert.href) ?? "/mobile")
            : alert.href
          : null;
        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                {alert.title}
              </div>
              <span className="rounded-full border border-current/20 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-[color:var(--theme-text-secondary)]">
                {alert.level}
              </span>
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
              {alert.message}
            </div>
          </>
        );

        const className = `block rounded-2xl border p-3 transition ${levelClasses(
          alert.level,
        )} ${href ? "hover:border-[color:var(--brand-accent,#E39A6E)]/55" : ""}`;

        return href ? (
          <Link key={alert.id} href={href} className={className}>
            {content}
          </Link>
        ) : (
          <div key={alert.id} className={className}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
