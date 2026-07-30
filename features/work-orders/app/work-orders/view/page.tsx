"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { normalizeWorkOrderStatus } from "@/features/work-orders/lib/work-order-status";
import {
  countWorkOrdersBySummary,
  filterWorkOrdersBySummary,
  toggleWorkOrderSummaryFilter,
  type WorkOrderSummaryFilter,
} from "@/features/work-orders/lib/workOrderListFilters";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

import { WorkOrderAssignedSummary } from "@/features/work-orders/components/WorkOrderAssignedSummary";
import StatusPickerModal, {
  type WorkOrderStatus,
} from "@/features/work-orders/components/workorders/extras/StatusPickerModal";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

type Row = WorkOrder & {
  is_waiter?: boolean | null;
  customers: Pick<
    Customer,
    "first_name" | "last_name" | "phone" | "email"
  > | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

type ReviewIssue = { kind: string; lineId?: string; message: string };
type ReviewResponse = { ok: boolean; issues: ReviewIssue[] };

type StatusKey =
  | "new"
  | "awaiting"
  | "awaiting_inspection"
  | "recommended"
  | "awaiting_approval"
  | "waiting_parts"
  | "approved"
  | "in_progress"
  | "on_hold"
  | "queued"
  | "planned"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

type TechRollup = "awaiting" | "in_progress" | "on_hold" | "completed";

const ACTIVE_FLOW_STATUSES = [
  "new",
  "awaiting",
  "awaiting_inspection",
  "recommended",
  "awaiting_approval",
  "waiting_parts",
  "approved",
  "in_progress",
  "on_hold",
  "ready_to_invoice",
] as const satisfies readonly StatusKey[];

const LEGACY_ACTIVE_FLOW_STATUSES = [
  "queued",
  "planned",
] as const satisfies readonly StatusKey[];

const ACTIVE_STATUS_FILTER = [
  ...ACTIVE_FLOW_STATUSES,
  ...LEGACY_ACTIVE_FLOW_STATUSES,
] as const satisfies readonly StatusKey[];

const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_STATUS_FILTER);

const SEEDED_DEFAULT_STATUSES = [
  ...ACTIVE_STATUS_FILTER,
  "completed",
] as const satisfies readonly StatusKey[];
const ACTIVE_LINE_EXCLUDED = new Set([
  "completed",
  "invoiced",
  "closed",
  "cancelled",
  "declined",
]);

const INPUT_DARK =
  "w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)] focus:border-sky-400/70 focus:ring-2 focus:ring-sky-500/30";

const SELECT_DARK =
  "w-full rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-500/30";

function isStatusKey(x: string): x is StatusKey {
  return (
    x === "new" ||
    x === "awaiting" ||
    x === "awaiting_inspection" ||
    x === "recommended" ||
    x === "awaiting_approval" ||
    x === "waiting_parts" ||
    x === "approved" ||
    x === "in_progress" ||
    x === "on_hold" ||
    x === "queued" ||
    x === "planned" ||
    x === "completed" ||
    x === "ready_to_invoice" ||
    x === "invoiced"
  );
}

function normalizeStatusKey(value: unknown): string {
  const key = String(value ?? "new")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");
  return isStatusKey(key) ? key : normalizeWorkOrderStatus(key);
}

function workOrderDisplayId(
  workOrder: Pick<WorkOrder, "id" | "custom_id">,
): string {
  const customId = String(workOrder.custom_id ?? "").trim();
  return customId || `#${workOrder.id.slice(0, 8)}`;
}

function isStatusPickerStatus(x: string): x is WorkOrderStatus {
  return (
    x === "awaiting_approval" ||
    x === "awaiting" ||
    x === "queued" ||
    x === "in_progress" ||
    x === "on_hold" ||
    x === "planned" ||
    x === "completed" ||
    x === "ready_to_invoice" ||
    x === "invoiced"
  );
}

function rollupTechStatus(lines: Array<Pick<Line, "status">>): TechRollup {
  const s = new Set(
    (lines ?? []).map((l) => String(l.status ?? "awaiting").toLowerCase()),
  );

  if (s.has("in_progress")) return "in_progress";
  if (s.has("on_hold")) return "on_hold";
  if (
    (lines ?? []).length > 0 &&
    (lines ?? []).every((l) => (l.status ?? "") === "completed")
  ) {
    return "completed";
  }
  return "awaiting";
}

