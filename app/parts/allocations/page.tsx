"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { partIdentifierLabel, toPartDisplaySummary } from "@/features/parts/lib/part-display";
import PageShell from "@/features/shared/components/PageShell";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

type DB = Database;
type Alloc = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartLite = Pick<DB["public"]["Tables"]["parts"]["Row"], "id" | "name" | "sku" | "part_number" | "category" | "price">;
type LocLite = Pick<DB["public"]["Tables"]["stock_locations"]["Row"], "id" | "code" | "name">;
type WoLite = Pick<DB["public"]["Tables"]["work_orders"]["Row"], "id" | "custom_id">;
type ReqItemLite = Pick<DB["public"]["Tables"]["part_request_items"]["Row"], "id" | "request_id" | "po_id">;
type MoveLite = Pick<DB["public"]["Tables"]["stock_moves"]["Row"], "id" | "reference_kind" | "reference_id" | "reason">;

type AllocationView = { a: Alloc; part?: PartLite; loc?: LocLite; wo?: WoLite | null; req?: ReqItemLite | null; move?: MoveLite | null };

function movementReasonLabel(reason: string | null | undefined): string {
  const key = String(reason ?? "").toLowerCase();
  if (key === "wo_allocate" || key === "consume") return "Allocated to work order";
  if (key === "request_receive") return "Received for request item";
  return key ? key.replaceAll("_", " ") : "—";
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

export default function AllocationsPage(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [shopId, setShopId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AllocationView[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const sid = await resolveShopId(supabase);
        setShopId(sid);
        if (!sid) {
          setRows([]);
          return;
        }
        const { data: allocs, error } = await supabase
          .from("work_order_part_allocations")
          .select("*")
          .eq("shop_id", sid)
          .order("created_at", { ascending: false })
          .limit(400);
        if (error) throw error;

        const list = (allocs ?? []) as Alloc[];
        const partIds = [...new Set(list.map((a) => String(a.part_id)).filter(Boolean))];
        const locIds = [...new Set(list.map((a) => String(a.location_id)).filter(Boolean))];
        const woIds = [...new Set(list.map((a) => String(a.work_order_id ?? "")).filter(Boolean))];
        const reqItemIds = [...new Set(list.map((a) => String(a.source_request_item_id ?? "")).filter(Boolean))];
        const moveIds = [...new Set(list.map((a) => String(a.stock_move_id ?? "")).filter(Boolean))];

        const [parts, locs, wos, reqItems, moves] = await Promise.all([
          partIds.length
            ? supabase.from("parts").select("id,name,sku,part_number,category,price").in("id", partIds)
            : Promise.resolve({ data: [] as PartLite[] }),
          locIds.length ? supabase.from("stock_locations").select("id,code,name").in("id", locIds) : Promise.resolve({ data: [] as LocLite[] }),
          woIds.length ? supabase.from("work_orders").select("id,custom_id").in("id", woIds) : Promise.resolve({ data: [] as WoLite[] }),
          reqItemIds.length ? supabase.from("part_request_items").select("id,request_id,po_id").in("id", reqItemIds) : Promise.resolve({ data: [] as ReqItemLite[] }),
          moveIds.length ? supabase.from("stock_moves").select("id,reference_kind,reference_id,reason").in("id", moveIds) : Promise.resolve({ data: [] as MoveLite[] }),
        ]);

        const partBy: Record<string, PartLite> = {}; (parts.data ?? []).forEach((x) => (partBy[String(x.id)] = x));
        const locBy: Record<string, LocLite> = {}; (locs.data ?? []).forEach((x) => (locBy[String(x.id)] = x));
        const woBy: Record<string, WoLite> = {}; (wos.data ?? []).forEach((x) => (woBy[String(x.id)] = x));
        const reqBy: Record<string, ReqItemLite> = {}; (reqItems.data ?? []).forEach((x) => (reqBy[String(x.id)] = x));
        const moveBy: Record<string, MoveLite> = {}; (moves.data ?? []).forEach((x) => (moveBy[String(x.id)] = x));

        setRows(list.map((a) => ({
          a,
          part: partBy[String(a.part_id)],
          loc: locBy[String(a.location_id)],
          wo: a.work_order_id ? woBy[String(a.work_order_id)] ?? null : null,
          req: a.source_request_item_id ? reqBy[String(a.source_request_item_id)] ?? null : null,
          move: a.stock_move_id ? moveBy[String(a.stock_move_id)] ?? null : null,
        })));
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Failed to load allocations.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows
      .filter((r) =>
        [
          r.part?.name,
          r.part?.sku,
          r.part?.part_number,
          r.loc?.code,
          r.wo?.custom_id,
          r.a.work_order_id,
          r.req?.request_id,
          r.move?.reference_kind,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
  }, [rows, search]);

  return (
    <PageShell
      eyebrow="Parts · Traceability"
      title="Allocations"
      description="Track inventory committed to work orders with upstream request and stock move context."
      actions={<Link href="/parts" className={ui.buttonSecondary}>Parts</Link>}
    >
      <div className="space-y-4 text-[color:var(--theme-text-primary)]">

      <div className="desktop-toolbar-row p-3">
        <input className={ui.input} placeholder="Search WO, part, source request, move kind..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <div className={ui.loadingState}>Loading…</div> : err ? <div className="desktop-panel-soft border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200">{err}</div> : (
        <div className="desktop-panel-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[color:var(--theme-text-secondary)]"><th className="p-3">WO</th><th className="p-3">Part</th><th className="p-3">Location</th><th className="p-3">Qty</th><th className="p-3">Upstream trace</th><th className="p-3">Created</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={String(r.a.id)} className="border-t border-[color:var(--desktop-border)] align-top">
                  <td className="p-3.5">{r.a.work_order_id ? <Link className="text-[color:var(--theme-text-primary)] hover:text-[color:var(--theme-text-primary)]" href={`/work-orders/${encodeURIComponent(String(r.a.work_order_id))}`}>{r.wo?.custom_id ?? "Work order"}</Link> : <span className="text-[color:var(--theme-text-muted)]">—</span>}</td>
                  <td className="p-3.5">
                    {(() => {
                      const summary = r.part ? toPartDisplaySummary(r.part) : null;
                      return (
                        <>
                          <div className="font-medium text-[color:var(--theme-text-primary)]">{summary?.name ?? "Unknown part"}</div>
                          {summary && summary.labeledIdentifiers.length > 0 ? (
                            <div className="text-xs text-[color:var(--theme-text-muted)]">{partIdentifierLabel(summary)}</div>
                          ) : null}
                        </>
                      );
                    })()}
                  </td>
                  <td className="p-3.5">{r.loc?.code ?? "LOC"} <span className="text-xs text-[color:var(--theme-text-muted)]">{r.loc?.name ?? ""}</span></td>
                  <td className="p-3.5 tabular-nums text-[color:var(--theme-text-primary)]">{r.a.qty}</td>
                  <td className="p-3.5 text-xs text-[color:var(--theme-text-secondary)]">
                    {r.req?.request_id ? <span className="desktop-link-chip">Linked request</span> : <span className="text-[color:var(--theme-text-muted)]">No request link</span>}
                    <div className="mt-1 text-[color:var(--theme-text-muted)]">{String(r.move?.reference_kind ?? "—").replaceAll("_", " ")} · {movementReasonLabel(r.move?.reason)}</div>
                  </td>
                  <td className="p-3.5 text-xs text-[color:var(--theme-text-muted)]">{r.a.created_at ? new Date(r.a.created_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!shopId ? <div className="text-xs text-[color:var(--theme-text-muted)]">No shop detected for this user.</div> : null}
      </div>
    </PageShell>
  );
}
