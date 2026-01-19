// app/parts/receiving/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];
type PurchaseOrder = DB["public"]["Tables"]["purchase_orders"]["Row"];
type PartRequestItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];

type InboxItem = {
  id: string;
  created_at: string | null;
  shop_id: string | null;
  request_id: string;
  part_id: string | null;
  description: string;
  status: string;
  qty_approved: number;
  qty_received: number;
  qty_remaining: number;
};

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

async function resolveShopId(supabase: ReturnType<typeof createClientComponentClient<DB>>) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";

  const { data: profA } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", uid)
    .maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);

  const { data: profB } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", uid)
    .maybeSingle();

  return String(profB?.shop_id ?? "");
}

const ReceiveDrawer = dynamic(() => import("@/features/parts/components/ReceiveDrawer"), {
  ssr: false,
});

type DrawerItem = {
  id: string;
  created_at?: string | null;
  request_id?: string | null;
  part_id?: string | null;
  description?: string | null;
  status?: string | null;
  qty_approved?: number | null;
  qty_received?: number | null;
  qty_remaining?: number | null;
  part_name?: string | null;
  sku?: string | null;
};

export default function ReceivingInboxPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [shopId, setShopId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [selectedLoc, setSelectedLoc] = useState<string>("");

  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [selectedPo, setSelectedPo] = useState<string>("");

  const [items, setItems] = useState<InboxItem[]>([]);
  const [partsMap, setPartsMap] = useState<Record<string, PartRow>>({});

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerItem, setDrawerItem] = useState<DrawerItem | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const sid = shopId || (await resolveShopId(supabase));
    if (!sid) {
      setLoading(false);
      return;
    }
    if (!shopId) setShopId(sid);

    const [locRes, poRes] = await Promise.all([
      supabase.from("stock_locations").select("*").eq("shop_id", sid).order("code"),
      supabase
        .from("purchase_orders")
        .select("*")
        .eq("shop_id", sid)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (locRes.error) setErr(locRes.error.message);
    if (poRes.error) setErr(poRes.error.message);

    const locRows = (locRes.data ?? []) as StockLoc[];
    setLocs(locRows);

    const main = locRows.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
    if (!selectedLoc && main?.id) setSelectedLoc(String(main.id));

    setPOs((poRes.data ?? []) as PurchaseOrder[]);

    const { data: priRows, error: priErr } = await supabase
      .from("part_request_items")
      .select("id, created_at, shop_id, request_id, part_id, description, status, qty_approved, qty_received")
      .eq("shop_id", sid)
      .order("created_at", { ascending: true })
      .limit(200);

    if (priErr) {
      setErr(priErr.message);
      setItems([]);
      setLoading(false);
      return;
    }

    const normalized: InboxItem[] = (priRows ?? [])
      .map((r) => {
        const approved = n((r as PartRequestItemRow).qty_approved);
        const received = n((r as PartRequestItemRow).qty_received);
        const remaining = Math.max(0, approved - received);

        return {
          id: String((r as PartRequestItemRow).id),
          created_at: (r as PartRequestItemRow).created_at ?? null,
          shop_id: (r as PartRequestItemRow).shop_id ?? null,
          request_id: String((r as PartRequestItemRow).request_id),
          part_id: ((r as PartRequestItemRow).part_id as string | null) ?? null,
          description: String((r as PartRequestItemRow).description ?? ""),
          status: String((r as PartRequestItemRow).status ?? ""),
          qty_approved: approved,
          qty_received: received,
          qty_remaining: remaining,
        };
      })
      .filter((x) => x.qty_approved > 0 && x.qty_remaining > 0);

    setItems(normalized);

    const partIds = Array.from(new Set(normalized.map((x) => x.part_id).filter(Boolean))) as string[];
    if (partIds.length) {
      const { data: partRows, error: pErr } = await supabase.from("parts").select("*").in("id", partIds);
      if (pErr) setErr(pErr.message);

      const map: Record<string, PartRow> = {};
      (partRows ?? []).forEach((p) => {
        map[String((p as PartRow).id)] = p as PartRow;
      });
      setPartsMap(map);
    } else {
      setPartsMap({});
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // any drawer receive triggers refresh via event
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("parts:received", handler as EventListener);
    return () => window.removeEventListener("parts:received", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDrawerFor = (it: InboxItem) => {
    const p = it.part_id ? partsMap[it.part_id] : null;

    setDrawerItem({
      id: it.id,
      created_at: it.created_at,
      request_id: it.request_id,
      part_id: it.part_id,
      description: it.description,
      status: it.status,
      qty_approved: it.qty_approved,
      qty_received: it.qty_received,
      qty_remaining: it.qty_remaining,
      part_name: p?.name ? String(p.name) : null,
      sku: p?.sku ? String(p.sku) : null,
    });

    setDrawerOpen(true);
  };

  const card =
    "metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  const locOptions = locs.map((l) => ({
    value: String(l.id),
    label: `${String(l.code ?? "LOC")} — ${String(l.name ?? "")}`,
  }));

  const poOptions = pos.map((po) => ({
    value: String(po.id),
    label: `${String(po.id).slice(0, 8)} • ${String(po.status ?? "draft")}`,
  }));

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-neutral-400">Parts</div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
            Receiving Inbox
          </h1>
          <div className="text-sm text-neutral-400">Receive against a specific request item (supports partial receiving).</div>
        </div>

        <button
          onClick={() => void load()}
          className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-4 py-2 text-sm text-neutral-100 hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-black/70"
        >
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className={`${card} p-4`}>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="mb-1 text-xs text-neutral-400">Location</div>
            <select
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-2 text-sm text-white"
              value={selectedLoc}
              onChange={(e) => setSelectedLoc(e.target.value)}
            >
              {locs.map((l) => (
                <option key={String(l.id)} value={String(l.id)}>
                  {String(l.code ?? "LOC")} — {String(l.name ?? "")}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 text-xs text-neutral-400">PO (optional)</div>
            <select
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-2 text-sm text-white"
              value={selectedPo}
              onChange={(e) => setSelectedPo(e.target.value)}
            >
              <option value="">— none —</option>
              {pos.map((po) => (
                <option key={String(po.id)} value={String(po.id)}>
                  {String(po.id).slice(0, 8)} • {String(po.status ?? "draft")}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-neutral-500">
              If selected, we attribute receiving to that PO via the RPC.
            </div>
          </div>

          <div className="flex items-end">
            <div className="text-[11px] text-neutral-500">
              Showing items where <span className="text-neutral-200">qty_received &lt; qty_approved</span>.
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{err}</div>
      ) : null}

      {loading ? (
        <div className={`${card} p-4 text-sm text-neutral-400`}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={`${card} p-4 text-sm text-neutral-400`}>No outstanding receive items.</div>
      ) : (
        <div className={`${card} overflow-hidden`}>
          <div className="border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">Outstanding items</div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="p-3">Part</th>
                  <th className="p-3">Approved</th>
                  <th className="p-3">Received</th>
                  <th className="p-3">Remaining</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const p = it.part_id ? partsMap[it.part_id] : null;
                  const sku = (p?.sku as string | null) ?? null;

                  return (
                    <tr key={it.id} className="border-t border-white/10">
                      <td className="p-3">
                        <div className="font-semibold text-neutral-100">{p?.name ? String(p.name) : it.description}</div>
                        <div className="text-[11px] text-neutral-500">
                          {sku ? `${sku} • ` : ""}
                          {it.part_id ? String(it.part_id).slice(0, 8) : "no part_id"}
                          {" • "}
                          status: <span className="text-neutral-300">{it.status}</span>
                        </div>
                      </td>
                      <td className="p-3 tabular-nums">{it.qty_approved}</td>
                      <td className="p-3 tabular-nums">{it.qty_received}</td>
                      <td className="p-3 tabular-nums">{it.qty_remaining}</td>
                      <td className="p-3">
                        <button
                          onClick={() => openDrawerFor(it)}
                          className="rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-4 py-2 text-sm font-semibold text-neutral-50 hover:border-[color:var(--accent-copper-light,#fed7aa)]"
                        >
                          Open receive →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/10 px-4 py-3 text-[11px] text-neutral-500">
            Notes: This flow calls <span className="text-neutral-200">receive_part_request_item</span> RPC and refreshes automatically via{" "}
            <span className="text-neutral-200">parts:received</span>.
          </div>
        </div>
      )}

      <ReceiveDrawer
        open={drawerOpen}
        item={drawerItem}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerItem(null);
          void load();
        }}
        locations={locOptions}
        defaultLocationId={selectedLoc || locOptions[0]?.value || ""}
        purchaseOrders={poOptions}
        defaultPoId={selectedPo ? selectedPo : ""}
        lockLocation={false}
        lockPo={false}
      />
    </div>
  );
}