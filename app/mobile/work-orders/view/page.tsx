"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { format } from "date-fns";
import { toast } from "sonner";

import type { Database } from "@shared/types/types/supabase";
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "phone" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

/* ------------------------------------------------------------------ */
/* Status badges                                                      */
/* ------------------------------------------------------------------ */

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

const BADGE_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]";

const STATUS_BADGE: Record<StatusKey, string> = {
  awaiting_approval: "bg-blue-500/10 border-blue-400/60 text-blue-100",
  awaiting: "bg-sky-500/10 border-sky-400/60 text-sky-100",
  queued: "bg-indigo-500/10 border-indigo-400/60 text-indigo-100",
  in_progress:
    "bg-[var(--accent-copper)]/15 border-[var(--accent-copper-light)]/70 text-[var(--accent-copper-light)]",
  on_hold: "bg-amber-500/10 border-amber-400/70 text-amber-100",
  planned: "bg-purple-500/10 border-purple-400/70 text-purple-100",
  new: "bg-neutral-900/80 border-neutral-500/80 text-neutral-100",
  completed: "bg-green-500/10 border-green-400/70 text-green-100",
  ready_to_invoice:
    "bg-emerald-500/10 border-emerald-400/70 text-emerald-100",
  invoiced: "bg-teal-500/10 border-teal-400/70 text-teal-100",
};

const statusChip = (s: string | null | undefined) => {
  const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_") as StatusKey;
  const cls = STATUS_BADGE[key] ?? STATUS_BADGE.awaiting;
  return `${BADGE_BASE} ${cls}`;
};

/** “Normal flow” = tech/active; hides AA, completed, billing states */
const NORMAL_FLOW_STATUSES: StatusKey[] = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "planned",
  "new",
];

// roles that can assign techs from mobile advisor view
const ASSIGN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

/* ------------------------------------------------------------------ */
/* Input styles                                                        */
/* ------------------------------------------------------------------ */

const INPUT_DARK =
  "w-full rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-neutral-100 placeholder:text-neutral-500 " +
  "shadow-[0_0_18px_rgba(0,0,0,0.8)] backdrop-blur focus:border-[var(--accent-copper)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper)]";

const SELECT_DARK =
  "w-full rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-neutral-100 " +
  "shadow-[0_0_18px_rgba(0,0,0,0.8)] backdrop-blur focus:border-[var(--accent-copper)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper)]";

