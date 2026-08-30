"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, Info, ShieldAlert } from "lucide-react";

import type { FleetNotification } from "app/api/fleet/notifications/route";
import { cn } from "@/features/shared/utils/cn";

type Props = {
  fleetId?: string | null;
  routePrefix?: "/fleet" | "/portal/fleet";
};

const LEVEL_ICON = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
} as const;

const LEVEL_TONE = {
  critical: "text-red-300",
  warning: "text-amber-200",
  info: "text-sky-300",
} as const;

function relativeTime(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function FleetNotificationsBell({
  fleetId,
  routePrefix = "/portal/fleet",
}: Props) {
  const [items, setItems] = useState<FleetNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/fleet/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fleetId: fleetId ?? null }),
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = (await response.json()) as {
        notifications?: FleetNotification[];
      };
      setItems(body.notifications ?? []);
    } catch {
      // A transient alert-feed failure must never break the Fleet shell.
    } finally {
      setLoaded(true);
    }
  }, [fleetId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 120000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const criticalCount = useMemo(
    () => items.filter((item) => item.level === "critical").length,
    [items],
  );

  if (loaded && items.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Fleet alerts (${items.length})`}
        aria-expanded={open}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {items.length > 0 ? (
          <span
            className={cn(
              "absolute -right-1 -top-1 min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-slate-950",
              criticalCount > 0 ? "bg-red-400" : "bg-amber-300",
            )}
          >
            {items.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-x-3 top-[4.5rem] z-40 overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80">
          <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
              Fleet alerts
            </p>
            <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
              Pre-trip defects and missed pre-trips needing review
            </p>
          </div>
          <ul className="max-h-96 divide-y divide-[color:var(--theme-border-soft)] overflow-y-auto">
            {items.map((item) => {
              const Icon = LEVEL_ICON[item.level] ?? Info;
              const body = (
                <div className="flex gap-3 px-4 py-3">
                  <Icon
                    className={cn("mt-0.5 h-4 w-4 shrink-0", LEVEL_TONE[item.level])}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{item.title}</div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                      {item.message}
                    </div>
                    <div className="mt-1 text-[10px] text-[color:var(--theme-text-muted)]">
                      {relativeTime(item.createdAt)}
                    </div>
                  </div>
                </div>
              );
              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={
                        item.href.startsWith("/fleet")
                          ? `${routePrefix}${item.href.slice("/fleet".length) || ""}`
                          : item.href
                      }
                      onClick={() => setOpen(false)}
                      className="block hover:bg-white/[0.03]"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
