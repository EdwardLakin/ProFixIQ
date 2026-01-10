"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import type { ShopHealthSnapshot } from "@/features/integrations/ai/shopBoostType";
import ShopHealthSnapshotView from "@/features/shops/components/ShopHealthSnapshot";

type DB = Database;
type ShopAiProfileRow = DB["public"]["Tables"]["shop_ai_profiles"]["Row"];
type ShopHealthSnapshotRow = DB["public"]["Tables"]["shop_health_snapshots"]["Row"];

type Props = {
  shopId: string;
};

// Theme tokens (new glass + slate + orange)
const cardBase =
  "rounded-3xl border border-slate-700/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.10),rgba(15,23,42,0.98))] shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-xl";
const cardInner = "rounded-xl border border-slate-700/60 bg-slate-950/60";

export default function OwnerShopHealthWidget({ shopId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [aiProfile, setAiProfile] = useState<ShopAiProfileRow | null>(null);
  const [snapshot, setSnapshot] = useState<ShopHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBootLoading(true);

      try {
        const [profileRes, snapRes] = await Promise.all([
          supabase.from("shop_ai_profiles").select("*").eq("shop_id", shopId).maybeSingle(),
          supabase
            .from("shop_health_snapshots")
            .select("*")
            .eq("shop_id", shopId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        if (!profileRes.error && profileRes.data) {
          setAiProfile(profileRes.data as ShopAiProfileRow);
        }

        if (!snapRes.error && snapRes.data) {
          const row = snapRes.data as ShopHealthSnapshotRow;
          const mapped = mapSnapshotRowToUi(row);
          if (mapped) setSnapshot(mapped);
        }
      } catch (e) {
        console.warn("[OwnerShopHealthWidget] boot load failed", e);
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, supabase]);

  const summaryText = useMemo(() => normalizeSummary(aiProfile?.summary), [aiProfile?.summary]);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/shop-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; snapshot?: ShopHealthSnapshot | null; error?: string }
        | null;

      if (!res.ok || !json || !json.ok || !json.snapshot) {
        setError(json?.error ?? "Failed to refresh snapshot.");
        return;
      }

      const newSnapshot = json.snapshot;
      setSnapshot(newSnapshot);

      if (newSnapshot.narrativeSummary) {
        setAiProfile((prev) =>
          prev
            ? ({
                ...prev,
                summary: newSnapshot.narrativeSummary as unknown as ShopAiProfileRow["summary"],
              } as ShopAiProfileRow)
            : prev,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error during refresh.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const displaySummary =
    summaryText || "Run Shop Boost once you’ve uploaded history to see what your shop excels at.";

  return (
    <section className={`space-y-3 p-4 sm:p-5 ${cardBase}`}>
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300/70">
            Shop Health
          </p>
          <h2 className="mt-1 text-lg text-white" style={{ fontFamily: "var(--font-blackops)" }}>
            AI view of your shop
          </h2>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className={[
            "rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition",
            "border-orange-500/40 bg-orange-500/15 text-orange-100 hover:bg-orange-500/20",
            "disabled:cursor-not-allowed disabled:opacity-60",
          ].join(" ")}
        >
          {loading ? "Refreshing…" : "Refresh with AI"}
        </button>
      </header>

      <div className={`${cardInner} px-3 py-3`}>
        <p className="text-[11px] text-slate-200/80">{displaySummary}</p>

        {bootLoading ? (
          <p className="mt-2 text-[11px] text-slate-300/70">Loading latest snapshot…</p>
        ) : null}

        {error ? <p className="mt-2 text-[11px] text-rose-300">{error}</p> : null}
      </div>

      {snapshot ? (
        <div className="pt-3">
          <ShopHealthSnapshotView snapshot={snapshot} />
        </div>
      ) : null}
    </section>
  );
}

function normalizeSummary(summary: ShopAiProfileRow["summary"] | undefined): string {
  if (summary === null || summary === undefined) return "";
  if (typeof summary === "string") return summary;
  if (typeof summary === "number" || typeof summary === "boolean") return String(summary);

  if (typeof summary === "object") {
    try {
      const s = summary as Record<string, unknown>;
      const maybe = (k: string) => (typeof s[k] === "string" ? String(s[k]) : "");
      const picked = maybe("text") || maybe("summary") || maybe("narrative") || "";
      if (picked) return picked;
    } catch {
      // ignore
    }
  }

  try {
    return JSON.stringify(summary);
  } catch {
    return "";
  }
}

function mapSnapshotRowToUi(row: ShopHealthSnapshotRow): ShopHealthSnapshot | null {
  const metrics = (row.metrics ?? {}) as Record<string, unknown>;
  const totals = (metrics["totals"] ?? {}) as Record<string, unknown>;

  const totalRepairOrders =
    typeof totals["totalRepairOrders"] === "number" ? totals["totalRepairOrders"] : 0;
  const totalRevenue = typeof totals["totalRevenue"] === "number" ? totals["totalRevenue"] : 0;
  const averageRo = typeof totals["averageRo"] === "number" ? totals["averageRo"] : 0;

  return {
  shopId: row.shop_id as string,
  timeRangeDescription: buildTimeRangeDescription(
    row.period_start,
    row.period_end
  ),
  totalRepairOrders,
  totalRevenue,
  averageRo,

  mostCommonRepairs: [],
  highValueRepairs: [],
  comebackRisks: [],
  fleetMetrics: [],
  menuSuggestions: [],
  inspectionSuggestions: [],
  narrativeSummary: row.narrative_summary ?? "",

  // ✅ NEW — required by ShopHealthSnapshot
  topTechs: [],
  issuesDetected: [],
  recommendations: [],
};
}

function buildTimeRangeDescription(start: string | null, end: string | null): string {
  if (!start || !end) return "Recent history";
  const a = new Date(start);
  const b = new Date(end);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return "Recent history";
  return `${a.toLocaleDateString()} – ${b.toLocaleDateString()}`;
}