"use client";

import { format } from "date-fns";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type WorkOrderListRow = WorkOrder & {
  customers: Pick<
    Customer,
    "first_name" | "last_name" | "phone" | "email"
  > | null;
  vehicles: Pick<
    Vehicle,
    "year" | "make" | "model" | "license_plate"
  > | null;
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

const BADGE_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em]";

const STATUS_BADGE: Record<StatusKey, string> = {
  awaiting_approval: "border-blue-400/60 bg-blue-500/10 text-blue-100",
  awaiting: "border-sky-400/60 bg-sky-500/10 text-sky-100",
  queued: "border-indigo-400/60 bg-indigo-500/10 text-indigo-100",
  in_progress:
    "border-[var(--accent-copper-light)]/70 bg-[var(--accent-copper)]/15 text-[var(--accent-copper-light)]",
  on_hold: "border-amber-400/70 bg-amber-500/10 text-amber-100",
  planned: "border-purple-400/70 bg-purple-500/10 text-purple-100",
  new: "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] text-[color:var(--theme-text-primary)]",
  completed: "border-green-400/70 bg-green-500/10 text-green-100",
  ready_to_invoice:
    "border-emerald-400/70 bg-emerald-500/10 text-emerald-100",
  invoiced: "border-teal-400/70 bg-teal-500/10 text-teal-100",
};

