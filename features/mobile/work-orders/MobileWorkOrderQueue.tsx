"use client";

import { format } from "date-fns";
import { ChevronRight, Filter, Plus, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getOfflineSnapshot,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import {
  getSessionMatchedOfflineScope,
  setOfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { resolveCanonicalStaffProfile } from "@/features/shared/lib/authenticated-profile";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { resolveTechnicianAssignmentContract } from "@/features/work-orders/lib/technicianAssignmentContract";
import { hasActivePartsWaitingSignal } from "@/features/work-orders/lib/preLaborPartsQuoteHold";
import {
  ACTIVE_WORK_ORDER_STATUSES,
  countActiveWorkOrders,
  isActiveWorkOrderStatus,
  normalizeWorkOrderStatus,
} from "@/features/work-orders/lib/work-order-status";
import { toTechnicianJobBucket } from "@/features/work-orders/lib/technicianJobQueue";
import { fetchAssignedTechnicianWork } from "@/features/work-orders/mobile/technicianOfflineDownload";
import type { TechnicianOfflineBundle } from "@/features/work-orders/mobile/technicianOfflineTypes";
import {
  buildMobileWorkOrderListHref,
  resolveMobileWorkOrderHref,
} from "./mobileWorkOrderRouting";
import { useOperationsLiveRefresh } from "@/features/work-orders/hooks/useOperationsLiveRefresh";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "phone"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

type WorkOrderLineSummary = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  | "id"
  | "work_order_id"
  | "status"
  | "approval_state"
  | "assigned_tech_id"
  | "assigned_to"
  | "hold_reason"
>;

type WorkOrderLineAssignment = Pick<
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"],
  "work_order_line_id" | "technician_id"
>;

type WorkOrderSignal = {
  inProgress: number;
  pendingApproval: number;
  unassigned: number;
  waitingParts: number;
};

type WorkOrderListSnapshot = {
  rows: Row[];
  signals: Record<string, WorkOrderSignal>;
  totalCount?: number;
  assignedOnly?: boolean;
};

type StatusKey =
  | "awaiting_approval"
  | "awaiting"
  | "awaiting_inspection"
  | "assigned"
  | "approved"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "recommended"
  | "waiting_parts"
  | "new"
  | "cancelled"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Active" },
  { value: "queued", label: "Queued" },
  { value: "in_progress", label: "In progress" },
  { value: "on_hold", label: "On hold" },
  { value: "awaiting_approval", label: "Approval" },
  { value: "completed", label: "Completed" },
  { value: "ready_to_invoice", label: "Ready" },
  { value: "invoiced", label: "Invoiced" },
];

const STATUS_LABEL: Record<StatusKey, string> = {
  awaiting_approval: "Awaiting approval",
  awaiting: "Ready",
  awaiting_inspection: "Awaiting inspection",
  assigned: "Assigned",
  approved: "Approved",
  queued: "Queued",
  in_progress: "Active",
  on_hold: "On hold",
  planned: "Planned",
  recommended: "Recommended",
  waiting_parts: "Waiting for parts",
  new: "New",
  cancelled: "Cancelled",
  completed: "Completed",
  ready_to_invoice: "Ready to invoice",
  invoiced: "Invoiced",
};

const STATUS_RAIL: Record<StatusKey, string> = {
  awaiting_approval: "bg-violet-500",
  awaiting: "bg-sky-500",
  awaiting_inspection: "bg-blue-500",
  assigned: "bg-blue-500",
  approved: "bg-emerald-500",
  queued: "bg-indigo-500",
  in_progress: "bg-cyan-500",
  on_hold: "bg-amber-500",
  planned: "bg-purple-500",
  recommended: "bg-violet-500",
  waiting_parts: "bg-amber-500",
  new: "bg-blue-500",
  cancelled: "bg-slate-500",
  completed: "bg-emerald-500",
  ready_to_invoice: "bg-emerald-500",
  invoiced: "bg-teal-500",
};

function statusKey(raw: string | null | undefined): StatusKey {
  const key = String(raw ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as StatusKey;
  return key in STATUS_LABEL ? key : normalizeWorkOrderStatus(key);
}
function cleanText(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function formatVehicle(vehicle: Row["vehicles"]): {
  label: string;
  plate?: string;
} {
  const year = vehicle?.year ? String(vehicle.year) : "";
  const make = cleanText(vehicle?.make ?? "");
  const model = cleanText(vehicle?.model ?? "");
  const label = [year, make, model].filter(Boolean).join(" ").trim();
  const plate = cleanText(vehicle?.license_plate ?? "");
  return { label, plate: plate || undefined };
}

function emptySignal(): WorkOrderSignal {
  return {
    inProgress: 0,
    pendingApproval: 0,
    unassigned: 0,
    waitingParts: 0,
  };
}

/**
 * A line's contribution to its work order's badge row. Both the shop-wide read
 * and the assigned-technician read fold lines through here so a job counted as
 * active on one surface is never counted as idle on the other.
 */
function accumulateLineSignal(
  signal: WorkOrderSignal,
  line: {
    status?: string | null;
    approval_state?: string | null;
    hold_reason?: string | null;
    punched_in_at?: string | null;
    punched_out_at?: string | null;
  },
  technicianIds: string[],
): void {
  if (toTechnicianJobBucket(line) === "in_progress") signal.inProgress += 1;
  if (cleanText(line.approval_state).toLowerCase() === "pending") {
    signal.pendingApproval += 1;
  }
  if (technicianIds.length === 0) signal.unassigned += 1;
  if (hasActivePartsWaitingSignal(line)) signal.waitingParts += 1;
}

function matchesQueueStatus(
  workOrderStatus: string | null | undefined,
  status: string,
): boolean {
  if (status === "") return isActiveWorkOrderStatus(workOrderStatus);
  return (
    String(workOrderStatus ?? "")
      .trim()
      .toLowerCase()
      .replaceAll(" ", "_") === status
  );
}

/**
 * Technicians cannot read work_orders/work_order_lines directly: the
 * restrictive financial-capability RLS policies deliberately fail closed for
 * any staff actor without sell/invoice visibility, which is why the browser
 * query returned an empty queue while assigned jobs clearly existed. The
 * server bundle is the projection those policies expect such actors to use, so
 * the assigned queue is rebuilt from it here.
 */
function assignedQueueFromBundle(
  bundle: TechnicianOfflineBundle,
  status: string,
): { rows: Row[]; signals: Record<string, WorkOrderSignal> } {
  const rows: Row[] = [];
  const signals: Record<string, WorkOrderSignal> = {};

  for (const entry of bundle.workOrders) {
    const workOrder = entry.workOrder;
    if (workOrder.archived_at) continue;
    if (cleanText(workOrder.record_type) !== "work_order") continue;
    if (!matchesQueueStatus(workOrder.status, status)) continue;

    rows.push({
      ...workOrder,
      customers: entry.customer
        ? {
            first_name: entry.customer.first_name,
            last_name: entry.customer.last_name,
            phone: entry.customer.phone,
          }
        : null,
      vehicles: entry.vehicle
        ? {
            year: entry.vehicle.year,
            make: entry.vehicle.make,
            model: entry.vehicle.model,
            license_plate: entry.vehicle.license_plate,
          }
        : null,
    } as Row);

    const signal = emptySignal();
    for (const line of entry.lines) {
      if ((line.line_type ?? "job") !== "job") continue;
      accumulateLineSignal(
        signal,
        line,
        resolveTechnicianAssignmentContract({
          primaryTechnicianId: line.assigned_tech_id,
          legacyAssignedTo: line.assigned_to,
          canonicalTechnicianIds:
            entry.lineContext.technicianIdsByLine[line.id],
        }).technicianIds,
      );
    }
    signals[workOrder.id] = signal;
  }

  rows.sort(
    (left, right) =>
      new Date(right.created_at ?? 0).getTime() -
      new Date(left.created_at ?? 0).getTime(),
  );

  return { rows, signals };
}

function primarySignal(signal: WorkOrderSignal): string | null {
  if (signal.inProgress > 0) {
    return `${signal.inProgress} active job${signal.inProgress === 1 ? "" : "s"}`;
  }
  if (signal.pendingApproval > 0) {
    return `${signal.pendingApproval} line${signal.pendingApproval === 1 ? "" : "s"} awaiting approval`;
  }
  if (signal.waitingParts > 0) {
    return `${signal.waitingParts} job${signal.waitingParts === 1 ? "" : "s"} waiting for parts`;
  }
  if (signal.unassigned > 0) {
    return `${signal.unassigned} unassigned job${signal.unassigned === 1 ? "" : "s"}`;
  }
  return null;
}

export default function MobileWorkOrderQueue({
  initialStatus = "",
  readyToInvoiceCloseout = false,
  inspectionTemplateId = null,
  embedded = false,
  lockStatus = false,
}: {
  initialStatus?: string;
  readyToInvoiceCloseout?: boolean;
  inspectionTemplateId?: string | null;
  embedded?: boolean;
  lockStatus?: boolean;
}) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [status, setStatus] = useState<string>(initialStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [scopeShopId, setScopeShopId] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lineSignals, setLineSignals] = useState<
    Record<string, WorkOrderSignal>
  >({});
  const [totalCount, setTotalCount] = useState(0);
  const loadGenerationRef = useRef(0);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      const loadGeneration = ++loadGenerationRef.current;
      const isLatestLoad = () => loadGenerationRef.current === loadGeneration;

      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setErrorMessage(null);
      setForbidden(false);

      try {
        const cachedScope = !navigator.onLine
          ? await getSessionMatchedOfflineScope()
          : null;
        if (!navigator.onLine && cachedScope) {
          const cached = await getOfflineSnapshot<WorkOrderListSnapshot>({
            scope: cachedScope,
            kind: "mobile-work-order-list",
            entityId: status || "active",
          });
          if (!isLatestLoad()) return;
          if (cached) {
            setScopeShopId(cachedScope.shopId);
            setRows(cached.data.rows);
            setLineSignals(cached.data.signals);
            setTotalCount(cached.data.totalCount ?? cached.data.rows.length);
            setAssignedOnly(cached.data.assignedOnly ?? false);
            setLastUpdatedAt(new Date(cached.updatedAt));
            return;
          }
          setErrorMessage(
            "No saved work orders are available on this device yet.",
          );
          setRows([]);
          setTotalCount(0);
          return;
        }

        const { data: auth } = await supabase.auth.getUser();
        if (!isLatestLoad()) return;
        if (!auth.user) {
          setErrorMessage("Unauthorized");
          setRows([]);
          setTotalCount(0);
          return;
        }

        const { profile: me, error: profileError } =
          await resolveCanonicalStaffProfile(supabase, auth.user.id);
        if (!isLatestLoad()) return;
        if (profileError) {
          setErrorMessage(profileError);
          setRows([]);
          return;
        }

        const actor = getActorCapabilities({ role: me?.role ?? null });
        const canViewAssignedWork =
          actor.canPerformAssignedWork && !actor.canViewShopWideData;
        const canView = actor.canManageWorkOrders || canViewAssignedWork;
        if (!canView) {
          setForbidden(true);
          setRows([]);
          setTotalCount(0);
          return;
        }
        setAssignedOnly(canViewAssignedWork);

        if (!me?.shop_id) {
          setErrorMessage("Your shop scope could not be resolved.");
          setRows([]);
          setTotalCount(0);
          return;
        }

        const scope = { userId: auth.user.id, shopId: me.shop_id };
        setOfflineMutationScope(scope);
        setScopeShopId(me.shop_id);

        if (canViewAssignedWork) {
          const bundle = await fetchAssignedTechnicianWork({ scope });
          if (!isLatestLoad()) return;
          const assigned = assignedQueueFromBundle(bundle, status);
          setLineSignals(assigned.signals);
          setRows(assigned.rows);
          setTotalCount(assigned.rows.length);
          setLastUpdatedAt(new Date());
          await saveOfflineSnapshot({
            scope,
            kind: "mobile-work-order-list",
            entityId: status || "active",
            data: {
              rows: assigned.rows,
              signals: assigned.signals,
              totalCount: assigned.rows.length,
              assignedOnly: true,
            },
          });
          return;
        }

        let query = supabase
          .from("work_orders")
          .select(
            `
              *,
              customers:customers(first_name,last_name,phone),
              vehicles:vehicles(year,make,model,license_plate)
            `,
            { count: "exact" },
          )
          .eq("shop_id", me.shop_id)
          .eq("record_type", "work_order")
          // Archive preserves the lifecycle status, so an archived record would
          // otherwise still match ACTIVE_WORK_ORDER_STATUSES and show up under
          // Active with a Start that the server rejects.
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(100);

        if (status === "") {
          query = query.in("status", [...ACTIVE_WORK_ORDER_STATUSES]);
        } else {
          query = query.eq("status", status);
        }

        const { data, error, count } = await query;
        if (!isLatestLoad()) return;
        if (error) {
          setErrorMessage(error.message);
          return;
        }

        const list = (data ?? []) as Row[];
        const workOrderIds = list.map((item) => item.id);
        const signals: Record<string, WorkOrderSignal> = {};
        const visibleList = list;

        if (workOrderIds.length > 0) {
          const { data: linesData, error: linesError } = await supabase
            .from("work_order_lines")
            .select(
              "id, work_order_id, status, approval_state, assigned_tech_id, assigned_to, hold_reason",
            )
            .eq("shop_id", me.shop_id)
            .in("work_order_id", workOrderIds);
          if (!isLatestLoad()) return;
          if (linesError) {
            setErrorMessage(linesError.message);
            setRows([]);
            return;
          }

          const lineRows = (linesData ?? []) as WorkOrderLineSummary[];
          const lineIds = lineRows.map((line) => line.id);
          const { data: assignmentData, error: assignmentError } =
            lineIds.length > 0
              ? await supabase
                  .from("work_order_line_technicians")
                  .select("work_order_line_id, technician_id")
                  .in("work_order_line_id", lineIds)
              : { data: [] as WorkOrderLineAssignment[], error: null };
          if (!isLatestLoad()) return;
          if (assignmentError) {
            setErrorMessage(assignmentError.message);
            setRows([]);
            return;
          }

          const assignments =
            (assignmentData ?? []) as WorkOrderLineAssignment[];
          const canonicalIdsByLine = assignments.reduce<Map<string, string[]>>(
            (map, assignment) => {
              const ids = map.get(assignment.work_order_line_id) ?? [];
              ids.push(assignment.technician_id);
              map.set(assignment.work_order_line_id, ids);
              return map;
            },
            new Map(),
          );
          const assignmentByLine = new Map(
            lineRows.map((line) => [
              line.id,
              resolveTechnicianAssignmentContract({
                primaryTechnicianId: line.assigned_tech_id,
                legacyAssignedTo: line.assigned_to,
                canonicalTechnicianIds: canonicalIdsByLine.get(line.id),
              }),
            ]),
          );

          const visibleWorkOrderIds = new Set(
            visibleList.map((workOrder) => workOrder.id),
          );

          lineRows.forEach((item) => {
            const workOrderId = item.work_order_id;
            if (!workOrderId || !visibleWorkOrderIds.has(workOrderId)) return;
            if (!signals[workOrderId]) signals[workOrderId] = emptySignal();
            accumulateLineSignal(
              signals[workOrderId],
              item,
              assignmentByLine.get(item.id)?.technicianIds ?? [],
            );
          });
        }

        if (!isLatestLoad()) return;
        setLineSignals(signals);
        setRows(visibleList);
        setTotalCount(count ?? list.length);
        setLastUpdatedAt(new Date());
        await saveOfflineSnapshot({
          scope,
          kind: "mobile-work-order-list",
          entityId: status || "active",
          data: {
            rows: visibleList,
            signals,
            totalCount: count ?? list.length,
            assignedOnly: false,
          },
        });
      } finally {
        if (isLatestLoad()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [status, supabase],
  );

  const handleLiveRefresh = useCallback(() => load("refresh"), [load]);
  const liveStatus = useOperationsLiveRefresh({
    shopId: scopeShopId,
    onRefresh: handleLiveRefresh,
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("mobile:work_orders:assignments")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_line_technicians",
        },
        () => window.setTimeout(() => void load("refresh"), 80),
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(channel);
      } catch {
        // Realtime cleanup is best effort.
      }
    };
  }, [load, supabase]);

  useEffect(() => {
    const refreshIfOnline = () => {
      if (navigator.onLine) void load("refresh");
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshIfOnline();
    };

    window.addEventListener("focus", refreshIfOnline);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshIfOnline);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const filteredRows = useMemo(() => {
    const search = queryText.trim().toLowerCase();
    if (!search) return rows;

    return rows.filter((row) => {
      const customer = [
        row.customers?.first_name ?? "",
        row.customers?.last_name ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const plate = String(row.vehicles?.license_plate ?? "").toLowerCase();
      const vehicle = [
        row.vehicles?.year ?? "",
        row.vehicles?.make ?? "",
        row.vehicles?.model ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const customId = String(row.custom_id ?? "").toLowerCase();

      return (
        row.id.toLowerCase().includes(search) ||
        customId.includes(search) ||
        customer.includes(search) ||
        plate.includes(search) ||
        vehicle.includes(search)
      );
    });
  }, [queryText, rows]);

  const activeCount = useMemo(
    () => (status === "" ? totalCount : countActiveWorkOrders(rows)),
    [rows, status, totalCount],
  );
  const listReturnHref = useMemo(
    () =>
      buildMobileWorkOrderListHref({
        status,
        readyToInvoiceCloseout,
        inspectionTemplateId,
      }),
    [inspectionTemplateId, readyToInvoiceCloseout, status],
  );

  return (
    <div className="mobile-work-order-queue">
      {!embedded ? (
        <section className="mobile-dashboard-hero">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mobile-dashboard-hero__eyebrow">
                {inspectionTemplateId
                  ? "Inspection setup"
                  : assignedOnly
                    ? "Technician queue"
                    : "Shop operations"}
              </div>
              <h1 className="mobile-dashboard-hero__title">
                {inspectionTemplateId
                  ? "Choose a work order"
                  : assignedOnly
                    ? "My work orders"
                    : "Work orders"}
              </h1>
              <p className="mobile-dashboard-hero__subtitle">
                {inspectionTemplateId
                  ? "Select the work order that contains the job line for this template."
                  : assignedOnly
                    ? `${activeCount} active work order${activeCount === 1 ? "" : "s"} assigned to you.`
                    : `${activeCount} active work order${activeCount === 1 ? "" : "s"} in the current shop flow.`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen((current) => !current)}
                aria-label={searchOpen ? "Close search" : "Search work orders"}
                className="inline-grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 text-white"
              >
                {searchOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Search className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void load("refresh")}
                aria-label="Refresh work orders"
                className="inline-grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 text-white disabled:opacity-55"
                disabled={refreshing}
              >
                <RefreshCw
                  className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {searchOpen ? (
            <div className="relative mt-4">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400"
              />
              <input
                autoFocus
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="Search RO, customer, plate or vehicle"
                className="w-full pl-10 pr-4"
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[11px] text-[color:var(--theme-text-muted)]">
        <span>
          {liveStatus === "live"
            ? "Live updates connected"
            : liveStatus === "connecting"
              ? "Connecting live updates…"
              : "Live updates unavailable — use Refresh"}
        </span>
        <span className="shrink-0">
          Last updated {lastUpdatedAt ? format(lastUpdatedAt, "p") : "—"}
        </span>
      </div>

      <section className="mt-3 overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] shadow-[var(--mobile-shadow)]">
        {!lockStatus ? (
          <div className="flex items-center gap-2 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Filter
              aria-hidden
              className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)]"
            />
            {FILTERS.map((filter) => {
              const active = status === filter.value;
              return (
                <button
                  key={filter.value || "active"}
                  type="button"
                  onClick={() => setStatus(filter.value)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)] text-white"
                      : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-secondary)]"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-[color:var(--theme-border-soft)] px-4 py-2.5 text-xs text-[color:var(--theme-text-secondary)]">
          <span>
            {filteredRows.length} work order
            {filteredRows.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-3">
            {embedded ? (
              <button
                type="button"
                onClick={() => void load("refresh")}
                aria-label="Refresh active repairs"
                className="inline-flex items-center gap-1.5 font-bold text-[color:var(--accent-copper)] disabled:opacity-55"
                disabled={refreshing}
              >
                <RefreshCw
                  aria-hidden
                  className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            ) : null}
            {!assignedOnly && !inspectionTemplateId ? (
              <Link
                href="/mobile/work-orders/create"
                className="inline-flex items-center gap-1.5 font-bold text-[color:var(--accent-copper)]"
              >
                <Plus aria-hidden className="h-4 w-4" />
                Create
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {forbidden ? (
        <div className="mt-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-200">
          You do not have access to mobile work orders.
        </div>
      ) : errorMessage ? (
        <div className="mt-3 rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <section className="mt-3 space-y-2.5" aria-label="Work-order results">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]"
            />
          ))
        ) : filteredRows.length === 0 ? (
          <div className="mobile-command-panel border p-5 text-center">
            <div className="text-base font-bold text-[color:var(--theme-text-primary)]">
              No work orders found
            </div>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              Change the filter or search to see another part of the shop flow.
            </p>
          </div>
        ) : (
          filteredRows.map((workOrder) => {
            const key = statusKey(workOrder.status);
            const vehicle = formatVehicle(workOrder.vehicles);
            const customerName = workOrder.customers
              ? [
                  workOrder.customers.first_name ?? "",
                  workOrder.customers.last_name ?? "",
                ]
                  .filter(Boolean)
                  .join(" ") || "No customer"
              : "No customer";
            const idLabel =
              workOrder.custom_id || `#${workOrder.id.slice(0, 8)}`;
            const signal = lineSignals[workOrder.id] ?? emptySignal();
            const signalText = primarySignal(signal);

            return (
              <Link
                key={workOrder.id}
                href={resolveMobileWorkOrderHref({
                  workOrderId: workOrder.id,
                  status: key,
                  readyToInvoiceCloseout,
                  inspectionTemplateId,
                  returnTo: listReturnHref,
                })}
                className="mobile-command-row relative block overflow-hidden border p-4 pl-5 active:scale-[0.992]"
              >
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1.5 ${STATUS_RAIL[key]}`}
                />
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h2 className="truncate text-base font-extrabold tracking-[-0.025em] text-[color:var(--theme-text-primary)]">
                        {vehicle.label || "Vehicle not linked"}
                      </h2>
                      {vehicle.plate ? (
                        <span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[0.65rem] font-semibold text-[color:var(--theme-text-secondary)]">
                          {vehicle.plate}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 text-xs font-medium text-[color:var(--theme-text-secondary)]">
                      {idLabel} · {customerName}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[color:var(--theme-text-primary)]">
                        {STATUS_LABEL[key]}
                      </span>
                      {workOrder.created_at ? (
                        <span className="text-[0.68rem] text-[color:var(--theme-text-muted)]">
                          {format(new Date(workOrder.created_at), "MMM d")}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-xs leading-4 text-[color:var(--theme-text-secondary)]">
                      {signalText ||
                        "Open to review jobs and current operational state."}
                    </p>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="mt-1 h-5 w-5 shrink-0 text-[color:var(--accent-copper)]"
                  />
                </div>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}
