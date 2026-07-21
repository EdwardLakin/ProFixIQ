"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { toast } from "sonner";
import { normalizeWorkOrderStatus } from "@/features/work-orders/lib/work-order-status";
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
  customers:
    | Pick<Customer, "first_name" | "last_name" | "phone" | "email">
    | null;
  vehicles:
    | Pick<Vehicle, "year" | "make" | "model" | "license_plate">
    | null;
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

const LEGACY_ACTIVE_FLOW_STATUSES = ["queued", "planned"] as const satisfies readonly StatusKey[];

const ACTIVE_STATUS_FILTER = [
  ...ACTIVE_FLOW_STATUSES,
  ...LEGACY_ACTIVE_FLOW_STATUSES,
] as const satisfies readonly StatusKey[];

const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_STATUS_FILTER);

const SEEDED_DEFAULT_STATUSES = [...ACTIVE_STATUS_FILTER, "completed"] as const satisfies readonly StatusKey[];
const ACTIVE_LINE_EXCLUDED = new Set(["completed", "invoiced", "closed", "cancelled", "declined"]);

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
  const key = String(value ?? "new").trim().toLowerCase().replaceAll(" ", "_");
  return isStatusKey(key) ? key : normalizeWorkOrderStatus(key);
}

function workOrderDisplayId(workOrder: Pick<WorkOrder, "id" | "custom_id">): string {
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
  const key = String(status ?? "awaiting").toLowerCase().replaceAll(" ", "_");

  if (key === "in_progress") {
    return {
      badge:
        "border-sky-400/60 bg-sky-500/10 text-sky-100",
      border: "border-sky-500/30",
      progress: "bg-[var(--theme-gradient-panel)]",
    };
  }

  if (key === "new" || key === "awaiting" || key === "awaiting_inspection" || key === "recommended") {
    return {
      badge: "border-sky-400/60 bg-sky-500/10 text-sky-100",
      border: "border-sky-500/25",
      progress: "bg-sky-400",
    };
  }

  if (key === "awaiting_approval") {
    return {
      badge: "border-blue-400/60 bg-blue-500/10 text-blue-100",
      border: "border-blue-500/25",
      progress: "bg-blue-400",
    };
  }

  if (key === "queued") {
    return {
      badge: "border-indigo-400/60 bg-indigo-500/10 text-indigo-100",
      border: "border-indigo-500/25",
      progress: "bg-indigo-400",
    };
  }

  if (key === "approved") {
    return {
      badge: "border-emerald-400/60 bg-emerald-500/10 text-emerald-100",
      border: "border-emerald-500/25",
      progress: "bg-emerald-400",
    };
  }

  if (key === "on_hold" || key === "waiting_parts") {
    return {
      badge: "border-sky-400/45 bg-sky-500/10 text-sky-100",
      border: "border-sky-500/25",
      progress: "bg-sky-400",
    };
  }

  if (key === "planned") {
    return {
      badge: "border-purple-400/70 bg-purple-500/10 text-purple-100",
      border: "border-purple-500/30",
      progress: "bg-purple-400",
    };
  }

  if (key === "completed" || key === "ready_to_invoice") {
    return {
      badge: "border-emerald-400/70 bg-emerald-500/10 text-emerald-100",
      border: "border-emerald-500/25",
      progress: "bg-emerald-400",
    };
  }

  if (key === "invoiced") {
    return {
      badge: "border-teal-400/70 bg-teal-500/10 text-teal-100",
      border: "border-teal-500/25",
      progress: "bg-teal-400",
    };
  }

  return {
    badge: "border-sky-400/60 bg-sky-500/10 text-sky-100",
    border: "border-sky-500/25",
    progress: "bg-sky-400",
  };
}

