"use client";

import { Dialog } from "@headlessui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type History = DB["public"]["Tables"]["history"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type Row = Pick<
  History,
  "id" | "customer_id" | "vehicle_id" | "service_date" | "description" | "notes" | "created_at"
> & {
  customers?: Pick<Customer, "first_name" | "last_name" | "email" | "phone"> | null;
};

function fmtCustomerName(c: Row["customers"]): string {
  if (!c) return "—";
  const name = [c.first_name ?? "", c.last_name ?? ""].filter(Boolean).join(" ").trim();
  return name.length ? name : "—";
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "PP");
}

function historyLabel(r: Row): string {
  const notes = (r.notes ?? "").toString();
  const invoice = notes.match(/^Invoice:\s*(.+)$/im)?.[1]?.trim();
  const workOrder = notes.match(/^Work order:\s*(.+)$/im)?.[1]?.trim();

  if (invoice) return `Invoice ${invoice}`;
  if (workOrder) return `WO ${workOrder}`;
  return `History ${String(r.id).slice(0, 8)}…`;
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

  const ensureShopContext = useCallback(
    async (id: string | null) => {
      if (!id) return;
      if (lastSetShopId.current === id) return;

      const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: id });
      if (error) {
        lastSetShopId.current = null;
        throw error;
      }
      lastSetShopId.current = id;
    },
    [supabase],
  );

  const load = useCallback(async () => {
    if (!vehicleId) return;

    setLoading(true);
    setErr(null);

    try {
      if (shopId) {
        try {
          await ensureShopContext(shopId);
        } catch (e) {
          console.warn("[VehicleHistoryModal] set_current_shop_id failed:", e);
        }
      }

      const { data, error } = await supabase
        .from("history")
        .select(
          "id, customer_id, vehicle_id, service_date, description, notes, created_at, customers:customers(first_name,last_name,email,phone)",
        )
        .eq("vehicle_id", vehicleId)
        .order("service_date", { ascending: false })
        .limit(100);

      if (error) throw error;

      const list = (Array.isArray(data) ? data : []) as unknown as Row[];
      const qlc = q.trim().toLowerCase();

      const searched = qlc
        ? list.filter((r) => {
            const label = historyLabel(r).toLowerCase();
            const cust = fmtCustomerName(r.customers ?? null).toLowerCase();
            const email = (r.customers?.email ?? "").toLowerCase();
            const phone = (r.customers?.phone ?? "").toLowerCase();
            const description = (r.description ?? "").toLowerCase();
            const notes = (r.notes ?? "").toLowerCase();
            const date = fmtDateShort(r.service_date).toLowerCase();

            return (
              label.includes(qlc) ||
              cust.includes(qlc) ||
              email.includes(qlc) ||
              phone.includes(qlc) ||
              description.includes(qlc) ||
              notes.includes(qlc) ||
              date.includes(qlc)
            );
          })
        : list;

      setRows(searched);
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
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center"
    >
      <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      <div
        className="relative z-[130] mx-4 my-6 w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-2xl border border-white/15 bg-neutral-950/95 p-4 text-white shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-200">
                Vehicle History
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                Showing imported service history records for this vehicle.
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
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                Search
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="Invoice, customer, description, notes…"
                className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/40"
              />
            </div>

            <button
              type="button"
              onClick={load}
              className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-100 hover:border-sky-400/50 hover:bg-black/70"
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
              No imported service history found for this vehicle.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10 bg-black/35">
              <div className="grid grid-cols-12 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                <div className="col-span-3">Record</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-4">Details</div>
                <div className="col-span-2 text-right">Service date</div>
              </div>

              <ul className="divide-y divide-white/5">
                {rows.map((r) => {
                  const serviceDate = fmtDateShort(r.service_date ?? r.created_at);
                  const details = (r.description ?? r.notes ?? "—").toString();

                  return (
                    <li key={r.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                      <div className="col-span-3 min-w-0">
                        <div className="truncate font-mono text-sky-200">
                          {historyLabel(r)}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                          {String(r.id).slice(0, 8)}…
                        </div>
                      </div>

                      <div className="col-span-3 min-w-0">
                        <div className="truncate text-neutral-200">
                          {fmtCustomerName(r.customers ?? null)}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
                          {(r.customers?.email ?? "").toString() || "—"}
                        </div>
                      </div>

                      <div className="col-span-4 min-w-0">
                        <div className="truncate text-[12px] text-neutral-200" title={details}>
                          {details}
                        </div>
                      </div>

                      <div className="col-span-2 text-right text-[11px] text-neutral-400">
                        {serviceDate}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
