"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Alloc = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type LocRow = DB["public"]["Tables"]["stock_locations"]["Row"];
type WoLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WoRow = DB["public"]["Tables"]["work_orders"]["Row"];

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

async function resolveShopId(supabase: ReturnType<typeof createClientComponentClient<DB>>) {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id ?? null;
  if (!uid) return "";

  const { data: profA } = await supabase.from("profiles").select("shop_id").eq("user_id", uid).maybeSingle();
  if (profA?.shop_id) return String(profA.shop_id);

  const { data: profB } = await supabase.from("profiles").select("shop_id").eq("id", uid).maybeSingle();
  return String(profB?.shop_id ?? "");
}

type UiAlloc = {
  alloc: Alloc;
  partName: string;
  partSku: string;
  locCode: string;
  locName: string;
  woCustom: string;
  woLineShort: string;
};

export default function AllocationsPage(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  const [search, setSearch] = useState<string>("");
  const [rows, setRows] = useState<UiAlloc[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErr(null);

      try {
        const sid = await resolveShopId(supabase);
        setShopId(sid);

        if (!sid) {
          setRows([]);
          setLoading(false);
          return;
        }

        // allocations
        const { data: allocs, error: aerr } = await supabase
          .from("work_order_part_allocations")
          .select("*")
          .eq("shop_id", sid)
          .order("created_at", { ascending: false })
          .limit(400);

        if (aerr) throw aerr;

        const allocList = (allocs ?? []) as Alloc[];

        const partIds = Array.from(
          new Set(allocList.map((a) => a.part_id).filter((x): x is string => typeof x === "string" && x.length > 0)),
        );
        const locIds = Array.from(
          new Set(
            allocList.map((a) => a.location_id).filter((x): x is string => typeof x === "string" && x.length > 0),
          ),
        );
        const lineIds = Array.from(
          new Set(
            allocList
              .map((a) => a.work_order_line_id)
              .filter((x): x is string => typeof x === "string" && x.length > 0),
          ),
        );

        // parts + locations + lines + work orders (for custom_id)
        const [partsRes, locsRes, linesRes] = await Promise.all([
          partIds.length
            ? supabase.from("parts").select("id, name, sku").in("id", partIds)
            : Promise.resolve({ data: [] as unknown[] }),
          locIds.length
            ? supabase.from("stock_locations").select("id, code, name").in("id", locIds)
            : Promise.resolve({ data: [] as unknown[] }),
          lineIds.length
            ? supabase.from("work_order_lines").select("id, work_order_id").in("id", lineIds)
            : Promise.resolve({ data: [] as unknown[] }),
        ]);

        const partById = new Map<string, PartRow>();
        ((partsRes.data ?? []) as PartRow[]).forEach((p) => partById.set(String(p.id), p));

        const locById = new Map<string, LocRow>();
        ((locsRes.data ?? []) as LocRow[]).forEach((l) => locById.set(String(l.id), l));

        const lineById = new Map<string, WoLineRow>();
        ((linesRes.data ?? []) as WoLineRow[]).forEach((l) => lineById.set(String(l.id), l));

        const woIds = Array.from(
          new Set(
            ((linesRes.data ?? []) as WoLineRow[])
              .map((l) => l.work_order_id)
              .filter((x): x is string => typeof x === "string" && x.length > 0),
          ),
        );

        const woById = new Map<string, WoRow>();
        if (woIds.length) {
          const { data: wos } = await supabase.from("work_orders").select("id, custom_id").in("id", woIds);
          ((wos ?? []) as WoRow[]).forEach((w) => woById.set(String(w.id), w));
        }

        const ui: UiAlloc[] = allocList.map((a) => {
          const p = partById.get(String(a.part_id));
          const l = locById.get(String(a.location_id));
          const line = a.work_order_line_id ? lineById.get(String(a.work_order_line_id)) : undefined;
          const wo = line?.work_order_id ? woById.get(String(line.work_order_id)) : undefined;

          return {
            alloc: a,
            partName: p?.name ? String(p.name) : String(a.part_id).slice(0, 8),
            partSku: p?.sku ? String(p.sku) : "",
            locCode: l?.code ? String(l.code) : "LOC",
            locName: l?.name ? String(l.name) : "",
            woCustom: wo?.custom_id ? String(wo.custom_id) : (line?.work_order_id ? String(line.work_order_id).slice(0, 8) : "—"),
            woLineShort: a.work_order_line_id ? String(a.work_order_line_id).slice(0, 8) : "—",
          };
        });

        setRows(ui);
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
    return rows.filter((r) => {
      const blob = [
        r.woCustom,
        r.woLineShort,
        r.partName,
        r.partSku,
        r.locCode,
        r.locName,
        r.alloc.id ? String(r.alloc.id) : "",
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search]);

  return (
    <div className="p-6 space-y-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.22em] text-neutral-400">Parts</div>
          <h1 className="text-2xl font-bold">Allocations</h1>
          <div className="mt-1 text-sm text-neutral-400">
            Inventory allocations created from request items / consume flows.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/parts"
            className="rounded-full border border-white/10 bg-black/50 px-4 py-2 text-sm text-neutral-100 hover:border-orange-500/60"
          >
            ← Parts
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-neutral-500">
            Showing <span className="text-neutral-200">{filtered.length}</span> allocations
          </div>
          <div className="w-full md:w-96">
            <input
              className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-500"
              placeholder="Search WO#, part, SKU, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-400">Loading…</div>
      ) : err ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{err}</div>
      ) : !shopId ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-400">
          No shop detected for this user.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-400">
          No allocations found.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-[0_18px_40px_rgba(0,0,0,0.9)]">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-neutral-400">
              <tr>
                <th className="p-3">WO</th>
                <th className="p-3">WO Line</th>
                <th className="p-3">Part</th>
                <th className="p-3">Location</th>
                <th className="p-3 text-right">Qty</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={String(r.alloc.id)} className="border-t border-white/10 hover:bg-white/5">
                  <td className="p-3">
                    <span className="font-mono text-xs text-neutral-200">{r.woCustom}</span>
                  </td>
                  <td className="p-3">
                    <span className="font-mono text-xs text-neutral-200">{r.woLineShort}</span>
                  </td>
                  <td className="p-3">
                    <div className="text-neutral-200">{r.partName}</div>
                    {r.partSku ? <div className="text-xs text-neutral-500">{r.partSku}</div> : null}
                  </td>
                  <td className="p-3">
                    <div className="text-neutral-200">
                      {r.locCode} {r.locName ? `— ${r.locName}` : ""}
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono text-neutral-200">{n(r.alloc.qty)}</td>
                  <td className="p-3 text-xs text-neutral-500">
                    {r.alloc.created_at ? new Date(r.alloc.created_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}