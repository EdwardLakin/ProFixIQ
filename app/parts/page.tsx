"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];

// ---------- UI helpers ----------
function TrendArrow({ delta }: { delta: number }) {
  if (delta > 0) return <span className="text-emerald-400">▲ {delta}</span>;
  if (delta < 0) return <span className="text-red-400">▼ {Math.abs(delta)}</span>;
  return <span className="text-neutral-400">—</span>;
}

function Sparkline({
  points,
  width = 120,
  height = 28,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (!points.length) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="currentColor" opacity={0.2} />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / Math.max(1, points.length - 1);
  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={path} fill="none" stroke="currentColor" />
    </svg>
  );
}

// ---------- Page ----------
export default function PartsDashboardPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(true);

  // KPIs
  const [skuTotal, setSkuTotal] = useState<number>(0);
  const [skuNewThis7d, setSkuNewThis7d] = useState<number>(0);
  const [skuTrendVsPrev7d, setSkuTrendVsPrev7d] = useState<number>(0);

  const [moves7dCount, setMoves7dCount] = useState<number>(0);
  const [moves30Spark, setMoves30Spark] = useState<number[]>([]);

  // Recent moves (list)
  const [recentMoves, setRecentMoves] = useState<
    Pick<StockMoveRow, "id" | "created_at" | "reason" | "qty_change" | "part_id">[]
  >([]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const d7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const d14Ago = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
      const d30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      // -------- parts (for SKUs + trend) --------
      const { data: parts, error: perr } = await supabase
        .from("parts")
        .select("id, created_at");
      if (perr) {
        // eslint-disable-next-line no-console
        console.error("[parts] load failed:", perr);
      }
      const partsRows = (parts ?? []) as Pick<PartRow, "id" | "created_at">[];

      setSkuTotal(partsRows.length);

      const createdIn = (start: Date, end: Date) =>
        partsRows.filter((p) => {
          const ts = p.created_at ? new Date(p.created_at) : null;
          return !!ts && ts >= start && ts < end;
        }).length;

      const this7 = createdIn(d7Ago, now);
      const prev7 = createdIn(d14Ago, d7Ago);
      setSkuNewThis7d(this7);
      setSkuTrendVsPrev7d(this7 - prev7);

      // -------- stock_moves (for 7d count + 30d sparkline + list) --------
      const { data: moves, error: merr } = await supabase
        .from("stock_moves")
        .select("id, part_id, qty_change, reason, created_at")
        .gte("created_at", d30Ago.toISOString())
        .order("created_at", { ascending: true });

      if (merr) {
        // eslint-disable-next-line no-console
        console.error("[stock_moves] load failed:", merr);
      }

      const mv = (moves ?? []) as Pick<
        StockMoveRow,
        "id" | "part_id" | "qty_change" | "reason" | "created_at"
      >[];

      // 7d moves count
      setMoves7dCount(
        mv.filter((m) => new Date(m.created_at) >= d7Ago).length
      );

      // 30-day sparkline (daily net qty_change)
      const days = 30;
      const buckets = Array<number>(days).fill(0);
      for (const m of mv) {
        const dt = new Date(m.created_at);
        const idx = Math.min(
          days - 1,
          Math.max(0, Math.floor((dt.getTime() - d30Ago.getTime()) / (24 * 3600 * 1000)))
        );
        buckets[idx] += Number(m.qty_change ?? 0);
      }
      setMoves30Spark(buckets);

      // Recent list (latest 10, descending)
      const recent = [...mv]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);
      setRecentMoves(recent);

      setLoading(false);
    })();
  }, [supabase]);

  return (
    <div className="p-6 space-y-6 text-white">
      <h1 className="text-2xl font-bold">Parts Dashboard</h1>

      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* SKUs */}
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">SKUs (new last 7d)</div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-xl font-semibold">{skuTotal.toLocaleString()}</div>
            <TrendArrow delta={skuTrendVsPrev7d} />
            <span className="text-xs text-neutral-500">+{skuNewThis7d} this week</span>
          </div>
        </div>

        {/* Low Stock – not available with current schema; placeholder keeps layout */}
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">Low Stock</div>
          <div className="mt-1 text-xl font-semibold">—</div>
          <div className="text-xs text-neutral-500">requires on-hand/threshold</div>
        </div>

        {/* Inventory Value – depends on on-hand; placeholder for now */}
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-xs text-neutral-400">Inventory Value</div>
          <div className="mt-1 text-xl font-semibold">—</div>
          <div className="text-xs text-neutral-500">needs stock levels</div>
        </div>

        {/* Moves (7d) with 30-day sparkline */}
        <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-400">Moves (7d)</div>
            <Sparkline points={moves30Spark} />
          </div>
          <div className="mt-1 text-xl font-semibold">{moves7dCount.toLocaleString()}</div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded border border-orange-500 px-3 py-2 text-sm" href="/parts/po">
            Create PO
          </Link>
          <Link className="rounded border border-neutral-700 px-3 py-2 text-sm" href="/parts/inventory">
            Inventory
          </Link>
          <Link className="rounded border border-neutral-700 px-3 py-2 text-sm" href="/parts/receive">
            Scan to Receive
          </Link>
          <Link className="rounded border border-neutral-700 px-3 py-2 text-sm" href="/parts/requests">
            Requests
          </Link>
          <Link className="rounded border border-neutral-700 px-3 py-2 text-sm" href="/parts/vendors">
            Vendors
          </Link>
        </div>
      </section>

      {/* Recent Stock Moves */}
      <section className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="mb-2 text-lg font-semibold">Recent Stock Moves</h2>
        {loading ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : recentMoves.length === 0 ? (
          <div className="text-sm text-neutral-400">No recent moves</div>
        ) : (
          <ul className="divide-y divide-neutral-800 text-sm">
            {recentMoves.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    {String(m.reason ?? "move").replaceAll("_", " ")}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(m.created_at as string).toLocaleString()}
                  </div>
                </div>
                <div className="pl-3 font-semibold">
                  {Number(m.qty_change ?? 0) >= 0 ? "+" : ""}
                  {Number(m.qty_change ?? 0)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}