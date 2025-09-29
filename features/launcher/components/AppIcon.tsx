// features/launcher/components/AppIcon.tsx
import type { ReactNode } from "react";

export function AppIcon({ icon, name, count }:{
  icon: ReactNode; name: string; count: number | "dot" | 0;
}) {
  return (
    <div className="relative flex flex-col items-center gap-1">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
        <span className="text-3xl">{icon}</span>
      </div>
      <span className="text-[11px] text-white/90">{name}</span>

      {count === "dot" && (
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-black/60" />
      )}
      {typeof count === "number" && count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold text-white ring-2 ring-black/60">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </div>
  );
}