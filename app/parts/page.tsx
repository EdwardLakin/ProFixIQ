//app/parts/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SuggestedActionsPanel from "@/features/assistant/components/SuggestedActionsPanel";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];

// ---------- UI helpers ----------

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
        <line
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="currentColor"
          opacity={0.2}
        />
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

// shared card primitives (mirrors main dashboard look)
function OverviewCard({
  title,
  value,
  href,
}: {
  title: string;
  value: React.ReactNode;
  href?: string;
}) {
  const content = (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] px-4 py-4 shadow-card backdrop-blur-md transition hover:border-accent hover:shadow-glow">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),transparent_60%)] opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
          {title}
        </p>
        <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

function QuickButton({
  href,
  children,
  accent,
}: {
  href: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm text-white shadow-sm backdrop-blur-md transition ${
        accent
          ? "border-sky-500/40 bg-white/[0.03] hover:bg-sky-900/20 hover:border-sky-400"
          : "border-neutral-700 bg-white/[0.02] hover:bg-neutral-800/80"
      }`}
    >
      {children}
    </Link>
  );
}

// ---------- Page ----------
export default function PartsDashboardPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(true);

  // KPIs
  const [skuTotal, setSkuTotal] = useState<number>(0);
  const [skuNewThis7d, setSkuNewThis7d] = useState<number>(0);

  const [moves7dCount, setMoves7dCount] = useState<number>(0);
  const [moves30Spark, setMoves30Spark] = useState<number[]>([]);

  const [openRequestsCount, setOpenRequestsCount] = useState<number | null>(
    null,
  );

  // Recent moves (list)
  const [recentMoves, setRecentMoves] = useState<
    Pick<
      StockMoveRow,
      "id" | "created_at" | "reason" | "qty_change" | "part_id"
    >[]
  >([]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const d7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const d30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      // -------- parts (for SKUs + 7d new) --------
      const { data: parts, error: perr } = await supabase
        .from("parts")
        .select("id, created_at");

      if (perr) {
        // eslint-disable-next-line no-console
        console.error("[parts] load failed:", perr);
      }
      const partsRows = (parts ?? []) as Pick<
        PartRow,
        "id" | "created_at"
      >[];

      setSkuTotal(partsRows.length);

      const createdInLast7 = partsRows.filter((p) => {
        const ts = p.created_at ? new Date(p.created_at) : null;
        return !!ts && ts >= d7Ago && ts < now;
      }).length;
      setSkuNewThis7d(createdInLast7);

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
        mv.filter((m) => new Date(m.created_at) >= d7Ago).length,
      );

      // 30-day sparkline (daily net qty_change)
      const days = 30;
      const buckets = Array<number>(days).fill(0);
      for (const m of mv) {
        const dt = new Date(m.created_at);
        const idx = Math.min(
          days - 1,
          Math.max(
            0,
            Math.floor(
              (dt.getTime() - d30Ago.getTime()) / (24 * 3600 * 1000),
            ),
          ),
        );
        buckets[idx] += Number(m.qty_change ?? 0);
      }
      setMoves30Spark(buckets);

      // Recent list (latest 10, descending)
      const recent = [...mv]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )
        .slice(0, 10);
      setRecentMoves(recent);

      // -------- open parts requests count --------
      const {
        count: openCount,
        error: rerr,
      } = await supabase
        .from("part_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["requested", "quoted", "approved"] as RequestRow["status"][]);

      if (rerr) {
        // eslint-disable-next-line no-console
        console.error("[part_requests] count failed:", rerr);
        setOpenRequestsCount(0);
      } else {
        setOpenRequestsCount(openCount ?? 0);
      }

      setLoading(false);
    })();
  }, [supabase]);

  const skuTotalDisplay = loading ? "…" : skuTotal.toLocaleString();
  const newSkuDisplay = loading ? "…" : String(skuNewThis7d);
  const moves7dDisplay = loading ? "…" : moves7dCount.toLocaleString();
  const openReqDisplay =
    openRequestsCount === null || loading
      ? "…"
      : openRequestsCount.toLocaleString();
  const hasOpenRequests = (openRequestsCount ?? 0) > 0;

  return (
    <div className="relative space-y-6 p-5 text-white fade-in md:space-y-7 md:p-6">
      {/* soft gradient background for this page */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.92),#020617_70%)]"
      />

      {/* welcome panel */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 shadow-card backdrop-blur-md">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(56,189,248,0.14),transparent_45%)]" />
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">Parts command center</div>
          <h1 className="mt-1 text-2xl font-semibold text-white md:text-3xl">Parts dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-300">
            Overview of your catalog, movement, and open requests.
          </p>
        </div>
      </section>

      <SuggestedActionsPanel
        context={{
          pageType: "parts_dashboard",
          pageTitle: "Parts Dashboard",
        }}
        title="Suggested Actions for Parts"
        description="Inventory insights, restocking suggestions, request follow-ups, and procurement optimization"
       compact collapsible defaultExpanded={false} maxItems={3} hideDescription />

      {/* overview cards */}
      <section className="grid gap-3 md:grid-cols-4">
        <OverviewCard
          title="SKUs in catalog"
          value={skuTotalDisplay}
          href="/parts/inventory"
        />
        <OverviewCard
          title="New SKUs (7 days)"
          value={newSkuDisplay}
          href="/parts/inventory"
        />
        <OverviewCard
          title="Stock moves (7 days)"
          value={moves7dDisplay}
          href="/parts/inventory"
        />
        <OverviewCard
          title="Open parts requests"
          value={openReqDisplay}
          href="/parts/requests"
        />
      </section>

      {hasOpenRequests && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-950/20 px-4 py-3 shadow-[0_0_24px_rgba(14,116,144,0.22)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-sky-200/80">Bottleneck signal</div>
              <p className="text-sm text-sky-100">
                You have <span className="font-semibold">{openReqDisplay}</span> open parts request{openRequestsCount === 1 ? "" : "s"} awaiting action.
              </p>
            </div>
            <Link href="/parts/requests" className="rounded-full border border-sky-300/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-sky-100 hover:bg-sky-900/35">
              Open requests
            </Link>
          </div>
        </section>
      )}

      {/* quick actions */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">Quick actions</h2>
        <div className="flex flex-wrap gap-2">
          <QuickButton href="/parts/po" accent>
            Create PO
          </QuickButton>
          <QuickButton href="/parts/inventory">Inventory</QuickButton>
          <QuickButton href="/parts/receive">Scan to receive</QuickButton>
          <QuickButton href="/parts/requests">Requests</QuickButton>
          <QuickButton href="/parts/vendors">Vendors</QuickButton>
        </div>
      </section>

      {/* recent moves */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 shadow-card backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Recent stock moves</h2>
            <p className="text-xs text-neutral-400">
              Last 30 days of inventory activity.
            </p>
          </div>
          <Sparkline points={moves30Spark} />
        </div>

        {loading ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : recentMoves.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-700 bg-black/20 px-3 py-4 text-sm text-neutral-400">
            No recent moves in the last 30 days. Once receiving, adjustments, or issues post, movement will appear here.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-800 text-sm">
            {recentMoves.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between py-2"
              >
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
