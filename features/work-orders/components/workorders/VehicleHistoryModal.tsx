"use client";

import Link from "next/link";
import { Dialog } from "@headlessui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type Row = Pick<WorkOrder, "id" | "custom_id" | "status" | "updated_at" | "created_at" | "customer_id" | "shop_id"> & {
  customers?: Pick<Customer, "first_name" | "last_name" | "email" | "phone"> | null;
};

function fmtCustomerName(c: Row["customers"]): string {
  if (!c) return "—";
  const name = [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ").trim();
  return name.length ? name : "—";
}

function chipClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("paid") || s.includes("completed")) return "border-emerald-400/60 bg-emerald-500/10 text-emerald-200";
  if (s.includes("invoice")) return "border-orange-400/60 bg-orange-500/10 text-orange-200";
  if (s.includes("approval")) return "border-blue-400/60 bg-blue-500/10 text-blue-200";
  if (s.includes("hold")) return "border-amber-400/60 bg-amber-500/10 text-amber-200";
  return "border-white/15 bg-white/5 text-neutral-200";
}

export default function VehicleHistoryModal(props: {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  shopId: string | null;
}): JSX.Element {
  const { isOpen, onClose, vehicleId, shopId } = props;

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const lastSetShopId = useRef<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  const ensureShopContext = useCallback(async (id: string | null) => {
    if (!id) return;
    if (lastSetShopId.current === id) return;

    const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: id });
    if (error) {
      lastSetShopId.current = null;
      throw error;
    }
    lastSetShopId.current = id;
  }, [supabase]);

  const load = useCallback(async () => {
    if (!vehicleId) return;

    setLoading(true);
    setErr(null);

    try {
      // scope shop context if provided (aligns with your staff write/read patterns)
      if (shopId) {
        try {
          await ensureShopContext(shopId);
        } catch (e) {
          // don't hard-fail the modal if this RPC fails; RLS may still allow reads
          // eslint-disable-next-line no-console
          console.warn("[VehicleHistoryModal] set_current_shop_id failed:", e);
        }
      }

      let query = supabase
        .from("work_orders")
        .select("id, custom_id, status, updated_at, created_at, customer_id, shop_id, customers:customers(first_name,last_name,email,phone)")
        .eq("vehicle_id", vehicleId)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (shopId) query = query.eq("shop_id", shopId);

      const { data, error } = await query;

      if (error) throw error;

      const list = (Array.isArray(data) ? data : []) as unknown as Row[];

      const qlc = q.trim().toLowerCase();
      const filtered = qlc
        ? list.filter((r) => {
            const cid = (r.custom_id ?? "").toLowerCase();
            const id = (r.id ?? "").toLowerCase();
            const status = (r.status ?? "").toLowerCase();
            const cust = fmtCustomerName(r.customers ?? null).toLowerCase();
            const email = (r.customers?.email ?? "").toLowerCase();
            const phone = (r.customers?.phone ?? "").toLowerCase();
            return (
              id.includes(qlc) ||
              cid.includes(qlc) ||
              status.includes(qlc) ||
              cust.includes(qlc) ||
              email.includes(qlc) ||
              phone.includes(qlc)
            );
          })
        : list;

      setRows(filtered);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load history.";
      setErr(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, shopId, supabase, q, ensureShopContext]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-[120] flex items-center justify-center">
      <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      <div className="relative z-[130] mx-4 my-6 w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl border border-white/15 bg-neutral-950/95 p-4 text-white shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-200">
                Vehicle History
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                Showing up to 50 work orders {shopId ? "for this shop" : ""}.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                Search
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="Custom ID, status, customer…"
                className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-500/60"
              />
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-400 hover:bg-black/70"
            >
              Refresh
            </button>
          </div>

          {err ? (
            <div className="rounded-xl border border-red-500/60 bg-red-950/60 px-4 py-3 text-sm text-red-100">
              {err}
            </div>
          ) : loading ? (
            <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-neutral-300">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/12 bg-black/30 px-4 py-3 text-sm text-neutral-300">
              No history found for this vehicle.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black/35">
              <div className="grid grid-cols-12 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                <div className="col-span-4">Work Order</div>
                <div className="col-span-4">Customer</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2 text-right">Updated</div>
              </div>

              <ul className="divide-y divide-white/5">
                {rows.map((r) => {
                  const label = (r.custom_id ?? "").trim()
                    ? `WO ${String(r.custom_id).trim()}`
                    : `WO ${String(r.id).slice(0, 8)}…`;

                  const updatedIso = r.updated_at ?? r.created_at ?? null;
                  const updated = updatedIso ? format(new Date(updatedIso), "PP") : "—";

                  return (
                    <li key={r.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                      <div className="col-span-4 min-w-0">
                        <Link
                          href={`/work-orders/view/${r.id}`}
                          className="truncate font-mono text-orange-300 underline decoration-transparent underline-offset-2 hover:decoration-orange-400"
                        >
                          {label}
                        </Link>
                        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                          {String(r.id).slice(0, 8)}…
                        </div>
                      </div>

                      <div className="col-span-4 min-w-0">
                        <div className="truncate text-neutral-200">{fmtCustomerName(r.customers ?? null)}</div>
                        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                          {(r.customers?.email ?? "").toString() || "—"}
                        </div>
                      </div>

                      <div className="col-span-2">
                        <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " + chipClass(r.status)}>
                          {String(r.status ?? "—").replaceAll("_", " ")}
                        </span>
                      </div>

                      <div className="col-span-2 text-right text-[11px] text-neutral-400">
                        {updated}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-3 text-[11px] text-neutral-500">
            Tip: this modal links to the new staff read-only route: <span className="font-mono text-neutral-300">/work-orders/view/[id]</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
