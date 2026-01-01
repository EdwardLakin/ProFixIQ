// features/fleet/components/FleetAISummary.tsx
"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type FleetAISummaryProps = {
  shopId?: string | null;
};

export type SummaryResponse = {
  summary: string;
  lastUpdated?: string | null;
};

export default function FleetAISummary({ shopId }: FleetAISummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/fleet/ai-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: shopId ?? null }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            console.error("AI fleet summary failed:", body);
            setError(body?.error || "Failed to generate fleet summary.");
          }
          return;
        }

        const body = (await res.json()) as SummaryResponse;
        if (!cancelled) {
          setData(body);
        }
      } catch (err) {
        console.error("AI fleet summary error:", err);
        if (!cancelled) {
          setError("Failed to generate fleet summary.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId]);

  return (
    <section className="mt-4 rounded-3xl bg-black/60 p-4 text-xs text-neutral-200">
      <header className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[color:var(--accent-copper)]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
            AI fleet health summary
          </p>
        </div>
        {data?.lastUpdated && (
          <span className="text-[10px] text-neutral-500">
            Updated {new Date(data.lastUpdated).toLocaleString()}
          </span>
        )}
      </header>

      {loading && (
        <p className="text-[11px] text-neutral-400">
          Generating fleet summary…
        </p>
      )}

      {error && !loading && (
        <p className="text-[11px] text-red-300">{error}</p>
      )}

      {data?.summary && !loading && !error && (
        <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-neutral-200">
          {data.summary}
        </p>
      )}
    </section>
  );
}