const BUTTON_MUTED =
  "rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-neutral-100 shadow-[0_0_14px_rgba(0,0,0,0.7)] " +
  "transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/15 hover:text-white active:opacity-80";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function MobileWorkOrdersViewPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const [currentRole, setCurrentRole] = useState<string | null>(null);

  // mechanics for AssignTechModal
  const [mechanics, setMechanics] = useState<
    Array<Pick<Profile, "id" | "full_name" | "role">>
  >([]);

  // primary line per WO (for assigning via modal)
  const [primaryLineByWo, setPrimaryLineByWo] = useState<Record<string, string>>(
    {},
  );

  // assign-tech modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalLineId, setAssignModalLineId] = useState<string | null>(
    null,
  );

  // load role + mechanics once
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        setCurrentRole(prof?.role ?? null);
      }

      try {
        const res = await fetch("/api/assignables");
        const json = await res.json();
        if (res.ok && Array.isArray(json.data)) {
          setMechanics(json.data);
        }
      } catch {
        // silent – modal can still fall back to its own fetch
      }
    })();
  }, [supabase]);

  const canAssign = currentRole ? ASSIGN_ROLES.has(currentRole) : false;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    // 1) fetch work orders
    let woQuery = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,phone,email),
        vehicles:vehicles(year,make,model,license_plate)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (status === "") {
      woQuery = woQuery.in(
        "status",
        NORMAL_FLOW_STATUSES as unknown as string[],
      );
    } else {
      woQuery = woQuery.eq("status", status);
    }

    const { data, error } = await woQuery;

    if (error) {
      setErr(error.message);
      setRows([]);
      setPrimaryLineByWo({});
      setLoading(false);
      return;
    }

    const workOrders = (data ?? []) as Row[];

    // 2) client-side text search
    const qlc = q.trim().toLowerCase();
    const filtered =
      qlc.length === 0
        ? workOrders
        : workOrders.filter((r) => {
            const name = [r.customers?.first_name ?? "", r.customers?.last_name ?? ""]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            const plate = r.vehicles?.license_plate?.toLowerCase() ?? "";
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

    // 3) get a primary line id for each work order (first line)
    const ids = filtered.map((r) => r.id);
    if (ids.length > 0) {
      const { data: lines, error: lineErr } = await supabase
        .from("work_order_lines")
        .select("id, work_order_id, created_at")
        .in("work_order_id", ids)
        .order("created_at", { ascending: true });

      if (!lineErr && lines) {
        const map: Record<string, string> = {};
        lines.forEach((ln) => {
          const woId = ln.work_order_id as string;
          if (!map[woId]) {
            map[woId] = ln.id as string;
          }
        });
        setPrimaryLineByWo(map);
      } else {
        setPrimaryLineByWo({});
      }
    } else {
      setPrimaryLineByWo({});
    }

    setLoading(false);
  }, [q, status, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.length;
  const activeCount = useMemo(
    () =>
      rows.filter((r) =>
        NORMAL_FLOW_STATUSES.includes(
          (r.status ?? "awaiting").toLowerCase().replaceAll(
            " ",
            "_",
          ) as StatusKey,
        ),
      ).length,
    [rows],
  );
  const awaitingApprovalCount = useMemo(
    () =>
      rows.filter(
        (r) => (r.status ?? "").toLowerCase() === "awaiting_approval",
      ).length,
    [rows],
  );

  const openAssignModalForWo = (woId: string) => {
    const lineId = primaryLineByWo[woId];
    if (!lineId) {
      toast.error("No job lines on this work order yet.");
      return;
    }
    setAssignModalLineId(lineId);
    setAssignModalOpen(true);
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-4">
        {/* Header */}
        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-black via-neutral-950 to-black px-4 py-4 shadow-card">
          <h1 className="font-blackops text-lg uppercase tracking-[0.2em] text-[var(--accent-copper-light)]">
            Work orders
          </h1>
          <p className="mt-1 text-[0.75rem] text-neutral-300">
            Advisor view of active jobs and their tech assignments.
          </p>

          <div className="mt-3 flex gap-4 text-[0.7rem] text-neutral-300">
            <div>
              <div className="uppercase tracking-[0.13em] text-neutral-500">
                Total
              </div>
              <div className="text-sm font-semibold text-white">{total}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.13em] text-neutral-500">
                Active
              </div>
              <div className="text-sm font-semibold text-sky-200">
                {activeCount}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.13em] text-neutral-500">
                Awaiting approval
              </div>
              <div className="text-sm font-semibold text-blue-200">
                {awaitingApprovalCount}
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-3 text-xs shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-md">
          <div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              placeholder="Search id, customer, plate, YMM…"
              className={INPUT_DARK}
            />
          </div>
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={SELECT_DARK}
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
            <button type="button" onClick={() => void load()} className={BUTTON_MUTED}>
              Refresh
            </button>
          </div>
        </section>

        {err && (
          <div className="rounded-xl border border-red-500/50 bg-red-950/60 px-3 py-2 text-xs text-red-100">
            {err}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-300 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
            Loading work orders…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-black/40 p-6 text-sm text-neutral-400 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
            No work orders match your current filters.
          </div>
        ) : (
          <section className="space-y-2">
            {rows.map((r) => {
              const href = `/work-orders/${r.custom_id ?? r.id}?mode=view`;

              const customerName = r.customers
                ? [r.customers.first_name ?? "", r.customers.last_name ?? ""]
                    .filter(Boolean)
                    .join(" ")
                : "";

              const vehicleLabel = r.vehicles
                ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${
                    r.vehicles.model ?? ""
                  }`.trim()
                : "";

              const plate = r.vehicles?.license_plate ?? "";

              return (
                <article
                  key={r.id}
                  className="rounded-2xl border border-white/12 bg-gradient-to-br from-neutral-950/95 via-neutral-900/90 to-black/90 px-3 py-3 text-sm shadow-[0_0_0_1px_rgba(15,23,42,0.9)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={href}
                          className="text-sm font-semibold text-white underline decoration-neutral-600/50 underline-offset-2 hover:decoration-[var(--accent-copper-light)]"
                        >
                          {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                        </Link>
                        {r.custom_id && (
                          <span className="rounded-full border border-white/15 bg-black/60 px-1.5 py-0.5 text-[0.6rem] font-mono text-neutral-400">
                            #{r.id.slice(0, 6)}
                          </span>
                        )}
                        <span className={statusChip(r.status)}>
                          {(r.status ?? "awaiting").replaceAll("_", " ")}
                        </span>
                      </div>

                      <div className="mt-1 text-[0.75rem] text-neutral-300">
                        {customerName || "No customer"}{" "}
                        <span className="mx-1 text-neutral-600">•</span>
                        {vehicleLabel || "No vehicle"}
                        {plate ? (
                          <span className="ml-1 text-neutral-400">
                            ({plate})
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-[0.7rem] text-neutral-500">
                        {r.created_at
                          ? format(new Date(r.created_at), "PP p")
                          : "—"}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Link
                        href={href}
                        className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[0.7rem] text-neutral-100 transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/20"
                      >
                        Open
                      </Link>
                      {canAssign && (
                        <button
                          type="button"
                          onClick={() => openAssignModalForWo(r.id)}
                          className="rounded-full border border-sky-500/60 bg-sky-500/10 px-2.5 py-1 text-[0.7rem] text-sky-100 transition hover:bg-sky-500/25"
                        >
                          Assign tech
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {/* Assign-tech modal – uses first job line on the WO */}
        <AssignTechModal
          isOpen={assignModalOpen && !!assignModalLineId}
          onClose={() => {
            setAssignModalOpen(false);
            setAssignModalLineId(null);
          }}
          workOrderLineId={assignModalLineId ?? ""}
          mechanics={mechanics}
          onAssigned={async () => {
            // after assigning, refresh the list
            await load();
          }}
        />
      </div>
    </main>
  );
}