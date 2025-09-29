"use client";

import { useEffect, useMemo, useState } from "react";
import WidgetGrid from "./components/WidgetGrid";
import IconMenu from "./components/IconMenu";
import Dock from "./components/Dock";
import { useBadgeBus, type BadgeKind } from "./useBadgeBus";

// Colors as RGB triplets so we can build rgba() with any opacity
const COLORS = {
  base: "251,146,60",      // orange-400
  info: "96,165,250",      // blue-400
  warn: "245,158,11",      // amber-500
  error: "248,113,113",    // red-400
  success: "52,211,153",   // emerald-400
} as const;

type AttentionLevel = keyof typeof COLORS;

// Map bus kinds → glow “attention level”
function levelForKind(kind: BadgeKind | null): AttentionLevel {
  if (!kind) return "base";
  if (kind === "message") return "error";        // red pulse for new messages
  if (kind === "work_order") return "warn";      // amber for WO changes
  if (kind === "notification") return "info";    // blue for generic notifs
  return "base";
}

export default function PhoneShell({ children }: { children: React.ReactNode }) {
  // Show a brief glow when a DB event arrives
  const [recentKind, setRecentKind] = useState<BadgeKind | null>(null);
  const [hasPulse, setHasPulse] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    // When the bus ticks, store the kind and start a 4s pulse
    useBadgeBus((kind) => {
      setRecentKind(kind);
      setHasPulse(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setHasPulse(false);
        setRecentKind(null);
      }, 4000);
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  // External override via event (optional)
  const [override, setOverride] = useState<AttentionLevel | null>(null);
  useEffect(() => {
    const onEvt = (e: Event) => {
      const level = (e as CustomEvent<AttentionLevel>).detail;
      setOverride(level);
      if (level !== "base") {
        const t = setTimeout(() => setOverride(null), 4000);
        return () => clearTimeout(t);
      }
    };
    window.addEventListener("pf:attention", onEvt as EventListener);
    return () => window.removeEventListener("pf:attention", onEvt as EventListener);
  }, []);

  // Priority: override > bus pulse > base
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
          // Outer glow (subtle bloom)
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.04),
            0 0 26px 6px rgba(${rgb}, 0.20),
            0 0 54px 18px rgba(${rgb}, 0.15)
          `,
          transition: "box-shadow 240ms ease, filter 240ms ease",
          filter: level !== "base" ? "saturate(1.08)" : "saturate(1)",
        }}
      >
        {/* Inner bezel stroke that also tints with the glow */}
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
          {/* Widgets row */}
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