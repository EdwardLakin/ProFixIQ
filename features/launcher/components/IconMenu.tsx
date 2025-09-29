// features/launcher/components/IconMenu.tsx
"use client";
import Link from "next/link";
import type { ReactNode } from "react";

export type IconItem = {
  href: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;          // emoji / <svg/> / initials avatar
  badge?: number | "dot" | 0;
  disabled?: boolean;
};

export default function IconMenu({
  items,
  colsClass = "grid-cols-2 md:grid-cols-4",
}: {
  items: IconItem[];
  colsClass?: string; // override to "grid-cols-3 md:grid-cols-6" etc.
}) {
  return (
    <div className={`grid ${colsClass} gap-4`}>
      {items.map((it) => {
        const content = (
          <div
            className={`relative flex h-full flex-col items-center gap-2 rounded-2xl
                        bg-white/10 p-3 text-center ring-1 ring-white/10 backdrop-blur
                        ${it.disabled ? "opacity-50" : "hover:bg-white/15"}`}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
              <span className="text-3xl leading-none">{it.icon ?? "📦"}</span>
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-medium">{it.title}</div>
              {it.subtitle && (
                <div className="text-[11px] text-white/70">{it.subtitle}</div>
              )}
            </div>

            {/* badge */}
            {it.badge === "dot" && (
              <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-black/60" />
            )}
            {typeof it.badge === "number" && it.badge > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold text-white ring-2 ring-black/60">
                {it.badge > 99 ? "99+" : it.badge}
              </span>
            )}
          </div>
        );

        return it.disabled ? (
          <div key={it.href} aria-disabled className="cursor-not-allowed">
            {content}
          </div>
        ) : (
          <Link key={it.href} href={it.href} className="block">
            {content}
          </Link>
        );
      })}
    </div>
  );
}