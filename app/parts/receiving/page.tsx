"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import {
  itemFlowLabel,
  receiveProgressLabel,
  toItemFlowDisplay,
  toReceiveProgressDisplay,
} from "@/features/parts/lib/status-display";
import {
  buildPartTrustMeta,
  trustBadgeTone,
  trustLevelLabel,
  trustReasonTone,
  type PartTrustMeta,
} from "@/features/parts/lib/trust-signals";
import { partIdentifierLabel, toPartDisplaySummary } from "@/features/parts/lib/part-display";
import type { ReceiveDrawerItem } from "@/features/parts/components/ReceiveDrawer";
import { isPartRequestItemAwaitingReceiving } from "@/features/parts/lib/open-parts-obligations";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

type DB = Database;
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];

type InboxItem = {
  id: string;
  created_at: string | null;
  request_id: string;
  part_id: string | null;
  description: string;
  status: string;
  qty_approved: number;
  qty_ordered: number;
  qty_received: number;
  qty_remaining: number;
  qty_allocated: number;
  po_id: string | null;
  work_order_id: string | null;
};

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

async function resolveShopId(supabase: ReturnType<typeof createBrowserSupabase>) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";
  const { data: profA } = await supabase.from("profiles").select("shop_id").eq("user_id", uid).maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);
  const { data: profB } = await supabase.from("profiles").select("shop_id").eq("id", uid).maybeSingle();
  return String(profB?.shop_id ?? "");
}

const ReceiveDrawer = dynamic(() => import("@/features/parts/components/ReceiveDrawer"), { ssr: false });

