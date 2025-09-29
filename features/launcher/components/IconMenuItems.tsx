"use client";

import Link from "next/link";
import AppIcon from "./AppIcon";
import type { ReactNode } from "react";

export type IconItem = {
  href: string;
  title: string;
  subtitle?: string;
  icon: ReactNode;
  badge?: number | "dot";
  active?: boolean;
};

export default function IconMenuItems({
  items,
  colsClass = "grid-cols-4",
}: {
  items: IconItem[];
  colsClass?: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mt-4">
      <div className={`grid gap-3 ${colsClass}`}>
        {items.map((it) => (
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