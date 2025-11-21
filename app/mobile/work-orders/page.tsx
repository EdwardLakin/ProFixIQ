"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "phone"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

type StatusKey =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const NORMAL_FLOW_STATUSES: StatusKey[] = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "planned",
  "new",
];

const STATUS_LABEL: Record<StatusKey, string> = {
  awaiting_approval: "Awaiting approval",
  awaiting: "Awaiting",
  queued: "Queued",
  in_progress: "In progress",
  on_hold: "On hold",
  planned: "Planned",
  new: "New",
  completed: "Completed",
  ready_to_invoice: "Ready to invoice",
  invoiced: "Invoiced",
};

const STATUS_CHIP: Record<StatusKey, string> = {
  awaiting_approval:
    "bg-blue-500/10 text-blue-200 border border-blue-400/60",
  awaiting:
    "bg-sky-500/10 text-sky-200 border border-sky-400/60",
  queued:
    "bg-indigo-500/10 text-indigo-200 border border-indigo-400/60",
  in_progress:
    "bg-orange-500/10 text-orange-200 border border-orange-400/70",
  on_hold:
    "bg-amber-500/10 text-amber-200 border border-amber-400/70",
  planned:
    "bg-purple-500/10 text-purple-200 border border-purple-400/70",
  new:
    "bg-neutral-800 text-neutral-100 border border-neutral-600",
  completed:
    "bg-green-500/10 text-green-200 border border-green-400/70",
  ready_to_invoice:
    "bg-emerald-500/10 text-emerald-200 border border-emerald-400/70",
  invoiced:
    "bg-teal-500/10 text-teal-200 border border-teal-400/70",
};

const INPUT_DARK =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-50 placeholder:text-neutral-500 " +
  "focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-500/60 [color-scheme:dark]";

const SELECT_DARK =
  "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-50 " +
  "focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-500/60 [color-scheme:dark]";

function statusKey(raw: string | null | undefined): StatusKey {
  const key = (raw ?? "awaiting").toLowerCase().replaceAll(" ", "_") as StatusKey;
  if (key in STATUS_LABEL) return key;
  return "awaiting";
}

export default function MobileWorkOrdersListPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,phone),
        vehicles:vehicles(year,make,model,license_plate)
      `
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (status === "") {
      query = query.in("status", NORMAL_FLOW_STATUSES as unknown as string[]);
    } else {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as Row[];

    const qlc = q.trim().toLowerCase();
    const filtered =
      qlc.length === 0
        ? list
        : list.filter((r) => {
            const name = [r.customers?.first_name ?? "", r.customers?.last_name ?? ""]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            const plate = r.vehicles?.license_plate?.toLowerCase() ?? "";
            const ymm = [r.vehicles?.year ?? "", r.vehicles?.make ?? "", r.vehicles?.model ?? ""]
              .join(" ")
              .toLowerCase();
            const cid = (r.custom_id ?? "").toLowerCase();
            return (
              r.id.toLowerCase().includes(qlc) ||
              cid.includes(qlc) ||
              name.includes(qlc) ||
              plate.includes(qlc) ||
              ymm.includes(qlc)
            );
          });

    setRows(filtered);
    setLoading(false);
  }, [q, status, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("mobile:work_orders:list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => {
          setTimeout(() => void load(), 80);
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        // ignore
      }
    };
  }, [supabase, load]);

  const total = rows.length;
  const activeCount = useMemo(
    () =>
      rows.filter((r) =>
        NORMAL_FLOW_STATUSES.includes(
          statusKey(r.status ?? "awaiting")
        )
      ).length,
    [rows]
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-gradient-to-b from-black to-neutral-950 px-3 pb-6 pt-4 text-neutral-50">
      {/* Header */}
      <header className="mb-4 flex flex-col gap-1">
        <h1 className="text-base font-blackops uppercase tracking-[0.18em] text-neutral-100">
          Jobs
        </h1>
        <p className="text-[11px] text-neutral-400">
          Work orders for this shop. Tap a card to open details.
        </p>
      </header>

      {/* Filters */}
      <section className="mb-3 space-y-2 rounded-2xl border border-white/10 bg-black/60 p-3 shadow-lg shadow-black/40 backdrop-blur-md">
        <div className="space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Search id, customer, plate, YMM…"
            className={INPUT_DARK + " text-xs"}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={SELECT_DARK + " text-xs"}
            >
              <option value="">Active (normal flow)</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="awaiting">Awaiting</option>
              <option value="queued">Queued</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="planned">Planned</option>
              <option value="new">New</option>
              <option value="completed">Completed</option>
              <option value="ready_to_invoice">Ready to invoice</option>
              <option value="invoiced">Invoiced</option>
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-1 inline-flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-[11px] font-medium text-neutral-100 hover:bg-neutral-900"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-300">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="uppercase tracking-[0.14em] text-neutral-500">
                Total
              </span>
              <span className="text-sm font-semibold text-white">
                {total}
              </span>
            </div>
            <div className="h-7 w-px bg-neutral-700/70" />
            <div className="flex flex-col">
              <span className="uppercase tracking-[0.14em] text-neutral-500">
                Active
              </span>
              <span className="text-sm font-semibold text-sky-200">
                {activeCount}
              </span>
            </div>
          </div>
          <Link
            href="/work-orders/create"
            className="inline-flex items-center rounded-full border border-orange-500/70 bg-orange-500 px-3 py-1 text-[11px] font-semibold text-black shadow-sm hover:bg-orange-400"
          >
            <span className="mr-1 text-base leading-none">＋</span>
            New
          </Link>
        </div>
      </section>

      {err && (
        <div className="mb-3 rounded-xl border border-red-500/60 bg-red-950/50 px-3 py-2 text-[11px] text-red-100">
          {err}
        </div>
      )}

      {/* List */}
      <section className="flex-1 space-y-2">
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4 text-sm text-neutral-300">
            Loading work orders…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-black/50 p-5 text-sm text-neutral-400">
            No work orders match your filters.
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((wo) => {
              const key = statusKey(wo.status);
              const customerName = wo.customers
                ? [wo.customers.first_name ?? "", wo.customers.last_name ?? ""]
                    .filter(Boolean)
                    .join(" ")
                : "No customer";

              const vehicleLabel = wo.vehicles
                ? `${wo.vehicles.year ?? ""} ${wo.vehicles.make ?? ""} ${
                    wo.vehicles.model ?? ""
                  }`.trim()
                : "";

              const plate = wo.vehicles?.license_plate ?? "";
              const idLabel = wo.custom_id || `#${wo.id.slice(0, 8)}`;

              return (
                <Link
                  key={wo.id}
                  href={`/mobile/work-orders/${wo.id}`}
                  className="block rounded-2xl border border-white/10 bg-black/70 px-3.5 py-3 shadow-md shadow-black/50 active:scale-[0.99]"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-neutral-400">
                        {wo.created_at
                          ? format(new Date(wo.created_at), "PP")
                          : "—"}
                      </span>
                      <span className="text-sm font-semibold text-neutral-50">
                        {idLabel}
                      </span>
                    </div>
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] " +
                        STATUS_CHIP[key]
                      }
                    >
                      {STATUS_LABEL[key]}
                    </span>
                  </div>

                  <div className="mt-1 space-y-1 text-[11px] text-neutral-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1">
                        {customerName || "No customer"}
                      </span>
                      {wo.customers?.phone && (
                        <span className="font-mono text-neutral-400">
                          {wo.customers.phone}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      {vehicleLabel || "No vehicle"}
                      {plate ? (
                        <span className="ml-1 text-neutral-500">
                          ({plate})
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