function statusChip(status: string | null | undefined): string {
  const key = (status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as StatusKey;
  return `${BADGE_BASE} ${STATUS_BADGE[key] ?? STATUS_BADGE.awaiting}`;
}

function customerName(row: WorkOrderListRow): string {
  return row.customers
    ? [row.customers.first_name ?? "", row.customers.last_name ?? ""]
        .filter(Boolean)
        .join(" ")
    : "";
}

function vehicleLabel(row: WorkOrderListRow): string {
  if (!row.vehicles) return "";
  return [row.vehicles.year, row.vehicles.make, row.vehicles.model]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

const inputClass =
  "w-full rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper)] focus:ring-1 focus:ring-[var(--accent-copper)]";

export default function MobileWorkOrdersViewPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<WorkOrderListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [mechanics, setMechanics] = useState<
    Array<Pick<Profile, "id" | "full_name" | "role">>
  >([]);
  const [primaryLineByWorkOrder, setPrimaryLineByWorkOrder] = useState<
    Record<string, string>
  >({});
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignModalLineId, setAssignModalLineId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id || !active) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, shop_id")
        .eq("id", user.id)
        .maybeSingle<{ role: string | null; shop_id: string | null }>();
      if (!active) return;
      setCurrentRole(profile?.role ?? null);
      setShopId(profile?.shop_id ?? null);

      try {
        const response = await fetch("/api/assignables", { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as
          | { data?: Array<Pick<Profile, "id" | "full_name" | "role">> }
          | null;
        if (active && response.ok && Array.isArray(body?.data)) {
          setMechanics(body.data);
        }
      } catch {
        // AssignTechModal can still load its own list if this preload fails.
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase]);

  const canAssign = getActorCapabilities({ role: currentRole }).canAssignWork;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let workOrderQuery = supabase
        .from("work_orders")
        .select(
          `
          *,
          customers:customers(first_name,last_name,phone,email),
          vehicles:vehicles(year,make,model,license_plate)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(75);

      if (shopId) workOrderQuery = workOrderQuery.eq("shop_id", shopId);
      workOrderQuery = status
        ? workOrderQuery.eq("status", status)
        : workOrderQuery.in(
            "status",
            NORMAL_FLOW_STATUSES as unknown as string[],
          );

      const { data, error: queryError } = await workOrderQuery;
      if (queryError) throw queryError;

      const workOrders = (data ?? []) as unknown as WorkOrderListRow[];
      setRows(workOrders);

      const workOrderIds = workOrders.map((workOrder) => workOrder.id);
      if (workOrderIds.length === 0) {
        setPrimaryLineByWorkOrder({});
        return;
      }

      let lineQuery = supabase
        .from("work_order_lines")
        .select("id, work_order_id, created_at")
        .in("work_order_id", workOrderIds)
        .eq("line_type", "job")
        .order("created_at", { ascending: true });
      if (shopId) lineQuery = lineQuery.eq("shop_id", shopId);

      const { data: lines, error: lineError } = await lineQuery;
      if (lineError) throw lineError;

      const nextPrimaryLines: Record<string, string> = {};
      for (const line of lines ?? []) {
        if (line.work_order_id && !nextPrimaryLines[line.work_order_id]) {
          nextPrimaryLines[line.work_order_id] = line.id;
        }
      }
      setPrimaryLineByWorkOrder(nextPrimaryLines);
    } catch (caught) {
      setRows([]);
      setPrimaryLineByWorkOrder({});
      setError(
        caught instanceof Error
          ? caught.message
          : "Work orders could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [shopId, status, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.id,
        row.custom_id,
        customerName(row),
        vehicleLabel(row),
        row.vehicles?.license_plate,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(value);
    });
  }, [query, rows]);

  const activeCount = rows.filter((row) =>
    NORMAL_FLOW_STATUSES.includes(
      (row.status ?? "awaiting")
        .toLowerCase()
        .replaceAll(" ", "_") as StatusKey,
    ),
  ).length;
  const awaitingApprovalCount = rows.filter(
    (row) => (row.status ?? "").toLowerCase() === "awaiting_approval",
  ).length;

  const openAssignModal = (workOrderId: string) => {
    const lineId = primaryLineByWorkOrder[workOrderId];
    if (!lineId) {
      toast.error("No job lines are available on this work order yet.");
      return;
    }
    setAssignModalLineId(lineId);
    setAssignModalOpen(true);
  };

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-8 pt-4">
        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-gradient-to-br from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] px-4 py-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-blackops text-lg uppercase tracking-[0.2em] text-[var(--accent-copper-light)]">
                Work orders
              </h1>
              <p className="mt-1 text-[0.75rem] text-[color:var(--theme-text-secondary)]">
                Advisor view of active jobs and technician assignments.
              </p>
            </div>
            <Link
              href="/mobile/work-orders/create"
              className="shrink-0 rounded-full bg-[color:var(--accent-copper)] px-3 py-2 text-xs font-semibold text-white"
            >
              + Create
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric label="Total" value={rows.length} />
            <Metric label="Active" value={activeCount} />
            <Metric label="Approval" value={awaitingApprovalCount} />
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-xs shadow-[var(--theme-shadow-medium)] backdrop-blur-md">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ID, customer, plate, year, make, or model"
            className={inputClass}
          />
          <div className="flex gap-2">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={inputClass}
            >
              <option value="">Active flow</option>
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
              disabled={loading}
              className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 text-xs font-semibold disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-500/50 bg-red-950/60 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 text-sm text-[color:var(--theme-text-secondary)] shadow-[var(--theme-shadow-medium)]">
            Loading work orders…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-6 text-sm text-[color:var(--theme-text-secondary)] shadow-[var(--theme-shadow-medium)]">
            No work orders match the current view.
          </div>
        ) : (
          <section className="space-y-2">
            {visibleRows.map((row) => {
              const href = `/mobile/work-orders/${row.id}?mode=view`;
              const name = customerName(row);
              const vehicle = vehicleLabel(row);
              const plate = row.vehicles?.license_plate ?? "";

              return (
                <article
                  key={row.id}
                  className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-gradient-to-br from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] px-3 py-3 text-sm shadow-[var(--theme-shadow-medium)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link href={href} className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-[color:var(--theme-text-primary)]">
                          {row.custom_id ?? `#${row.id.slice(0, 8)}`}
                        </span>
                        <span className={statusChip(row.status)}>
                          {(row.status ?? "awaiting").replaceAll("_", " ")}
                        </span>
                      </div>
                      <div className="mt-1 text-[0.75rem] text-[color:var(--theme-text-secondary)]">
                        {name || "No customer"}
                        <span className="mx-1 text-[color:var(--theme-text-muted)]">
                          •
                        </span>
                        {vehicle || "No vehicle"}
                        {plate ? ` (${plate})` : ""}
                      </div>
                      <div className="mt-1 text-[0.7rem] text-[color:var(--theme-text-muted)]">
                        {row.created_at
                          ? format(new Date(row.created_at), "PP p")
                          : "—"}
                      </div>
                    </Link>

                    <div className="flex shrink-0 flex-col gap-1.5">
                      <Link
                        href={href}
                        className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1.5 text-center text-[0.7rem] font-semibold text-[color:var(--theme-text-primary)]"
                      >
                        Open
                      </Link>
                      {canAssign ? (
                        <button
                          type="button"
                          onClick={() => openAssignModal(row.id)}
                          className="rounded-full border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-[0.7rem] font-semibold text-sky-100"
                        >
                          Assign tech
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <AssignTechModal
          isOpen={assignModalOpen && Boolean(assignModalLineId)}
          onClose={() => {
            setAssignModalOpen(false);
            setAssignModalLineId(null);
          }}
          workOrderLineId={assignModalLineId ?? ""}
          mechanics={mechanics}
          onAssigned={async () => {
            await load();
          }}
        />
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-2">
      <div className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
      <div className="mt-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
    </div>
  );
}
