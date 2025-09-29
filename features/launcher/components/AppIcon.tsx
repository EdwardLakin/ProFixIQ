"use client";
import type { ReactNode } from "react";

export default function AppIcon({
  icon,
  label,
  badge,
  active = false,
}: {
  icon: ReactNode;
  label: string;
  badge?: number | "dot";
  active?: boolean;
}) {
  // normalize: "dot" renders a small dot; numbers render a counter
  const isDot = badge === "dot";
  const hasCount = typeof badge === "number" && badge > 0;

  return (
    <div className="group relative flex select-none flex-col items-center gap-1">
      <div
        className={`grid h-16 w-16 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10 transition-all
          group-hover:shadow-[0_0_0_2px_rgba(251,146,60,0.35),0_0_20px_rgba(251,146,60,0.25)]
          group-active:scale-95
          ${active ? "shadow-[0_0_0_2px_rgba(251,146,60,0.6),0_0_28px_rgba(251,146,60,0.4)]" : ""}`}
      >
        <span className="text-2xl">{icon}</span>

        {isDot && (
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-orange-500 shadow" />
        )}

        {hasCount && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-500 px-1 text-xs font-bold text-black shadow">
            {badge! > 99 ? "99+" : badge}
          </span>
        )}
      </div>
      <span className="mt-1 max-w-[5rem] truncate text-center text-xs text-white/80">{label}</span>
    </div>
  );
}