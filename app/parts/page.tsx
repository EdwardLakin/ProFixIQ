//app/parts/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import SuggestedActionsPanel from "@/features/assistant/components/SuggestedActionsPanel";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockMoveRow = DB["public"]["Tables"]["stock_moves"]["Row"];
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type TrustExtendedPart = {
  part_number?: string | null;
  normalized_part_key?: string | null;
  import_confidence?: number | null;
};

type RecentMove = Pick<StockMoveRow, "id" | "created_at" | "reason" | "qty_change" | "part_id" | "reference_kind" | "reference_id">;
type TrustSummary = { lowTrust: number; reviewStaging: number; ambiguousCandidates: number };

function Sparkline({ points, width = 120, height = 28 }: { points: number[]; width?: number; height?: number }) {
  if (!points.length) return <svg width={width} height={height} aria-hidden><line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke="currentColor" opacity={0.2} /></svg>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / Math.max(1, points.length - 1);
  const path = points.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${(height - ((v - min) / range) * height).toFixed(2)}`).join(" ");
  return <svg width={width} height={height} aria-hidden><path d={path} fill="none" stroke="currentColor" /></svg>;
}

function OverviewCard({ title, value, href, hint }: { title: string; value: React.ReactNode; href?: string; hint?: string }) {
  const content = (
    <div className={`${ui.itemCard} group px-4 py-4 transition hover:border-[color:var(--brand-accent,#E39A6E)]`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">{title}</p>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-neutral-500">{hint}</div> : null}
    </div>
  );
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

function ActionButton({ href, children, emphasis }: { href: string; children: React.ReactNode; emphasis?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium text-white transition ${
        emphasis
          ? ui.buttonPrimary
          : ui.buttonSecondary
      }`}
    >
      {children}
    </Link>
  );
}

function moveTone(qty: number): string {
  if (qty > 0) return "text-emerald-200 bg-emerald-950/20 border-emerald-500/25";
  if (qty < 0) return "text-rose-200 bg-rose-950/20 border-rose-500/25";
  return "text-neutral-300 bg-white/[0.03] border-white/10";
}

function sourceLabel(kind: string | null, reason: string | null): string {
  const key = String(kind ?? "").toLowerCase();
  if (key === "purchase_order") return "PO receive";
  if (key === "request_receive") return "Request receive";
  if (key === "manual_receive") return "Manual receive";
  if (key === "work_order") return "Work order allocation";
  return String(reason ?? (key || "movement")).replaceAll("_", " ");
}

export default function PartsDashboardPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [loading, setLoading] = useState(true);
  const [skuTotal, setSkuTotal] = useState(0);
  const [skuNewThis7d, setSkuNewThis7d] = useState(0);
  const [moves7dCount, setMoves7dCount] = useState(0);
  const [moves30Spark, setMoves30Spark] = useState<number[]>([]);
  const [openRequestsCount, setOpenRequestsCount] = useState<number | null>(null);
  const [openPoCount, setOpenPoCount] = useState<number | null>(null);
  const [receiveQueueCount, setReceiveQueueCount] = useState<number | null>(null);
  const [trustSummary, setTrustSummary] = useState<TrustSummary>({ lowTrust: 0, reviewStaging: 0, ambiguousCandidates: 0 });
  const [partNameById, setPartNameById] = useState<Record<string, { name: string | null; sku: string | null }>>({});
  const [recentMoves, setRecentMoves] = useState<RecentMove[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const now = new Date();
      const d7Ago = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const d30Ago = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

      const [partsRes, movesRes, openReqRes, openPoRes, receiveQueueRes, stagingRes, candidateRes] = await Promise.all([
        supabase.from("parts").select("id, created_at, sku, part_number, normalized_part_key, import_confidence, source_intake_id"),
        supabase
          .from("stock_moves")
          .select("id, part_id, qty_change, reason, created_at, reference_kind, reference_id")
          .gte("created_at", d30Ago.toISOString())
          .order("created_at", { ascending: true }),
        supabase.from("part_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "quoted", "approved"] as RequestRow["status"][]),
        supabase.from("purchase_orders").select("id", { count: "exact", head: true }).in("status", ["draft", "sent", "partially_received"]),
        supabase.from("part_request_items").select("qty_approved, qty_received").gt("qty_approved", 0),
        supabase.from("shop_parts_import_staging").select("status"),
        supabase.from("shop_parts_import_match_candidates").select("staging_id, candidate_part_id"),
      ]);

      const partsRows = (partsRes.data ?? []) as Array<Pick<PartRow, "id" | "created_at" | "sku"> & TrustExtendedPart>;

      setSkuTotal(partsRows.length);
      setSkuNewThis7d(partsRows.filter((p) => !!p.created_at && new Date(p.created_at) >= d7Ago && new Date(p.created_at) < now).length);

      const lowTrust = partsRows.filter((p) => !p.sku?.trim() || !p.part_number?.trim() || !p.normalized_part_key?.trim() || (typeof p.import_confidence === "number" && p.import_confidence < 0.75)).length;
      const reviewStaging = (stagingRes.data ?? []).filter((s) => ["pending", "review", "ambiguous"].includes(String(s.status ?? "").toLowerCase())).length;
      const candidateCounts: Record<string, number> = {};
      for (const row of candidateRes.data ?? []) {
        const key = String(row.staging_id ?? row.candidate_part_id ?? "");
        if (!key) continue;
        candidateCounts[key] = (candidateCounts[key] ?? 0) + 1;
      }
      const ambiguousCandidates = Object.values(candidateCounts).filter((count) => count > 1).length;
      setTrustSummary({ lowTrust, reviewStaging, ambiguousCandidates });

      const mv = (movesRes.data ?? []) as RecentMove[];
      setMoves7dCount(mv.filter((m) => new Date(String(m.created_at)) >= d7Ago).length);
      const buckets = Array<number>(30).fill(0);
      for (const m of mv) {
        const dt = new Date(String(m.created_at));
        const idx = Math.min(29, Math.max(0, Math.floor((dt.getTime() - d30Ago.getTime()) / (24 * 3600 * 1000))));
        buckets[idx] += Number(m.qty_change ?? 0);
      }
      setMoves30Spark(buckets);
      const recent = [...mv].sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime()).slice(0, 12);
      setRecentMoves(recent);

      const partIds = [...new Set(recent.map((x) => String(x.part_id ?? "")).filter(Boolean))];
      if (partIds.length) {
        const partInfo = await supabase.from("parts").select("id, name, sku").in("id", partIds);
        const map: Record<string, { name: string | null; sku: string | null }> = {};
        for (const p of partInfo.data ?? []) map[String(p.id)] = { name: p.name ?? null, sku: p.sku ?? null };
        setPartNameById(map);
      } else {
        setPartNameById({});
      }

      setOpenRequestsCount(openReqRes.count ?? 0);
      setOpenPoCount(openPoRes.count ?? 0);
      const receiveQueue = (receiveQueueRes.data ?? []).filter((r) => Number(r.qty_received ?? 0) < Number(r.qty_approved ?? 0)).length;
      setReceiveQueueCount(receiveQueue);
      setLoading(false);
    })();
  }, [supabase]);

  const openReqDisplay = openRequestsCount == null || loading ? "…" : openRequestsCount.toLocaleString();
  const hasOpenRequests = (openRequestsCount ?? 0) > 0;

  return (
    <div className="relative p-5 text-white fade-in md:p-6">
      <PageShell
        title="Parts Dashboard"
        eyebrow="Parts command center"
        description="Prioritize open requests, receiving, and recent movement from one operational surface."
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionButton href="/parts/requests" emphasis>Open requests</ActionButton>
            <ActionButton href="/parts/receiving">Receiving inbox</ActionButton>
          </div>
        }
      >
      <div className="space-y-4 md:space-y-5">

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard title="SKUs in catalog" value={loading ? "…" : skuTotal.toLocaleString()} href="/parts/inventory" />
        <OverviewCard title="New SKUs (7d)" value={loading ? "…" : skuNewThis7d} href="/parts/inventory" />
        <OverviewCard title="Stock moves (7d)" value={loading ? "…" : moves7dCount.toLocaleString()} hint="Receive, adjust, consume" href="/parts/movements" />
        <OverviewCard title="Open part requests" value={openReqDisplay} href="/parts/requests" />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="desktop-panel-soft px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-300">Operational bottleneck</div>
              <p className="text-sm text-neutral-200">{hasOpenRequests ? <>You have <span className="font-semibold">{openReqDisplay}</span> open parts request{openRequestsCount === 1 ? "" : "s"} pending fulfillment flow.</> : "No open parts request bottlenecks right now."}</p>
            </div>
            <ActionButton href="/parts/requests" emphasis>{hasOpenRequests ? "Resolve request queue" : "Review requests"}</ActionButton>
          </div>
        </div>

        <div className="desktop-panel-soft p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-neutral-400">Primary actions</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ActionButton href="/parts/po" emphasis>Create PO</ActionButton>
            <ActionButton href="/parts/requests">Open requests</ActionButton>
            <ActionButton href="/parts/receiving">Receiving inbox</ActionButton>
            <ActionButton href="/parts/receive">Scan to receive</ActionButton>
            <ActionButton href="/parts/inventory">Inventory</ActionButton>
            <ActionButton href="/parts/po/receive">Purchase orders</ActionButton>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.2fr_1fr]">
        <SuggestedActionsPanel
          context={{ pageType: "parts_dashboard", pageTitle: "Parts Dashboard" }}
          title="Urgent suggested actions"
          description="Compact triage queue for procurement and receiving"
          compact
          collapsible
          defaultExpanded
          maxItems={5}
          hideDescription
        />

        <div className="desktop-panel-soft px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-300">Operational insights</h2>
              <p className="text-xs text-neutral-500">Live queues and catalog trust posture.</p>
            </div>
            <Sparkline points={moves30Spark} />
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="desktop-item-card flex items-center justify-between px-3 py-2"><span className="text-neutral-300">Receive queue</span><span className="font-semibold">{loading ? "…" : (receiveQueueCount ?? 0).toLocaleString()}</span></div>
            <div className="desktop-item-card flex items-center justify-between px-3 py-2"><span className="text-neutral-300">Open purchase orders</span><span className="font-semibold">{loading ? "…" : (openPoCount ?? 0).toLocaleString()}</span></div>
            <div className="desktop-item-card flex items-center justify-between px-3 py-2"><span className="text-neutral-300">Low-trust catalog records</span><span className="font-semibold text-rose-200">{loading ? "…" : trustSummary.lowTrust.toLocaleString()}</span></div>
            <div className="desktop-item-card flex items-center justify-between px-3 py-2"><span className="text-neutral-300">Review-needed imports</span><span className="font-semibold text-sky-200">{loading ? "…" : trustSummary.reviewStaging.toLocaleString()}</span></div>
            <div className="desktop-item-card flex items-center justify-between px-3 py-2"><span className="text-neutral-300">Ambiguous match candidates</span><span className="font-semibold text-sky-200">{loading ? "…" : trustSummary.ambiguousCandidates.toLocaleString()}</span></div>
          </div>
        </div>
      </section>

      <section className="desktop-panel-soft px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Recent stock moves</h2>
            <p className="text-xs text-neutral-400">Most recent inventory movement with source traceability.</p>
          </div>
          <Link href="/parts/movements" className={ui.buttonSecondary}>View ledger</Link>
        </div>

        {loading ? (
          <div className="text-sm text-neutral-400">Loading…</div>
        ) : recentMoves.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-700 bg-black/20 px-3 py-4 text-sm text-neutral-400">No recent moves in the last 30 days.</div>
        ) : (
          <ul className="divide-y divide-neutral-800 text-sm">
            {recentMoves.map((m) => {
              const qty = Number(m.qty_change ?? 0);
              const part = partNameById[String(m.part_id)] ?? null;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-100">{part?.name ?? String(m.reason ?? "move").replaceAll("_", " ")}</div>
                    <div className="text-xs text-neutral-500">{part?.sku ? `${part.sku} · ` : ""}{sourceLabel(m.reference_kind ?? null, m.reason ?? null)} · {new Date(String(m.created_at)).toLocaleString()}</div>
                  </div>
                  <div className={`inline-flex min-w-[72px] items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold ${moveTone(qty)}`}>{qty >= 0 ? "+" : ""}{qty}</div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>
      </PageShell>
    </div>
  );
}
