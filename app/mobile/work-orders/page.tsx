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
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const NORMAL_FLOW_STATUSES: StatusKey[] = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "planned",
];

const STATUS_LABEL: Record<StatusKey, string> = {
  awaiting_approval: "Awaiting approval",
  awaiting: "Awaiting",
  queued: "Queued",
  in_progress: "In progress",
  on_hold: "On hold",
  planned: "Planned",
  completed: "Completed",
  ready_to_invoice: "Ready to invoice",
  invoiced: "Invoiced",
};

const STATUS_CHIP: Record<StatusKey, string> = {
  awaiting_approval:
    "border-blue-400/60 text-blue-200 bg-blue-900/20",
  awaiting:
    "border-sky-400/60 text-sky-200 bg-sky-900/20",
  queued:
    "border-indigo-400/60 text-indigo-200 bg-indigo-900/20",
  in_progress:
    "border-[var(--accent-copper-soft)]/70 text-[var(--accent-copper-soft)] bg-[rgba(212,118,49,0.12)]",
  on_hold:
    "border-amber-400/70 text-amber-200 bg-amber-900/20",
  planned:
    "border-purple-400/70 text-purple-200 bg-purple-900/20",
  completed:
    "border-emerald-400/70 text-emerald-200 bg-emerald-900/20",
  ready_to_invoice:
    "border-emerald-400/70 text-emerald-200 bg-emerald-900/20",
  invoiced:
    "border-teal-400/70 text-teal-200 bg-teal-900/20",
};

function statusKey(raw: string | null | undefined): StatusKey {
  const key = (raw ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as StatusKey;
  if (key in STATUS_LABEL) return key;
  return "awaiting";
}

function cleanText(v: string | null | undefined): string {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function formatVehicle(v: Row["vehicles"]): { label: string; plate?: string } {
  const year = v?.year ? String(v.year) : "";
  const make = cleanText(v?.make ?? "");
  const model = cleanText(v?.model ?? "");
  const label = [year, make, model].filter(Boolean).join(" ").trim();
  const plate = cleanText(v?.license_plate ?? "");
  return { label, plate: plate || undefined };
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "metal-card rounded-2xl border px-3 py-3 text-center shadow-[0_16px_32px_rgba(0,0,0,0.65)]",
        accent
          ? "border border-[var(--accent-copper-soft)]/75 shadow-[0_16px_32px_rgba(0,0,0,0.65),0_0_20px_rgba(212,118,49,0.45)]"
          : "border border-[var(--metal-border-soft)]",
      ].join(" ")}
    >
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
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
        `,
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
            const name = [
              r.customers?.first_name ?? "",
              r.customers?.last_name ?? "",
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            const plate = (r.vehicles?.license_plate ?? "").toLowerCase();
            const ymm = [
              r.vehicles?.year ?? "",
              r.vehicles?.make ?? "",
              r.vehicles?.model ?? "",
            ]
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
        },
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

  const activeCount = useMemo(() => {
    return rows.filter((r) => {
      const k = statusKey(r.status ?? "awaiting");
      return NORMAL_FLOW_STATUSES.includes(k);
    }).length;
  }, [rows]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-4">
        {/* HERO (MobileTechHome vibe) */}
        <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="space-y-1">
            <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
              ProFixIQ • Tech
            </div>
            <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-[var(--accent-copper)]">
              Jobs
            </h1>
            <p className="text-[0.75rem] text-neutral-300">
              Work orders for this shop. Tap a card to open details.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <MiniStat label="Total" value={total} />
            <MiniStat label="Active" value={activeCount} accent />
          </div>
        </section>

        {/* Filters (metal-card) */}
        <section className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.75)]">
          <div className="space-y-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              placeholder="Search id, customer, plate, YMM…"
              className={[
                "w-full rounded-xl border px-3 py-2 text-xs text-neutral-100 outline-none [color-scheme:dark]",
                "border-[var(--metal-border-soft)] bg-black/35 placeholder:text-neutral-500",
                "focus:border-[var(--accent-copper-soft)]/70 focus:ring-1 focus:ring-[rgba(212,118,49,0.35)]",
              ].join(" ")}
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={[
                  "w-full rounded-xl border px-3 py-2 text-xs text-neutral-100 outline-none [color-scheme:dark]",
                  "border-[var(--metal-border-soft)] bg-black/35",
                  "focus:border-[var(--accent-copper-soft)]/70 focus:ring-1 focus:ring-[rgba(212,118,49,0.35)]",
                ].join(" ")}
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
                className="rounded-xl border border-[var(--metal-border-soft)] bg-black/35 px-4 py-2 text-xs font-semibold text-neutral-100 hover:border-[var(--accent-copper-soft)]/70 hover:bg-white/5"
              >
                Refresh
              </button>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="text-[0.7rem] text-neutral-400">
                Showing{" "}
                <span className="font-semibold text-white">{rows.length}</span>
              </div>

              {/* If you actually have a mobile create route, change this.
                  Leaving as your original desktop-ish path would be wrong on mobile. */}
              <Link
                href="/work-orders/create"
                className="inline-flex items-center rounded-full border border-[var(--accent-copper-soft)]/70 bg-[rgba(212,118,49,0.18)] px-3 py-1 text-[0.7rem] font-semibold text-[var(--accent-copper-soft)] hover:bg-[rgba(212,118,49,0.26)]"
              >
                <span className="mr-1 text-base leading-none">＋</span>
                New
              </Link>
            </div>
          </div>
        </section>

        {err ? (
          <div className="metal-card rounded-2xl border border-red-500/50 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {/* List */}
        <section className="space-y-2">
          {loading ? (
            <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-sm text-neutral-300">
              Loading work orders…
            </div>
          ) : rows.length === 0 ? (
            <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 text-sm text-neutral-400">
              No work orders match your filters.
            </div>
          ) : (
            rows.map((wo) => {
              const key = statusKey(wo.status);
              const customerName = wo.customers
                ? [wo.customers.first_name ?? "", wo.customers.last_name ?? ""]
                    .filter(Boolean)
                    .join(" ")
                : "No customer";

              const veh = formatVehicle(wo.vehicles);
              const idLabel = wo.custom_id || `#${wo.id.slice(0, 8)}`;

              return (
                <Link
                  key={wo.id}
                  href={`/mobile/work-orders/${wo.id}`}
                  className="metal-card block rounded-2xl border border-[var(--metal-border-soft)] px-4 py-3 shadow-[0_18px_40px_rgba(0,0,0,0.75)] active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
                        {wo.created_at ? format(new Date(wo.created_at), "PP") : "—"}
                      </div>

                      <div className="mt-0.5 truncate text-[0.95rem] font-semibold text-white">
                        {idLabel}
                      </div>

                      <div className="mt-1 flex flex-col gap-1 text-[0.75rem] text-neutral-300">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{customerName}</span>
                          {wo.customers?.phone ? (
                            <span className="shrink-0 font-mono text-neutral-500">
                              {wo.customers.phone}
                            </span>
                          ) : null}
                        </div>

                        <div className="truncate text-[0.7rem] text-neutral-400">
                          {veh.label || "No vehicle"}
                          {veh.plate ? (
                            <span className="ml-1 text-neutral-500">
                              ({veh.plate})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <span
                      className={[
                        "accent-chip shrink-0 rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.12em]",
                        STATUS_CHIP[key],
                      ].join(" ")}
                    >
                      {STATUS_LABEL[key]}
                    </span>
                  </div>
                </Link>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}