export default function ReceivingInboxPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [shopId, setShopId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("");
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [selectedPo, setSelectedPo] = useState<string>("");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [partsMap, setPartsMap] = useState<Record<string, PartRow>>({});
  const [trustByPartId, setTrustByPartId] = useState<Record<string, PartTrustMeta>>({});
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [totalCount, setTotalCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerItem, setDrawerItem] = useState<ReceiveDrawerItem | null>(null);

  const load = async (pageToLoad = page) => {
    setLoading(true);
    setErr(null);
    const sid = shopId || (await resolveShopId(supabase));
    if (!sid) return setLoading(false);
    if (!shopId) setShopId(sid);

    const [locRes, poRes] = await Promise.all([
      supabase.from("stock_locations").select("*").eq("shop_id", sid).order("code"),
      supabase.from("purchase_orders").select("*").eq("shop_id", sid).order("created_at", { ascending: false }).limit(50),
    ]);

    const locRows = (locRes.data ?? []) as StockLoc[];
    setLocs(locRows);
    const main = locRows.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
    if (!selectedLoc && main?.id) setSelectedLoc(String(main.id));
    setPOs((poRes.data ?? []) as PurchaseOrder[]);

    const from = (pageToLoad - 1) * pageSize;
    const to = from + pageSize - 1;
    const [{ data: priRows, error: priErr }, { count: rawCount }] = await Promise.all([
      supabase
        .from("part_request_items")
        .select("id, created_at, request_id, part_id, description, status, qty_approved, qty_ordered, qty_received, qty_consumed, po_id")
        .eq("shop_id", sid)
        .not("po_id", "is", null)
        .gt("qty_ordered", 0)
        .in("status", ["partially_ordered", "ordered", "partially_received"])
        .order("created_at", { ascending: true })
        .range(from, to),
      supabase
        .from("part_request_items")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", sid)
        .not("po_id", "is", null)
        .gt("qty_ordered", 0)
        .in("status", ["partially_ordered", "ordered", "partially_received"]),
    ]);

    if (priErr) {
      setErr(priErr.message);
      return setLoading(false);
    }
    setTotalCount(rawCount ?? 0);

    const normalized: InboxItem[] = (priRows ?? [])
      .map((r) => {
        const row = r as PartRequestItemRow;
        const approved = n(row.qty_approved);
        const ordered = n(row.qty_ordered);
        const received = n(row.qty_received);
        return {
          id: String(row.id),
          created_at: row.created_at ?? null,
          request_id: String(row.request_id),
          part_id: row.part_id ?? null,
          description: String(row.description ?? ""),
          status: String(row.status ?? ""),
          qty_approved: approved,
          qty_ordered: ordered,
          qty_received: received,
          qty_remaining: Math.max(0, ordered - received),
          qty_allocated: n(row.qty_consumed),
          po_id: row.po_id ?? null,
          work_order_id: null,
        };
      })
      .filter((item) => isPartRequestItemAwaitingReceiving(item));

    setItems(normalized);
    setLastUpdated(new Date());

    const requestIds = [...new Set(normalized.map((x) => x.request_id))];
    if (requestIds.length) {
      const { data: reqRows } = await supabase.from("part_requests").select("id, work_order_id").in("id", requestIds);
      const woByReq: Record<string, string | null> = {};
      (reqRows ?? []).forEach((r) => (woByReq[String(r.id)] = r.work_order_id ?? null));
      setItems((prev) => prev.map((it) => ({ ...it, work_order_id: woByReq[it.request_id] ?? null })));
    }

    const partIds = [...new Set(normalized.map((x) => x.part_id).filter(Boolean))] as string[];
    if (partIds.length) {
      const [partRes, aliasRes, stagingRes, candRes] = await Promise.all([
        supabase.from("parts").select("*").in("id", partIds),
        supabase.from("shop_parts_source_aliases").select("part_id").in("part_id", partIds).eq("shop_id", sid),
        supabase
          .from("shop_parts_import_staging")
          .select("matched_part_id, status")
          .in("matched_part_id", partIds)
          .eq("shop_id", sid),
        supabase
          .from("shop_parts_import_match_candidates")
          .select("staging_id, candidate_part_id")
          .in("candidate_part_id", partIds)
          .eq("shop_id", sid),
      ]);

      const pMap: Record<string, PartRow> = {};
      (partRes.data ?? []).forEach((p) => (pMap[String((p as PartRow).id)] = p as PartRow));
      setPartsMap(pMap);

      const aliasCount: Record<string, number> = {};
      (aliasRes.data ?? []).forEach((r) => (aliasCount[String(r.part_id)] = (aliasCount[String(r.part_id)] ?? 0) + 1));
      const pendingCount: Record<string, number> = {};
      (stagingRes.data ?? []).forEach((r) => {
        const st = String(r.status ?? "").toLowerCase();
        if (st === "pending" || st === "review" || st === "ambiguous") {
          pendingCount[String(r.matched_part_id)] = (pendingCount[String(r.matched_part_id)] ?? 0) + 1;
        }
      });
      const candCount: Record<string, number> = {};
      (candRes.data ?? []).forEach((r) => {
        const id = String(r.candidate_part_id);
        candCount[id] = (candCount[id] ?? 0) + 1;
      });

      const tMap: Record<string, PartTrustMeta> = {};
      for (const pid of partIds) {
        const p = pMap[pid];
        const extended = p as PartRow & { import_confidence?: number | null };
        tMap[pid] = buildPartTrustMeta({
          sku: p?.sku,
          partNumber: p?.part_number ?? null,
          normalizedPartKey: p?.normalized_part_key ?? null,
          sourceIntakeId: p?.source_intake_id ?? null,
          importConfidence: extended?.import_confidence ?? null,
          aliasCount: aliasCount[pid] ?? 0,
          ambiguousCandidateCount: (candCount[pid] ?? 0) > 1 ? candCount[pid] : 0,
          pendingStagingCount: pendingCount[pid] ?? 0,
        });
      }
      setTrustByPartId(tMap);
    } else {
      setPartsMap({});
      setTrustByPartId({});
    }

    setLoading(false);
  };

  useEffect(() => {
    void load(page);
  }, [page]);

  useEffect(() => {
    const handler = () => void load(page);
    window.addEventListener("parts:received", handler as EventListener);
    return () => window.removeEventListener("parts:received", handler as EventListener);
  }, [page]);

  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const locOptions = locs.map((l) => ({ value: String(l.id), label: `${l.code ?? "LOC"} — ${l.name ?? ""}` }));
  const poOptions = pos.map((po) => ({ value: String(po.id), label: `${String(po.id).slice(0, 8)} • ${String(po.status ?? "draft")}` }));

  return (
    <PageShell
      eyebrow="Parts · Receiving lens"
      title="Receiving Inbox"
      description="Shared receive flow for request items with consistent status and trust context."
      actions={<button onClick={() => void load(page)} className={ui.buttonSecondary}>Refresh</button>}
    >
      <div className="space-y-4 text-[color:var(--theme-text-primary)]">

      <div className="text-xs text-[color:var(--theme-text-muted)]">
        Last updated <span className="text-[color:var(--theme-text-secondary)]">{lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}</span> · {lastUpdated && nowTs - lastUpdated.getTime() > 120000 ? <span className="text-[color:var(--theme-text-secondary)]">stale</span> : <span className="text-emerald-300">fresh</span>}
      </div>

      <div className="desktop-toolbar-row p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <select className={ui.input} value={selectedLoc} onChange={(e) => setSelectedLoc(e.target.value)}>
            {locs.map((l) => <option key={String(l.id)} value={String(l.id)}>{l.code ?? "LOC"} — {l.name ?? ""}</option>)}
          </select>
          <select className={ui.input} value={selectedPo} onChange={(e) => setSelectedPo(e.target.value)}>
            <option value="">PO optional</option>
            {pos.map((po) => <option key={String(po.id)} value={String(po.id)}>{String(po.id).slice(0, 8)} • {String(po.status ?? "draft")}</option>)}
          </select>
          <div className="text-xs text-[color:var(--theme-text-muted)] flex items-center">Rows where remaining qty is greater than zero.</div>
        </div>
      </div>

      {err ? <div className="desktop-panel-soft border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{err}</div> : null}
      {loading ? <div className={ui.loadingState}>Loading…</div> : null}

      {!loading && items.length > 0 ? (
        <div className="desktop-panel-soft overflow-hidden">
          <div className="border-b border-[color:var(--desktop-border)] px-4 py-3 text-xs text-[color:var(--theme-text-muted)]">{items.length} of {totalCount} rows loaded · page {page}</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[color:var(--theme-text-secondary)]"><th className="p-3">Part / Context</th><th className="p-3">Receive state</th><th className="p-3">Qty</th><th className="p-3"/></tr></thead>
            <tbody>
              {items.map((it) => {
                const p = it.part_id ? partsMap[it.part_id] : null;
                const partSummary = p ? toPartDisplaySummary(p) : null;
                const trust = it.part_id ? trustByPartId[it.part_id] : undefined;
                const itemState = toItemFlowDisplay({ rawStatus: it.status, qtyApproved: it.qty_approved, qtyReceived: it.qty_received, qtyAllocated: it.qty_allocated });
                const recvState = toReceiveProgressDisplay({ qtyApproved: it.qty_ordered, qtyReceived: it.qty_received, qtyAllocated: it.qty_allocated });
                return (
                  <tr key={it.id} className="border-t border-[color:var(--desktop-border)] align-top">
                    <td className="p-3.5">
                      <div className="font-semibold text-[color:var(--theme-text-primary)]">{partSummary?.name ?? it.description}</div>
                      <div className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                        {partSummary && partSummary.labeledIdentifiers.length > 0 ? `${partIdentifierLabel(partSummary)} · ` : ""}
                        {itemFlowLabel(itemState)} · {receiveProgressLabel(recvState)} {it.work_order_id ? <>· <Link className="text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]" href={`/work-orders/${encodeURIComponent(it.work_order_id)}`}>WO {it.work_order_id.slice(0,8)}</Link></> : null}
                      </div>
                      {trust && trust.reasons.length > 0 ? <div className={`mt-1 text-[11px] ${trustReasonTone(trust.level)}`}>{trust.reasons.slice(0,2).join(" · ")}</div> : null}
                    </td>
                    <td className="p-3.5">
                      <span className="desktop-link-chip">{receiveProgressLabel(recvState)}</span>
                      {trust ? <span className={`ml-2 inline-flex rounded-full border px-2 py-1 text-xs ${trustBadgeTone(trust.level)}`}>{trustLevelLabel(trust.level)}</span> : null}
                    </td>
                    <td className="p-3.5 tabular-nums text-[color:var(--theme-text-primary)]">{it.qty_received} / {it.qty_ordered} ordered <span className="text-[color:var(--theme-text-muted)]">({it.qty_remaining} rem)</span></td>
                    <td className="p-3.5"><button onClick={() => {setDrawerItem({ ...it, part_name: partSummary?.name ?? null, sku: partSummary?.sku ?? null, trust_level: trust?.level, trust_reasons: trust?.reasons ?? [] }); setDrawerOpen(true);}} className="rounded-lg border border-sky-500/35 px-3 py-1 text-sky-200">Receive</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex justify-between border-t border-[color:var(--desktop-border)] p-3 text-xs"><button className="desktop-link-chip" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button><button className="desktop-link-chip" disabled={items.length < pageSize} onClick={() => setPage((p) => p + 1)}>Next</button></div>
        </div>
      ) : null}

      {!loading && items.length === 0 ? <div className={ui.emptyState}>No outstanding receive items.</div> : null}

      <ReceiveDrawer open={drawerOpen} item={drawerItem} onClose={() => { setDrawerOpen(false); setDrawerItem(null); void load(); }} locations={locOptions} defaultLocationId={selectedLoc || locOptions[0]?.value || ""} purchaseOrders={poOptions} defaultPoId={selectedPo || ""} />
      </div>
    </PageShell>
  );
}