function techRollupChip(rollup: TechRollup): string {
  if (rollup === "in_progress") {
    return "border-sky-400/60 bg-sky-500/10 text-sky-100";
  }
  if (rollup === "on_hold") {
    return "border-sky-400/45 bg-sky-500/10 text-sky-100";
  }
  if (rollup === "completed") {
    return "border-emerald-400/70 bg-emerald-500/10 text-emerald-100";
  }
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]";
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
    return "border-red-500/50 bg-red-500/15 text-red-200";
  }
  if (priority === 2) {
    return "border-sky-500/50 bg-sky-500/15 text-sky-100";
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
        .update({ status: next } as DB["public"]["Tables"]["work_orders"]["Update"])
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
      .select(`
        *,
        vehicles:vehicles(year,make,model,license_plate)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status === "") {
      const defaultStatuses = isSeededShop ? SEEDED_DEFAULT_STATUSES : ACTIVE_STATUS_FILTER;
      query = query.in("status", [...defaultStatuses]);
    } else {
      query = query.eq("status", status);
    }

    let data: Row[] | null = null;
    let error: { message: string } | null = null;

    if (workforceDrilldownActive) {
      const { data: activeLines, error: activeLinesErr } = await supabase
        .from("work_order_lines")
        .select("id, work_order_id, assigned_tech_id, line_status, status, voided_at")
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
        (line) => !ACTIVE_LINE_EXCLUDED.has(String(line.line_status ?? line.status ?? "").toLowerCase()),
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

      const hasBridgeAssignment = new Set((bridgeRows ?? []).map((row) => row.work_order_line_id));
      const unassignedWorkOrderIds = Array.from(
        new Set(
          scopedActiveLines
            .filter((line) => !line.assigned_tech_id && !hasBridgeAssignment.has(line.id))
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
        console.warn("[WorkOrdersView] customer lookup failed; showing work orders without customer details:", customerErr.message);
      } else {
        const customersById = new Map(
          (customerRows ?? []).map((customer) => [customer.id, customer]),
        );

        workOrders.forEach((row) => {
          row.customers = row.customer_id ? customersById.get(row.customer_id) ?? null : null;
        });
      }
    }

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
      console.warn("[WorkOrdersView] failed to load lines for rollup:", lnErr.message);
      setTechRollupByWo({});
      setAssignedByWo({});
      setHasLinesByWo({});
      setLoading(false);
      return;
    }

    const lineRows = (lines ?? []) as Array<Pick<Line, "id" | "work_order_id" | "status" | "assigned_tech_id">>;
    const lineIds = lineRows.map((line) => line.id).filter(Boolean);
    const { data: bridgeAssignments, error: bridgeAssignErr } = lineIds.length
      ? await supabase
          .from("work_order_line_technicians")
          .select("work_order_line_id")
          .in("work_order_line_id", lineIds)
      : { data: [], error: null };

    if (bridgeAssignErr) {
      console.warn("[WorkOrdersView] failed to load assignment bridge rows:", bridgeAssignErr.message);
    }

    const bridgeAssignedLineIds = new Set(
      (bridgeAssignments ?? []).map((row) => row.work_order_line_id).filter(Boolean),
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
        const issues = Array.isArray(obj.issues) ? (obj.issues as ReviewIssue[]) : [];

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
            const readyPayload = (await readyResponse.json().catch(() => null)) as
              | { error?: string }
              | null;

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
        console.warn("[WorkOrdersView] failed to detect Shop Boost seed state:", seededErr.message);
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

      const { error: lineErr } = await supabase
        .from("work_order_lines")
        .delete()
        .eq("work_order_id", id);

      if (lineErr) {
        alert(`Failed to delete job lines: ${lineErr.message}`);
        setRows(prev);
        return;
      }

      const { error } = await supabase.from("work_orders").delete().eq("id", id);

      if (error) {
        alert(`Failed to delete: ${error.message}`);
        setRows(prev);
      } else {
        setTechRollupByWo((m) => {
          const next = { ...m };
          delete next[id];
          return next;
        });
      }
    },
    [rows, supabase],
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

  const activeCount = useMemo(
    () =>
      rows.filter((r) =>
        ACTIVE_STATUS_SET.has(normalizeStatusKey(r.status)),
      ).length,
    [rows],
  );

  const awaitingApprovalCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          String(r.status ?? "").toLowerCase().replaceAll(" ", "_") ===
          "awaiting_approval",
      ).length,
    [rows],
  );

  const waiterCount = useMemo(
    () => rows.filter((r) => Boolean(r.is_waiter)).length,
    [rows],
  );

  const urgentCount = useMemo(
    () => rows.filter((r) => Number(r.priority ?? 3) === 1).length,
    [rows],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-foreground">
      <section className="overflow-hidden rounded-3xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[var(--theme-shadow-medium)]">
        <div className="bg-[var(--theme-gradient-panel)] p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
              Board
            </div>
            <h1
              className="mt-1 text-2xl text-[color:var(--theme-text-primary)] md:text-3xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Work Orders
            </h1>
            <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
              Live repair jobs across inspection, approval, parts, technician work, and invoicing.
            </p>

            {!loading && !err ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <div className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                  Active: <span className="text-[color:var(--theme-text-primary)]">{activeCount}</span>
                </div>
                <div className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                  Awaiting approval:{" "}
                  <span className="text-[color:var(--theme-text-primary)]">{awaitingApprovalCount}</span>
                </div>
                <div className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                  Waiters: <span className="text-[color:var(--theme-text-primary)]">{waiterCount}</span>
                </div>
                <div className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                  Urgent: <span className="text-[color:var(--theme-text-primary)]">{urgentCount}</span>
                </div>
                <div className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                  Total: <span className="text-[color:var(--theme-text-primary)]">{total}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/assistant?pageType=work_orders&pageTitle=Work%20Orders"
              className="inline-flex items-center justify-center rounded-full border border-[var(--accent-copper-light)]/35 bg-[var(--accent-copper)]/15 px-3.5 py-1.5 text-sm font-semibold text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper)]/22"
            >
              Ask Assistant
            </Link>

            <Link
              href="/work-orders/create"
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-copper,#C57A4A)]/45 bg-[linear-gradient(135deg,rgba(197,122,74,0.35),rgba(197,122,74,0.18))] px-3.5 py-1.5 text-sm font-semibold text-[color:var(--theme-text-primary,var(--theme-text-primary))] transition hover:border-[color:var(--accent-copper,#C57A4A)]/65"
            >
              <span className="mr-1.5 text-base leading-none">+</span>
              New work order
            </Link>
          </div>
        </div>
        </div>
      </section>

      <section className="rounded-3xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-4 backdrop-blur shadow-[var(--theme-shadow-medium)]">
        {workforceDrilldownActive ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
            <span>Filtered from Workforce Overview: Unassigned active jobs</span>
            <Link href="/work-orders/view" className="underline underline-offset-2 hover:text-[color:var(--theme-text-primary)]">
              Clear filter
            </Link>
          </div>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Search work order, custom id, customer, plate, YMM…"
            className={INPUT_DARK}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={SELECT_DARK}
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
            onClick={() => {
              void load();
              setAssignVersion((v) => v + 1);
            }}
            className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-sky-400/60 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,_var(--theme-surface-page))]"
          >
            Refresh
          </button>
        </div>
      </section>

      {err ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]"
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] p-6 text-sm text-[color:var(--theme-text-secondary)]">
          {workforceDrilldownActive ? "No unassigned active jobs right now." : "No work orders match your current filters."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const displayId = workOrderDisplayId(r);
            const href = `/work-orders/${r.custom_id ?? r.id}?mode=view`;
            const isAssigning = assigningFor === r.id;

            const customerName = r.customers
              ? [r.customers.first_name ?? "", r.customers.last_name ?? ""]
                  .filter(Boolean)
                  .join(" ")
              : "";

            const vehicleLabel = r.vehicles
              ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`
                  .trim()
              : "";

            const plate = r.vehicles?.license_plate ?? "";
            const statusLower = String(r.status ?? "")
              .toLowerCase()
              .replaceAll(" ", "_");

            const isInvoiceStage =
              statusLower === "ready_to_invoice" || statusLower === "completed";

            const review = reviewByWo[r.id];
            const reviewedOk = Boolean(review?.ok);
            const issueCount = review?.issues?.length ?? 0;
            const techRollup = techRollupByWo[r.id] ?? "awaiting";
            const canonicalStatus = normalizeWorkOrderStatus(r.status);
            const hasAssignedTech = Boolean(assignedByWo[r.id]);
            const hasWorkLines = Boolean(hasLinesByWo[r.id]);
            const shouldShowInspectionPending =
              !r.inspection_id &&
              !hasWorkLines &&
              ["new", "awaiting", "awaiting_inspection"].includes(canonicalStatus);
            const staleDays = Math.max(0, Math.floor((Date.now() - new Date(r.updated_at ?? r.created_at ?? Date.now()).getTime()) / 86400000));

            const accent = stageAccent(r.status);
            const priority = priorityLabel(r.priority);
            const progressPct =
              techRollup === "completed"
                ? 100
                : techRollup === "in_progress"
                  ? 55
                  : techRollup === "on_hold"
                    ? 25
                    : 8;

            return (
              <div
                key={r.id}
                className={`rounded-2xl border bg-[color:var(--desktop-item-bg)] p-4 backdrop-blur transition hover:border-sky-400/45 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_82%,_var(--theme-surface-page))] ${accent.border}`}
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 24px var(--theme-surface-inset)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-[color:var(--theme-text-primary)]">
                        {displayId}
                      </span>

                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${accent.badge}`}
                      >
                        {normalizeWorkOrderStatus(r.status).replaceAll("_", " ")}
                      </span>

                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${techRollupChip(
                          techRollup,
                        )}`}
                      >
                        Tech: {techRollup.replaceAll("_", " ")}
                      </span>

                      {r.is_waiter ? (
                        <span className="rounded-full border border-red-500/60 bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-200">
                          Waiting
                        </span>
                      ) : null}

                      {priority ? (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${priorityChip(
                            r.priority,
                          )}`}
                        >
                          {priority}
                        </span>
                      ) : null}

                      {review ? (
                        reviewedOk ? (
                          <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-200">
                            Reviewed ✓
                          </span>
                        ) : (
                          <span className="rounded-full border border-sky-500/50 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-100">
                            Issues: {issueCount}
                          </span>
                        )
                      ) : null}
                    </div>

                    <div className="mt-2 truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {customerName || "No customer"}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                      {vehicleLabel ? <span>{vehicleLabel}</span> : <span>No vehicle</span>}
                      {plate ? <span>({plate})</span> : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                      Created
                    </div>
                    <div className="mt-1 text-sm font-bold text-[color:var(--theme-text-primary)]">
                      {r.created_at ? format(new Date(r.created_at), "PP") : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] text-[color:var(--theme-text-secondary)]">
                    <span>Workflow health</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
                    <div
                      className={`h-full rounded-full ${accent.progress}`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex min-h-[30px] items-center">
                  <WorkOrderAssignedSummary workOrderId={r.id} />
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  {canonicalStatus === "awaiting_approval" ? <span className="rounded-full border border-blue-400/50 bg-blue-500/10 px-2 py-0.5 text-blue-100">Needs approval</span> : null}
                  {canonicalStatus === "waiting_parts" || techRollup === "on_hold" ? <span className="rounded-full border border-sky-400/45 bg-sky-500/10 px-2 py-0.5 text-sky-100">Waiting parts</span> : null}
                  {!hasAssignedTech ? <span className="rounded-full border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-amber-100">No technician assigned</span> : null}
                  {shouldShowInspectionPending ? <span className="rounded-full border border-indigo-400/45 bg-indigo-500/10 px-2 py-0.5 text-indigo-100">Inspection pending</span> : null}
                  {canonicalStatus === "ready_to_invoice" ? <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-emerald-100">Ready to invoice</span> : null}
                  {staleDays >= 3 ? <span className="rounded-full border border-red-400/45 bg-red-500/10 px-2 py-0.5 text-red-100">Stale {staleDays}d</span> : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={href}
                    className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:border-sky-400/60 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,_var(--theme-surface-page))]"
                  >
                    Open
                  </Link>

                  {canPickStatus ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openStatusPicker(r);
                      }}
                      className="rounded-full border border-purple-500/60 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-100 transition hover:bg-purple-500/20"
                      title="Change work order workflow stage"
                    >
                      Change stage
                    </button>
                  ) : null}

                  {isInvoiceStage ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        void runInvoiceReview(r.id);
                      }}
                      disabled={reviewLoadingId === r.id || reviewedOk}
                      className={
                        reviewedOk
                          ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 opacity-70"
                          : "rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-50"
                      }
                    >
                      {reviewedOk
                        ? "Reviewed"
                        : reviewLoadingId === r.id
                          ? "Reviewing…"
                          : "Invoice review"}
                    </button>
                  ) : null}

                  {statusLower === "ready_to_invoice" ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openInvoicePage(r.id);
                      }}
                      disabled={!reviewedOk}
                      className={
                        reviewedOk
                          ? "rounded-full border border-sky-400/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
                          : "rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-muted)] opacity-60"
                      }
                    >
                      Invoice
                    </button>
                  ) : null}

                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDelete(r.id);
                    }}
                    className="rounded-full border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20"
                  >
                    Delete
                  </button>
                </div>

                {canAssign ? (
                  <div
                    className="mt-4 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] p-3"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {!isAssigning ? (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setAssigningFor(r.id);
                          setSelectedTechId("");
                        }}
                        className="rounded-full border border-sky-500/60 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/25"
                      >
                        Assign work order
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                          Assign unassigned lines
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={selectedTechId}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            onChange={(e) => setSelectedTechId(e.target.value)}
                            className={`${SELECT_DARK} min-w-[180px] px-3 py-2 text-xs`}
                          >
                            <option value="">Pick mechanic…</option>
                            {techs.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.full_name ?? "(no name)"}{" "}
                                {t.role ? `(${t.role})` : ""}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleAssignAll(r.id);
                            }}
                            className="rounded-full border border-[color:var(--accent-copper,#C57A4A)]/45 bg-[linear-gradient(135deg,rgba(197,122,74,0.35),rgba(197,122,74,0.18))] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary,var(--theme-text-primary))] transition hover:border-[color:var(--accent-copper,#C57A4A)]/65"
                          >
                            Apply
                          </button>

                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setAssigningFor(null);
                              setSelectedTechId("");
                            }}
                            className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,_var(--theme-surface-page))]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {statusPickerOpen && statusPickerWoId ? (
        <StatusPickerModal
          isOpen={statusPickerOpen}
          onClose={() => setStatusPickerOpen(false)}
          current={statusPickerCurrent}
          onChange={async (pick) => {
            const woId = statusPickerWoId;
            const next = pick.replace("status:", "") as WorkOrderStatus;
            await applyWorkOrderStatus(woId, next);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
