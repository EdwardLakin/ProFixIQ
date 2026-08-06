"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import { toFleetPublicHref } from "@/features/fleet/lib/fleetProductRouting";

type FleetAISummaryProps = {
  shopId?: string | null;
  routePrefix?: "/fleet" | "/portal/fleet";
};

type Point = {
  id: string;
  priority: "critical" | "attention" | "good" | "info";
  label: string;
  detail: string;
  href: string;
};

type SummaryResponse = {
  headline: string;
  aiGenerated: boolean;
  points: Point[];
  lastUpdated: string;
};

const tones: Record<Point["priority"], string> = {
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
  attention: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  good: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  info: "border-sky-300/25 bg-sky-300/10 text-sky-200",
};

export default function FleetAISummary({
  shopId,
  routePrefix = "/fleet",
}: FleetAISummaryProps) {
  const pathname = usePathname() ?? "";
  const productRoutes = !pathname.startsWith("/portal/fleet");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/fleet/ai-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: shopId ?? null, routePrefix }),
          cache: "no-store",
        });
        const body = (await response.json().catch(() => ({}))) as
          | SummaryResponse
          | { error?: string };
        if (!response.ok || !("points" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Failed to build fleet brief",
          );
        }
        if (!cancelled) setData(body);
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Failed to build fleet brief",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routePrefix, shopId]);

  return (
    <section className="text-xs text-[color:var(--theme-text-primary)]">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[color:var(--accent-copper)]" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Live fleet brief
            </p>
            <p className="mt-0.5 text-[10px] text-[color:var(--theme-text-muted)]">
              AI summary, live records one click away
            </p>
          </div>
        </div>
        {data?.lastUpdated ? (
          <span className="text-[10px] text-[color:var(--theme-text-muted)]">
            {new Date(data.lastUpdated).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        ) : null}
      </header>

      {loading ? (
        <p className="mt-4 text-[color:var(--theme-text-secondary)]">
          Reading fleet activity…
        </p>
      ) : null}
      {error && !loading ? <p className="mt-4 text-red-300">{error}</p> : null}

      {data && !loading && !error ? (
        <>
          <p className="mt-3 text-sm font-medium leading-relaxed">
            {data.headline}
          </p>
          <div className="mt-3 space-y-2">
            {data.points.map((point) => (
              <Link
                key={point.id}
                href={
                  productRoutes
                    ? (toFleetPublicHref(point.href) ?? point.href)
                    : point.href
                }
                className={`group flex items-start justify-between gap-3 rounded-xl border p-3 transition hover:brightness-110 ${tones[point.priority]}`}
              >
                <span>
                  <span className="block text-xs font-semibold">
                    {point.label}
                  </span>
                  <span className="mt-1 block text-[11px] opacity-75">
                    {point.detail}
                  </span>
                </span>
                <ArrowRight
                  size={14}
                  className="mt-0.5 shrink-0 transition group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
