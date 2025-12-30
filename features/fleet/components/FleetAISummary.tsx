// features/fleet/components/FleetAISummary.tsx
"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

type FleetAISummaryProps = {
  shopId?: string | null;
};

type SummaryResponse = {
  summary: string;
  lastUpdated?: string | null;
};

export default function FleetAISummary({ shopId }: FleetAISummaryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // 🔧 Implement this on the server using OpenAI + Supabase
        // e.g. aggregate: pre-trips, inspections, WOs, OOS units and summarize.
        const res = await fetch("/api/fleet/ai-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId: shopId ?? null }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          console.error("AI fleet summary failed:", body);
          setError(body?.error || "Failed to generate fleet summary.");
          setLoading(false);
          return;
        }

        const body = (await res.json()) as SummaryResponse;
        setData(body);
      } catch (err) {
        console.error("AI fleet summary error:", err);
        setError("Failed to generate fleet summary.");
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId]);

  return (
    <section className="metal-card mt-4 rounded-3xl p-4 text-xs text-neutral-200">
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