// features/shops/components/OwnerShopHealthWidget.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import type { ShopHealthSnapshot } from "@/features/integrations/ai/shopBoostType";
import ShopHealthSnapshotView from "@/features/shops/components/ShopHealthSnapshot";

type DB = Database;
type ShopAiProfileRow = DB["public"]["Tables"]["shop_ai_profiles"]["Row"];

type Props = {
  shopId: string;
};

export default function OwnerShopHealthWidget({ shopId }: Props) {
  const supabase = createClientComponentClient<DB>();

  const [aiProfile, setAiProfile] = useState<ShopAiProfileRow | null>(null);
  const [snapshot, setSnapshot] = useState<ShopHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing AI profile (summary) for this shop
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error: profileErr } = await supabase
        .from("shop_ai_profiles")
        .select("*")
        .eq("shop_id", shopId)
        .maybeSingle();

      if (cancelled) return;

      if (profileErr) {
        console.error("Failed to load shop_ai_profiles", profileErr);
        return;
      }

      if (data) {
        setAiProfile(data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, supabase]);

  const summaryText = useMemo(
    () => normalizeSummary(aiProfile?.summary),
    [aiProfile?.summary],
  );

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/shop-boost/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId }),
      });

      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            snapshot?: ShopHealthSnapshot | null;
            error?: string;
          }
        | null;

      if (!res.ok || !json || !json.ok || !json.snapshot) {
        setError(json?.error ?? "Failed to refresh snapshot.");
        return;
      }

      const newSnapshot = json.snapshot;
      setSnapshot(newSnapshot);

      // Also update local summary so future loads match DB
      if (newSnapshot.narrativeSummary) {
        setAiProfile((prev) =>
          prev
            ? {
                ...prev,
                // summary is a JSON column; store plain string narrative
                summary: newSnapshot.narrativeSummary as unknown as ShopAiProfileRow["summary"],
              }
            : prev,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unexpected error during refresh.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const displaySummary =
    summaryText ||
    "Run Shop Boost once you’ve uploaded history to see what your shop already excels at.";

  return (
    <section className="space-y-3 rounded-3xl border border-white/10 bg-black/40 p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">
            Shop Health
          </p>
          <h2
            className="mt-1 text-lg text-neutral-100"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            AI view of your shop
          </h2>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="rounded-md bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh with AI"}
        </button>
      </header>

      <p className="mt-3 text-[11px] text-neutral-300">{displaySummary}</p>

      {error && (
        <p className="mt-2 text-[11px] text-red-400">
          {error}
        </p>
      )}

      {snapshot && (
        <div className="pt-3">
          <ShopHealthSnapshotView snapshot={snapshot} />
        </div>
      )}
    </section>
  );
}

/**
 * Normalize the JSON `summary` column into a plain string for React.
 */
function normalizeSummary(
  summary: ShopAiProfileRow["summary"] | undefined,
): string {
  if (summary === null || summary === undefined) return "";
  if (typeof summary === "string") return summary;
  if (typeof summary === "number" || typeof summary === "boolean") {
    return String(summary);
  }

  try {
    return JSON.stringify(summary);
  } catch {
    return "";
  }
}