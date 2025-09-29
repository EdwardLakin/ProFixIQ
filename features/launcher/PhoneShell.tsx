// features/launcher/PhoneShell.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WidgetGrid from "./components/WidgetGrid";
import IconMenu from "./components/IconMenu";
import Dock from "./components/Dock";
import { useBadgeBus, type BadgeKind } from "./useBadgeBus";

// RGB triplets so we can compose rgba(opacity)
const COLORS = {
  base: "251,146,60",   // orange-400
  info: "96,165,250",   // blue-400
  warn: "245,158,11",   // amber-500
  error: "248,113,113", // red-400
  success: "52,211,153" // emerald-400
} as const;

type AttentionLevel = keyof typeof COLORS;

function levelForKind(kind: BadgeKind | null): AttentionLevel {
  if (!kind) return "base";
  if (kind === "message") return "error";
  if (kind === "work_order") return "warn";
  if (kind === "notification") return "info";
  return "base";
}

export default function PhoneShell({ children }: { children: React.ReactNode }) {
  const [recentKind, setRecentKind] = useState<BadgeKind | null>(null);
  const [hasPulse, setHasPulse] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable handler the hook can use
  const onBus = useCallback((kind: BadgeKind) => {
    setRecentKind(kind);
    setHasPulse(true);
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = setTimeout(() => {
      setHasPulse(false);
      setRecentKind(null);
    }, 4000);
  }, []);

  // ✅ Call the hook at top level (not inside another effect)
  useBadgeBus(onBus);

  // Optional external override via event
  const [override, setOverride] = useState<AttentionLevel | null>(null);
  useEffect(() => {
    const onEvt = (e: Event) => {
      const level = (e as CustomEvent<AttentionLevel>).detail;
      if (!level) return;
      setOverride(level);
      if (level !== "base") {
        const t = setTimeout(() => setOverride(null), 4000);
        return () => clearTimeout(t);
      }
    };
    window.addEventListener("pf:attention", onEvt as EventListener);
    return () => window.removeEventListener("pf:attention", onEvt as EventListener);
  }, []);

  useEffect(() => () => { if (pulseTimer.current) clearTimeout(pulseTimer.current); }, []);

  const level: AttentionLevel = useMemo(() => {
    if (override) return override;
    if (hasPulse) return levelForKind(recentKind);
    return "base";
  }, [override, hasPulse, recentKind]);

  const rgb = COLORS[level];

  return (
    <div className="flex min-h-dvh w-full items-start justify-center bg-black text-white">
      <div
        className="relative mx-auto my-4 w-full max-w-[420px] rounded-[2.2rem] bg-neutral-950/95 ring-1 ring-white/10 backdrop-blur"
        style={{
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 26px 6px rgba(${rgb}, 0.20),
            0 0 54px 18px rgba(${rgb}, 0.15)
          `,
          transition: "box-shadow 240ms ease, filter 240ms ease",
          filter: level !== "base" ? "saturate(1.08)" : "saturate(1)",
        }}
      >
        {/* Inner bezel tint */}
        <div
          className="pointer-events-none absolute inset-0 rounded-[2.2rem]"
          style={{
            boxShadow: `inset 0 0 0 2px rgba(${rgb}, 0.40), inset 0 0 24px rgba(${rgb}, 0.12)`,
            transition: "box-shadow 240ms ease",
          }}
        />

        {/* Status bar space */}
        <div className="h-7 rounded-t-[2.2rem]" />

        <div className="px-3 pb-4">
          {/* Widgets */}
          <WidgetGrid />

          {/* App icons */}
          <IconMenu />

          {/* Active route */}
          <div className="mt-3">{children}</div>

          {/* Dock */}
          <Dock />
        </div>
      </div>
    </div>
  );
}