function stageAccent(status: string | null | undefined): {
  badge: string;
  border: string;
  progress: string;
} {
  const key = String(status ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_");

  if (key === "in_progress") {
    return {
      badge: "border-sky-500/45 bg-sky-500/10 text-sky-700 dark:text-sky-100",
      border: "border-sky-500/30",
      progress: "bg-sky-500",
    };
  }

  if (
    key === "new" ||
    key === "awaiting" ||
    key === "awaiting_inspection" ||
    key === "recommended"
  ) {
    return {
      badge: "border-sky-500/45 bg-sky-500/10 text-sky-700 dark:text-sky-100",
      border: "border-sky-500/25",
      progress: "bg-sky-400",
    };
  }

  if (key === "awaiting_approval") {
    return {
      badge:
        "border-blue-500/45 bg-blue-500/10 text-blue-700 dark:text-blue-100",
      border: "border-blue-500/25",
      progress: "bg-blue-400",
    };
  }

  if (key === "queued") {
    return {
      badge:
        "border-indigo-500/45 bg-indigo-500/10 text-indigo-700 dark:text-indigo-100",
      border: "border-indigo-500/25",
      progress: "bg-indigo-400",
    };
  }

  if (key === "approved") {
    return {
      badge:
        "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100",
      border: "border-emerald-500/25",
      progress: "bg-emerald-400",
    };
  }

  if (key === "on_hold" || key === "waiting_parts") {
    return {
      badge:
        "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-100",
      border: "border-sky-500/25",
      progress: "bg-amber-400",
    };
  }

  if (key === "planned") {
    return {
      badge:
        "border-purple-500/45 bg-purple-500/10 text-purple-700 dark:text-purple-100",
      border: "border-purple-500/30",
      progress: "bg-purple-400",
    };
  }

  if (key === "completed" || key === "ready_to_invoice") {
    return {
      badge:
        "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100",
      border: "border-emerald-500/25",
      progress: "bg-emerald-400",
    };
  }

  if (key === "invoiced") {
    return {
      badge:
        "border-teal-500/45 bg-teal-500/10 text-teal-700 dark:text-teal-100",
      border: "border-teal-500/25",
      progress: "bg-teal-400",
    };
  }

  return {
    badge: "border-sky-500/45 bg-sky-500/10 text-sky-700 dark:text-sky-100",
    border: "border-sky-500/25",
    progress: "bg-sky-400",
  };
}

function priorityLabel(priority: number | null | undefined): string | null {
  if (priority === 1) return "Urgent";
  if (priority === 2) return "High";
  if (priority === 3) return "Normal";
  if (priority === 4) return "Low";
  return null;
}

function priorityChip(priority: number | null | undefined): string {
  if (priority === 1) {
    return "border-red-500/45 bg-red-500/10 text-red-700 dark:text-red-100";
  }
  if (priority === 2) {
    return "border-orange-500/45 bg-orange-500/10 text-orange-700 dark:text-orange-100";
  }
  if (priority === 4) {
    return "border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-secondary)]";
  }
  return "border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-secondary)]";
}

export default function WorkOrdersView(): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [summaryFilter, setSummaryFilter] =
    useState<WorkOrderSummaryFilter | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isSeededShop, setIsSeededShop] = useState(false);

  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [techs, setTechs] = useState<
    Array<Pick<Profile, "id" | "full_name" | "role">>
  >([]);
  const [selectedTechId, setSelectedTechId] = useState<string>("");

  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [, setAssignVersion] = useState(0);

  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [reviewByWo, setReviewByWo] = useState<
    Record<string, ReviewResponse | undefined>
  >({});
  const [techRollupByWo, setTechRollupByWo] = useState<
    Record<string, TechRollup>
  >({});
  const [assignedByWo, setAssignedByWo] = useState<Record<string, boolean>>({});
  const [hasLinesByWo, setHasLinesByWo] = useState<Record<string, boolean>>({});

  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [statusPickerWoId, setStatusPickerWoId] = useState<string | null>(null);
  const [statusPickerCurrent, setStatusPickerCurrent] =
    useState<WorkOrderStatus>("awaiting");
  const workforceDrilldownActive = useMemo(
    () =>
      searchParams.get("assignment") === "unassigned" &&
      searchParams.get("status") === "active" &&
      searchParams.get("source") === "workforce",
    [searchParams],
  );

  const openStatusPicker = useCallback((wo: Row) => {
    const raw = String(wo.status ?? "awaiting")
      .toLowerCase()
      .replaceAll(" ", "_");

    const current = isStatusPickerStatus(raw) ? raw : "awaiting";

    setStatusPickerWoId(wo.id);
    setStatusPickerCurrent(current);
    setStatusPickerOpen(true);
  }, []);

  const applyWorkOrderStatus = useCallback(
    async (woId: string, next: WorkOrderStatus) => {
      const { error } = await supabase
        .from("work_orders")
        .update({
          status: next,
        } as DB["public"]["Tables"]["work_orders"]["Update"])
        .eq("id", woId);

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(`Status updated → ${next.replaceAll("_", " ")}`);
    },
    [supabase],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        vehicles:vehicles(year,make,model,license_plate)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (status === "") {
      const defaultStatuses = isSeededShop
        ? SEEDED_DEFAULT_STATUSES
        : ACTIVE_STATUS_FILTER;
      query = query.in("status", [...defaultStatuses]);
    } else {
      query = query.eq("status", status);
    }

    let data: Row[] | null = null;
    let error: { message: string } | null = null;

    if (workforceDrilldownActive) {
      const { data: activeLines, error: activeLinesErr } = await supabase
        .from("work_order_lines")
        .select(
          "id, work_order_id, assigned_tech_id, line_status, status, voided_at",
        )
        .is("voided_at", null);
      if (activeLinesErr) {
        setErr(activeLinesErr.message);
        setRows([]);
        setTechRollupByWo({});
        setAssignedByWo({});
        setHasLinesByWo({});
        setLoading(false);
        return;
      }

      const scopedActiveLines = (activeLines ?? []).filter(
        (line) =>
          !ACTIVE_LINE_EXCLUDED.has(
            String(line.line_status ?? line.status ?? "").toLowerCase(),
          ),
      );
      const lineIds = scopedActiveLines.map((line) => line.id);
      const { data: bridgeRows, error: bridgeErr } = lineIds.length
        ? await supabase
            .from("work_order_line_technicians")
            .select("work_order_line_id")
            .in("work_order_line_id", lineIds)
        : { data: [], error: null };

      if (bridgeErr) {
        setErr(bridgeErr.message);
        setRows([]);
        setTechRollupByWo({});
        setAssignedByWo({});
        setHasLinesByWo({});
        setLoading(false);
        return;
      }

      const hasBridgeAssignment = new Set(
        (bridgeRows ?? []).map((row) => row.work_order_line_id),
      );
      const unassignedWorkOrderIds = Array.from(
        new Set(
          scopedActiveLines
            .filter(
              (line) =>
                !line.assigned_tech_id && !hasBridgeAssignment.has(line.id),
            )
            .map((line) => line.work_order_id)
            .filter(Boolean),
        ),
      );

      if (unassignedWorkOrderIds.length === 0) {
        data = [];
      } else {
        const result = await query.in("id", unassignedWorkOrderIds);
        data = (result.data ?? []) as Row[];
        error = result.error;
      }
    } else {
      const result = await query;
      data = (result.data ?? []) as Row[];
      error = result.error;
    }

    if (error) {
      setErr(error.message);
      setRows([]);
      setTechRollupByWo({});
      setAssignedByWo({});
      setHasLinesByWo({});
      setLoading(false);
      return;
    }

    const workOrders = (data ?? []) as Row[];
    const customerIds = Array.from(
      new Set(
        workOrders
          .map((row) => row.customer_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (customerIds.length > 0) {
      const { data: customerRows, error: customerErr } = await supabase
        .from("customers")
        .select("id,first_name,last_name,phone,email")
        .in("id", customerIds);

      if (customerErr) {
        console.warn(
          "[WorkOrdersView] customer lookup failed; showing work orders without customer details:",
          customerErr.message,
        );
      } else {
        const customersById = new Map(
          (customerRows ?? []).map((customer) => [customer.id, customer]),
        );

        workOrders.forEach((row) => {
          row.customers = row.customer_id
            ? (customersById.get(row.customer_id) ?? null)
            : null;
        });
      }
    }

    const qlc = q.trim().toLowerCase();

    const filtered =
      qlc.length === 0
        ? workOrders
        : workOrders.filter((r) => {
            const name = [
              r.customers?.first_name ?? "",
              r.customers?.last_name ?? "",
            ]
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

    const ids = filtered.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) {
      setTechRollupByWo({});
      setAssignedByWo({});
      setHasLinesByWo({});
      setLoading(false);
      return;
    }

    const { data: lines, error: lnErr } = await supabase
      .from("work_order_lines")
      .select("id,work_order_id,status,assigned_tech_id")
      .in("work_order_id", ids);

    if (lnErr) {
      console.warn(
        "[WorkOrdersView] failed to load lines for rollup:",
        lnErr.message,
      );
      setTechRollupByWo({});
      setAssignedByWo({});
      setHasLinesByWo({});
      setLoading(false);
      return;
    }

    const lineRows = (lines ?? []) as Array<
      Pick<Line, "id" | "work_order_id" | "status" | "assigned_tech_id">
    >;
    const lineIds = lineRows.map((line) => line.id).filter(Boolean);
    const { data: bridgeAssignments, error: bridgeAssignErr } = lineIds.length
      ? await supabase
          .from("work_order_line_technicians")
          .select("work_order_line_id")
          .in("work_order_line_id", lineIds)
      : { data: [], error: null };

    if (bridgeAssignErr) {
      console.warn(
        "[WorkOrdersView] failed to load assignment bridge rows:",
        bridgeAssignErr.message,
      );
    }

    const bridgeAssignedLineIds = new Set(
      (bridgeAssignments ?? [])
        .map((row) => row.work_order_line_id)
        .filter(Boolean),
    );

    const map: Record<string, Array<Pick<Line, "status">>> = {};
    const assignedMap: Record<string, boolean> = {};
    const hasLinesMap: Record<string, boolean> = {};
    lineRows.forEach((l) => {
      const woId = l.work_order_id;
      if (!woId) return;
      hasLinesMap[woId] = true;
      if (!map[woId]) map[woId] = [];
      map[woId].push(l);

      if (l.assigned_tech_id || bridgeAssignedLineIds.has(l.id)) {
        assignedMap[woId] = true;
      }
    });

    const rollups: Record<string, TechRollup> = {};
    ids.forEach((woId) => {
      rollups[woId] = rollupTechStatus(map[woId] ?? []);
      assignedMap[woId] = Boolean(assignedMap[woId]);
      hasLinesMap[woId] = Boolean(hasLinesMap[woId]);
    });

    setTechRollupByWo(rollups);
    setAssignedByWo(assignedMap);
    setHasLinesByWo(hasLinesMap);
    setLoading(false);
  }, [isSeededShop, q, status, supabase, workforceDrilldownActive]);

  const runInvoiceReview = useCallback(
    async (woId: string) => {
      try {
        setReviewLoadingId(woId);

        const res = await fetch(`/api/work-orders/${woId}/invoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const raw = await res.text();

        let parsed: unknown = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }

        if (!res.ok) {
          console.error("[invoice-review] Non-OK response", {
            status: res.status,
            statusText: res.statusText,
            raw,
          });
          toast.error(`Invoice review failed (${res.status}).`);
          return;
        }

        if (
          !parsed ||
          typeof parsed !== "object" ||
          typeof (parsed as Record<string, unknown>).ok !== "boolean"
        ) {
          console.error("[invoice-review] Invalid JSON shape", { raw, parsed });
          toast.error("Invoice review failed (invalid response shape).");
          return;
        }

        const obj = parsed as Record<string, unknown>;
        const issues = Array.isArray(obj.issues)
          ? (obj.issues as ReviewIssue[])
          : [];

        const safeResult: ReviewResponse = {
          ok: Boolean(obj.ok),
          issues,
        };

        setReviewByWo((prev) => ({ ...prev, [woId]: safeResult }));

        if (safeResult.ok) {
          toast.success("Invoice review passed ✅");

          const current = rows.find((r) => r.id === woId);
          const statusLower = String(current?.status ?? "")
            .toLowerCase()
            .replaceAll(" ", "_");

          if (statusLower === "completed") {
            const operationKey = crypto.randomUUID();
            const readyResponse = await fetch(
              `/api/work-orders/${woId}/mark-ready`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Idempotency-Key": operationKey,
                },
                body: JSON.stringify({ operationKey }),
              },
            );
            const readyPayload = (await readyResponse
              .json()
              .catch(() => null)) as { error?: string } | null;

            if (!readyResponse.ok) {
              console.warn(
                "[invoice-review] could not advance status:",
                readyPayload?.error ?? readyResponse.statusText,
              );
              toast.error(
                readyPayload?.error ??
                  "Work order could not be marked ready to invoice.",
              );
            } else {
              toast.success("Moved to Ready to invoice");
            }
          }

          await load();
        } else {
          toast.error(
            `Invoice review found ${issues.length} issue(s)${
              issues[0]?.message ? `: ${issues[0].message}` : ""
            }`,
          );
        }
      } catch (e) {
        console.error("[invoice-review] crash:", e);
        toast.error("Invoice review crashed");
      } finally {
        setReviewLoadingId(null);
      }
    },
    [load, rows],
  );

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

      const { data: seededRow, error: seededErr } = await supabase
        .from("work_orders")
        .select("id")
        .not("source_intake_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (seededErr) {
        console.warn(
          "[WorkOrdersView] failed to detect Shop Boost seed state:",
          seededErr.message,
        );
      }
      setIsSeededShop(Boolean(seededRow?.id));

      try {
        const res = await fetch("/api/assignables");
        const json = (await res.json()) as {
          data?: Array<Pick<Profile, "id" | "full_name" | "role">>;
        };

        if (res.ok) {
          setTechs(json.data ?? []);
        } else {
          console.warn("Failed to load mechanics:", json);
        }
      } catch (e) {
        console.warn("Failed to load mechanics:", e);
      }
    })();
  }, [supabase]);

  const currentActor = getActorCapabilities({ role: currentRole });
  const canAssign = currentActor.canAssignWork;
  const canPickStatus = currentActor.canManageWorkOrders;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("work_orders:list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => {
          setTimeout(() => void load(), 60);
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase, load]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this work order? This cannot be undone.")) return;

      const prev = rows;
      setRows((r) => r.filter((x) => x.id !== id));

      const response = await fetch(`/api/work-orders/${id}/delete-draft`, {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        alert(result?.error ?? "Failed to delete the work order.");
        setRows(prev);
      } else {
        setTechRollupByWo((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
      }
    },
    [rows],
  );

  const handleAssignAll = useCallback(
    async (woId: string) => {
      if (!selectedTechId) {
        alert("Choose a mechanic first.");
        return;
      }

      try {
        const res = await fetch("/api/work-orders/assign-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            work_order_id: woId,
            tech_id: selectedTechId,
            only_unassigned: true,
          }),
        });

        const json = (await res.json()) as { error?: string };

        if (!res.ok) {
          alert(json.error || "Failed to assign.");
          return;
        }

        setAssigningFor(null);
        setSelectedTechId("");
        await load();
        setAssignVersion((v) => v + 1);
        toast.success("Work order assigned to mechanic.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to assign.";
        alert(msg);
      }
    },
    [selectedTechId, load],
  );

  const openInvoicePage = useCallback(
    (woId: string) => {
      if (!woId) return;
      router.push(`/work-orders/invoice/${woId}`);
    },
    [router],
  );

  const total = rows.length;
  const summaryNow = useMemo(() => Date.now(), [rows]);

  const activeCount = useMemo(
    () =>
      rows.filter((r) => ACTIVE_STATUS_SET.has(normalizeStatusKey(r.status)))
        .length,
    [rows],
  );

  const waiterCount = useMemo(
    () => rows.filter((r) => Boolean(r.is_waiter)).length,
    [rows],
  );

  const readyToWorkCount = useMemo(
    () => countWorkOrdersBySummary(rows, "ready_to_work", summaryNow),
    [rows, summaryNow],
  );

  const waitingPartsCount = useMemo(
    () => countWorkOrdersBySummary(rows, "waiting_parts", summaryNow),
    [rows, summaryNow],
  );

  const readyToInvoiceCount = useMemo(
    () => countWorkOrdersBySummary(rows, "ready_to_invoice", summaryNow),
    [rows, summaryNow],
  );

  const atRiskCount = useMemo(
    () => countWorkOrdersBySummary(rows, "at_risk", summaryNow),
    [rows, summaryNow],
  );

  const needsAttentionCount = useMemo(
    () =>
      rows.filter((row) => {
        const statusKey = normalizeStatusKey(row.status);
        const updatedAt = new Date(
          row.updated_at ?? row.created_at ?? summaryNow,
        ).getTime();
        return (
          Number(row.priority ?? 3) === 1 ||
          statusKey === "awaiting_approval" ||
          statusKey === "waiting_parts" ||
          summaryNow - updatedAt >= 3 * 86400000
        );
      }).length,
    [rows, summaryNow],
  );

  const visibleRows = useMemo(
    () => filterWorkOrdersBySummary(rows, summaryFilter, summaryNow),
    [rows, summaryFilter, summaryNow],
  );

  const summaryCards = [
    {
      label: "At risk",
      value: atRiskCount,
      icon: AlertTriangle,
      tone: "text-orange-600 dark:text-orange-300",
      filter: "at_risk",
    },
    {
      label: "Ready to work",
      value: readyToWorkCount,
      icon: CheckCircle2,
      tone: "text-blue-600 dark:text-blue-300",
      filter: "ready_to_work",
    },
    {
      label: "Waiting parts",
      value: waitingPartsCount,
      icon: Clock3,
      tone: "text-amber-600 dark:text-amber-300",
      filter: "waiting_parts",
    },
    {
      label: "Ready to invoice",
      value: readyToInvoiceCount,
      icon: ClipboardCheck,
      tone: "text-emerald-600 dark:text-emerald-300",
      filter: "ready_to_invoice",
    },
  ] as const;

  return (
    <div
      className="-mx-3 min-h-[calc(100vh-4.25rem)] bg-[color:var(--desktop-bg-secondary)] px-3 py-5 text-foreground md:-mx-4 md:px-4 lg:-mx-6 lg:px-6 xl:-mx-8 xl:px-8 2xl:-mx-10 2xl:px-10"
      style={{ backgroundImage: "var(--app-shell-wash)" }}
    >
      <div className="mx-auto max-w-[1600px] space-y-4">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
              Operations
            </div>
            <h1
              className="mt-1 text-3xl text-[color:var(--theme-text-primary)]"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Work Orders
            </h1>
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              {total} work orders · {activeCount} active ·{" "}
              <span className="font-semibold text-[var(--brand-primary,#1747FF)]">
                {needsAttentionCount} need attention
              </span>
              {waiterCount > 0 ? ` · ${waiterCount} waiters` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/assistant?pageType=work_orders&pageTitle=Work%20Orders"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 text-sm font-semibold text-[color:var(--brand-primary,#1747FF)] transition hover:border-[color:var(--brand-primary,#1747FF)]/60"
            >
              Ask Assistant
            </Link>
            <Link
              href="/work-orders/create"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand-primary,#1747FF)] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
              Create work order
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-3 shadow-[var(--desktop-shadow-card)]">
          {workforceDrilldownActive ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-sm text-sky-700 dark:text-sky-100">
              <span>
                Filtered from Workforce Overview: Unassigned active jobs
              </span>
              <Link
                href="/work-orders/view"
                className="font-semibold underline underline-offset-2 hover:text-[color:var(--theme-text-primary)]"
              >
                Clear filter
              </Link>
            </div>
          ) : null}

          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_230px_auto]">
            <label className="relative">
              <span className="sr-only">Search work orders</span>
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void load()}
                placeholder="Search work order, customer, plate, or vehicle…"
                className={`${INPUT_DARK} h-11 pl-9`}
              />
            </label>

            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setSummaryFilter(null);
              }}
              className={`${SELECT_DARK} h-11`}
              aria-label="Filter by status"
            >
              <option value="">Active</option>
              <option value="new">New</option>
              <option value="awaiting">Awaiting</option>
              <option value="awaiting_inspection">Awaiting inspection</option>
              <option value="recommended">Recommended</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="waiting_parts">Waiting parts</option>
              <option value="approved">Approved</option>
              <option value="queued">Queued (legacy)</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="planned">Planned (legacy)</option>
              <option value="completed">Completed (review)</option>
              <option value="ready_to_invoice">Ready to invoice</option>
              <option value="invoiced">Invoiced</option>
            </select>

            <button
              type="button"
              onClick={() => {
                void load();
                setAssignVersion((version) => version + 1);
              }}
              className="grid h-11 w-full place-items-center rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--brand-primary,#1747FF)]/60 lg:w-11"
              aria-label="Refresh work orders"
              title="Refresh work orders"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </section>

        {!loading && !err ? (
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map(({ label, value, icon: Icon, tone, filter }) => {
              const selected = summaryFilter === filter;
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setSummaryFilter((current) =>
                      toggleWorkOrderSummaryFilter(current, filter),
                    )
                  }
                  className={`flex items-center gap-3 rounded-xl border bg-[color:var(--desktop-item-bg)] px-4 py-3 text-left shadow-sm transition hover:border-[color:var(--brand-primary,#1747FF)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary,#1747FF)]/50 ${
                    selected
                      ? "border-[color:var(--brand-primary,#1747FF)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand-primary,#1747FF)_30%,transparent)]"
                      : "border-[color:var(--desktop-border)]"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${tone}`} />
                  <span className="flex-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {label}
                  </span>
                  <strong className={`text-xl ${tone}`}>{value}</strong>
                </button>
              );
            })}
          </section>
        ) : null}

        {err ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-100">
            {err}
          </div>
        ) : null}

        {loading ? (
          <section className="space-y-2 rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]"
              />
            ))}
          </section>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
            {workforceDrilldownActive
              ? "No unassigned active jobs right now."
              : summaryFilter
                ? "No work orders match the selected summary filter."
                : "No work orders match your current filters."}
          </div>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--desktop-shadow-card)]">
            <div className="hidden grid-cols-[minmax(190px,1.25fr)_minmax(170px,1fr)_minmax(210px,1.25fr)_minmax(170px,.9fr)_90px] gap-3 border-b border-[color:var(--desktop-border)] px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)] lg:grid">
              <span>Work order</span>
              <span>Vehicle</span>
              <span>Operational state</span>
              <span>Assigned</span>
              <span className="text-right">Age</span>
            </div>

            <div className="space-y-2 p-2">
              {visibleRows.map((row) => {
                const displayId = workOrderDisplayId(row);
                const href = `/work-orders/${row.custom_id ?? row.id}?mode=view`;
                const isAssigning = assigningFor === row.id;
                const customerName = row.customers
                  ? [
                      row.customers.first_name ?? "",
                      row.customers.last_name ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : "";
                const vehicleLabel = row.vehicles
                  ? `${row.vehicles.year ?? ""} ${row.vehicles.make ?? ""} ${row.vehicles.model ?? ""}`.trim()
                  : "";
                const plate = row.vehicles?.license_plate ?? "";
                const statusLower = normalizeStatusKey(row.status);
                const isInvoiceStage =
                  statusLower === "ready_to_invoice" ||
                  statusLower === "completed";
                const review = reviewByWo[row.id];
                const reviewedOk = Boolean(review?.ok);
                const issueCount = review?.issues?.length ?? 0;
                const techRollup = techRollupByWo[row.id] ?? "awaiting";
                const canonicalStatus = normalizeWorkOrderStatus(row.status);
                const hasAssignedTech = Boolean(assignedByWo[row.id]);
                const hasWorkLines = Boolean(hasLinesByWo[row.id]);
                const shouldShowInspectionPending =
                  !row.inspection_id &&
                  !hasWorkLines &&
                  ["new", "awaiting", "awaiting_inspection"].includes(
                    canonicalStatus,
                  );
                const staleDays = Math.max(
                  0,
                  Math.floor(
                    (Date.now() -
                      new Date(
                        row.updated_at ?? row.created_at ?? Date.now(),
                      ).getTime()) /
                      86400000,
                  ),
                );
                const accent = stageAccent(row.status);
                const priority = priorityLabel(row.priority);
                const progressPct =
                  techRollup === "completed"
                    ? 100
                    : techRollup === "in_progress"
                      ? 55
                      : techRollup === "on_hold"
                        ? 25
                        : 8;
                const operationalNote =
                  canonicalStatus === "awaiting_approval"
                    ? "Needs approval"
                    : canonicalStatus === "waiting_parts" ||
                        techRollup === "on_hold"
                      ? "Waiting for parts"
                      : !hasAssignedTech
                        ? "Technician unassigned"
                        : shouldShowInspectionPending
                          ? "Inspection pending"
                          : canonicalStatus === "ready_to_invoice"
                            ? "Invoice review ready"
                            : `Technician ${techRollup.replaceAll("_", " ")}`;

                return (
                  <article
                    key={row.id}
                    className={`relative overflow-hidden rounded-xl border bg-[color:var(--desktop-item-bg)] transition hover:border-[color:var(--brand-primary,#1747FF)]/55 hover:shadow-md ${accent.border}`}
                  >
                    <div
                      className={`absolute inset-y-0 left-0 w-1 ${accent.progress}`}
                    />

                    <div className="grid gap-3 px-4 py-3 pl-5 lg:grid-cols-[minmax(190px,1.25fr)_minmax(170px,1fr)_minmax(210px,1.25fr)_minmax(170px,.9fr)_90px] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={href}
                            className="font-extrabold text-[color:var(--theme-text-primary)] hover:text-[color:var(--brand-primary,#1747FF)]"
                          >
                            {displayId}
                          </Link>
                          {row.is_waiter ? (
                            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-100">
                              Waiter
                            </span>
                          ) : null}
                          {priority ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${priorityChip(
                                row.priority,
                              )}`}
                            >
                              {priority}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {customerName || "No customer"}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)] lg:hidden">
                          Vehicle
                        </div>
                        <div className="truncate text-sm text-[color:var(--theme-text-primary)]">
                          {vehicleLabel || "No vehicle"}
                        </div>
                        {plate ? (
                          <div className="mt-0.5 truncate text-xs text-[color:var(--theme-text-muted)]">
                            {plate}
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${accent.badge}`}
                          >
                            {canonicalStatus.replaceAll("_", " ")}
                          </span>
                          <span className="truncate text-xs font-medium text-[color:var(--theme-text-secondary)]">
                            {operationalNote}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
                            <div
                              className={`h-full rounded-full ${accent.progress}`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10px] text-[color:var(--theme-text-muted)]">
                            {progressPct}%
                          </span>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)] lg:hidden">
                          Assigned
                        </div>
                        <div className="min-h-[28px]">
                          <WorkOrderAssignedSummary workOrderId={row.id} />
                        </div>
                        {!hasAssignedTech ? (
                          <div className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-100">
                            <UserRound className="h-3.5 w-3.5" />
                            Unassigned
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between gap-3 lg:justify-end">
                        <div className="text-left lg:text-right">
                          <div
                            className={
                              staleDays >= 3
                                ? "text-sm font-bold text-red-600 dark:text-red-300"
                                : "text-sm font-semibold text-[color:var(--theme-text-primary)]"
                            }
                          >
                            {staleDays === 0 ? "Today" : `${staleDays}d`}
                          </div>
                          <div
                            className="mt-0.5 text-[10px] text-[color:var(--theme-text-muted)]"
                            title={
                              row.created_at
                                ? format(new Date(row.created_at), "PP")
                                : undefined
                            }
                          >
                            since update
                          </div>
                        </div>
                        <Link
                          href={href}
                          aria-label={`Open ${displayId}`}
                          className="grid h-9 w-9 place-items-center rounded-lg text-[color:var(--theme-text-muted)] transition hover:bg-[color:var(--theme-surface-hover)] hover:text-[color:var(--brand-primary,#1747FF)]"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-subtle)] px-4 py-2 pl-5">
                      <Link
                        href={href}
                        className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--brand-primary,#1747FF)]/60"
                      >
                        Open
                      </Link>

                      {canPickStatus ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openStatusPicker(row);
                          }}
                          className="rounded-lg border border-purple-500/45 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-700 transition hover:bg-purple-500/15 dark:text-purple-100"
                        >
                          Change stage
                        </button>
                      ) : null}

                      {isInvoiceStage ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void runInvoiceReview(row.id);
                          }}
                          disabled={reviewLoadingId === row.id || reviewedOk}
                          className="rounded-lg border border-emerald-500/45 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/15 disabled:opacity-55 dark:text-emerald-100"
                        >
                          {reviewedOk
                            ? "Reviewed"
                            : reviewLoadingId === row.id
                              ? "Reviewing…"
                              : "Invoice review"}
                        </button>
                      ) : null}

                      {statusLower === "ready_to_invoice" ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openInvoicePage(row.id);
                          }}
                          disabled={!reviewedOk}
                          className="rounded-lg border border-sky-500/45 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-100"
                        >
                          Invoice
                        </button>
                      ) : null}

                      {canAssign && !isAssigning ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setAssigningFor(row.id);
                            setSelectedTechId("");
                          }}
                          className="rounded-lg border border-sky-500/45 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/15 dark:text-sky-100"
                        >
                          Assign work order
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(row.id);
                        }}
                        className="ml-auto rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-500/15 dark:text-red-100"
                      >
                        Delete
                      </button>

                      {review && !reviewedOk ? (
                        <span className="text-xs font-medium text-orange-700 dark:text-orange-200">
                          {issueCount} invoice issue
                          {issueCount === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>

                    {canAssign && isAssigning ? (
                      <div
                        className="border-t border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] px-4 py-3 pl-5"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                          Assign unassigned lines
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            value={selectedTechId}
                            onChange={(event) =>
                              setSelectedTechId(event.target.value)
                            }
                            className={`${SELECT_DARK} min-w-[220px] px-3 py-2 text-xs`}
                          >
                            <option value="">Pick mechanic…</option>
                            {techs.map((tech) => (
                              <option key={tech.id} value={tech.id}>
                                {tech.full_name ?? "(no name)"}{" "}
                                {tech.role ? `(${tech.role})` : ""}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleAssignAll(row.id);
                            }}
                            className="rounded-lg bg-[var(--brand-primary,#1747FF)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setAssigningFor(null);
                              setSelectedTechId("");
                            }}
                            className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {statusPickerOpen && statusPickerWoId ? (
          <StatusPickerModal
            isOpen={statusPickerOpen}
            onClose={() => setStatusPickerOpen(false)}
            current={statusPickerCurrent}
            onChange={async (pick) => {
              const workOrderId = statusPickerWoId;
              const next = pick.replace("status:", "") as WorkOrderStatus;
              await applyWorkOrderStatus(workOrderId, next);
              await load();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
