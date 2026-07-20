"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Dialog } from "@headlessui/react";
import { format } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { cn } from "@shared/lib/utils";

import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import AIAssistantModal from "@work-orders/components/workorders/AiAssistantModal";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";
import JobPunchButton from "@/features/work-orders/components/JobPunchButton";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import {
  formatLaborSummary,
  resolvePartsBottleneckDisplay,
  resolvePrimaryTechDisplay,
} from "@/features/work-orders/lib/display/linePresentation";
import { resolveWorkOrderLinePricing } from "@/features/work-orders/lib/pricing/resolveWorkOrderLinePricing";
import {
  filterAllocationsNotBackedByCanonicalParts,
  getCanonicalPartDescription,
  getCanonicalPartManufacturer,
  getCanonicalPartNumber,
  getCanonicalPartQuantity,
  getCanonicalPartUnitPrice,
} from "@/features/work-orders/lib/display/workOrderParts";
import VehicleHistoryModal from "@/features/work-orders/components/workorders/VehicleHistoryModal";
import DtcSuggestionModal from "@/features/work-orders/components/workorders/DtcSuggestionPopup";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Mode = "tech" | "view";
type Variant = "modal" | "panel";

const statusTextColor: Record<string, string> = {
  in_progress: "text-sky-200",
  awaiting: "text-[color:var(--theme-text-primary)]",
  queued: "text-indigo-200",
  on_hold: "text-amber-200",
  completed: "text-emerald-200",
  paused: "text-amber-200",
  assigned: "text-sky-200",
  unassigned: "text-[color:var(--theme-text-primary)]",
  awaiting_approval: "text-blue-200",
  declined: "text-red-200",
  deferred: "text-orange-200",
  waiting_parts: "text-amber-200",
  approved: "text-indigo-200",
  pending: "text-[color:var(--theme-text-primary)]",
};

const chip = (status: string) => statusTextColor[status] ?? "text-[color:var(--theme-text-primary)]";

const displayStatusLabel = (status: string, punchedInAt: string | null): string => {
  if (status === "in_progress" || (!!punchedInAt && status !== "completed" && status !== "declined" && status !== "deferred")) return "Active";
  if (status === "waiting_parts") return "Waiting Parts";
  if (status === "on_hold") return "On Hold";
  if (status === "completed") return "Completed";
  if (status === "declined") return "Declined";
  if (status === "deferred") return "Deferred";
  if (status === "awaiting_approval") return "Awaiting Approval";
  if (status === "approved") return "Queued";
  if (status === "pending" || status === "awaiting") return "Awaiting";
  return status.replaceAll("_", " ");
};

const btnBase =
  "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition";
const btnNeutral =
  btnBase + " border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]";
const btnInfo =
  btnBase + " border-sky-500/45 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20";
const btnDanger =
  btnBase + " border-red-500/45 bg-red-500/10 text-red-100 hover:bg-red-500/20";
const btnSecondary = btnInfo;
const btnTertiary =
  btnBase + " border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
  parts?: { name: string | null } | null;
};

type RequiredPartRow = DB["public"]["Tables"]["work_order_parts"]["Row"] & {
  description_snapshot?: string | null;
  manufacturer_snapshot?: string | null;
  part_number_snapshot?: string | null;
  unit_sell_price_snapshot?: number | null;
  lifecycle_status?: string | null;
  source_parts_request_item_id?: string | null;
  parts?: { name: string | null; part_number?: string | null; manufacturer?: string | null } | null;
};


function money(value: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
}

type WorkflowStatus =
  | "awaiting"
  | "awaiting_approval"
  | "declined"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "paused"
  | "completed"
  | "assigned"
  | "unassigned";

function SectionCard({
  title,
  children,
  titleRight,
}: {
  title?: string;
  children: React.ReactNode;
  titleRight?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      {title ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            {title}
          </div>
          {titleRight}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function MetaStat({
  label,
  value,
  valueClassName = "text-[color:var(--theme-text-primary)]",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-sm font-medium ${valueClassName}`}>{value}</div>
    </div>
  );
}

export default function FocusedJobModal(props: {
  isOpen: boolean;
  onClose: () => void;
  workOrderLineId: string;
  onChanged?: () => void | Promise<void>;
  mode?: Mode;
  variant?: Variant;
}): JSX.Element | null {
  const {
    isOpen,
    onClose,
    workOrderLineId,
    onChanged,
    mode = "tech",
    variant = "modal",
  } = props;

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const lastSetShopId = useRef<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [shopLaborRate, setShopLaborRate] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [techNotes, setTechNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [openComplete, setOpenComplete] = useState(false);
  const [openParts, setOpenParts] = useState(false);
  const [openHold, setOpenHold] = useState(false);
  const [openPhoto, setOpenPhoto] = useState(false);
  const [openChat, setOpenChat] = useState(false);
  const [openAddJob, setOpenAddJob] = useState(false);
  const [openAi, setOpenAi] = useState(false);
  const [openDtc, setOpenDtc] = useState(false);
  const [openVehicleHistory, setOpenVehicleHistory] = useState(false);

  const [prefillCause, setPrefillCause] = useState("");
  const [prefillCorrection, setPrefillCorrection] = useState("");

  const [allocs, setAllocs] = useState<AllocationRow[]>([]);
  const [requiredParts, setRequiredParts] = useState<RequiredPartRow[]>([]);
  const [assignedTechProfile, setAssignedTechProfile] = useState<{ id: string; full_name: string | null; role: string | null } | null>(null);
  const [allocsLoading, setAllocsLoading] = useState(false);

  const showErr = (prefix: string, err?: { message?: string } | null) => {
    toast.error(`${prefix}: ${err?.message ?? "Something went wrong."}`);
    console.error(prefix, err);
  };

  const ensureShopContext = useCallback(
    async (id: string | null) => {
      if (!id) return;
      if (lastSetShopId.current === id) return;

      const { error } = await supabase.rpc("set_current_shop_id", {
        p_shop_id: id,
      });

      if (error) {
        lastSetShopId.current = null;
        throw error;
      }

      lastSetShopId.current = id;
    },
    [supabase],
  );

  const closeAllSubModals = useCallback(() => {
    setOpenComplete(false);
    setOpenParts(false);
    setOpenHold(false);
    setOpenPhoto(false);
    setOpenChat(false);
    setOpenAddJob(false);
    setOpenAi(false);
    setOpenDtc(false);
    setOpenVehicleHistory(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      closeAllSubModals();
      return;
    }
    closeAllSubModals();
  }, [isOpen, workOrderLineId, closeAllSubModals, variant]);

  useEffect(() => {
    if (!isOpen || !workOrderLineId) return;

    let cancelled = false;

    (async () => {
      setBusy(true);
      try {
        const { data: l, error: le } = await supabase
          .from("work_order_lines")
          .select("*")
          .eq("id", workOrderLineId)
          .maybeSingle<WorkOrderLine>();
        if (le) throw le;
        if (cancelled) return;

        setLine(l ?? null);
        setTechNotes(l?.notes ?? "");
        if (l?.assigned_tech_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", l.assigned_tech_id)
            .maybeSingle<{ id: string; full_name: string | null; role: string | null }>();
          if (!cancelled) setAssignedTechProfile(profile ?? null);
        } else {
          setAssignedTechProfile(null);
        }

        if (l?.work_order_id) {
          const { data: wo, error: we } = await supabase
            .from("work_orders")
            .select("*")
            .eq("id", l.work_order_id)
            .maybeSingle<WorkOrder>();
          if (we) throw we;
          if (cancelled) return;

          setWorkOrder(wo ?? null);

          const sid = (wo?.shop_id as string | null) ?? null;
          if (sid) {
            try {
              await ensureShopContext(sid);
            } catch (e) {
              console.warn("[FocusedJob] set_current_shop_id failed:", e);
            }

            const { data: shopRow, error: shopError } = await supabase
              .from("shops")
              .select("labor_rate")
              .eq("id", sid)
              .maybeSingle<{ labor_rate: number | null }>();
            if (shopError) throw shopError;
            if (cancelled) return;
            const parsedRate = Number(shopRow?.labor_rate);
            setShopLaborRate(Number.isFinite(parsedRate) ? parsedRate : null);
          } else {
            setShopLaborRate(null);
          }

          if (wo?.vehicle_id) {
            const { data: v, error: ve } = await supabase
              .from("vehicles")
              .select("*")
              .eq("id", wo.vehicle_id)
              .maybeSingle<Vehicle>();
            if (ve) throw ve;
            if (cancelled) return;
            setVehicle(v ?? null);
          } else {
            setVehicle(null);
          }

          if (wo?.customer_id) {
            const { data: c, error: ce } = await supabase
              .from("customers")
              .select("*")
              .eq("id", wo.customer_id)
              .maybeSingle<Customer>();
            if (ce) throw ce;
            if (cancelled) return;
            setCustomer(c ?? null);
          } else {
            setCustomer(null);
          }
        } else {
          setWorkOrder(null);
          setShopLaborRate(null);
          setVehicle(null);
          setCustomer(null);
        }
      } catch (e) {
        const err = e as { message?: string };
        toast.error(err?.message ?? "Failed to load job");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, workOrderLineId, supabase, ensureShopContext]);

  useEffect(() => {
    if (!isOpen || !workOrderLineId) return;

    const ch = supabase
      .channel(`wol-${workOrderLineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `id=eq.${workOrderLineId}`,
        },
        (payload: RealtimePostgresChangesPayload<WorkOrderLine>) => {
          const next = payload.new;
          if (next && typeof (next as Partial<WorkOrderLine>).id === "string") {
            setLine(next as WorkOrderLine);
          }
        },
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(ch);
      } catch {}
    };
  }, [isOpen, workOrderLineId, supabase]);

  const loadAllocations = useCallback(async () => {
    if (!workOrderLineId) return;
    setAllocsLoading(true);
    try {
      let allocBuilder = supabase
        .from("work_order_part_allocations")
        .select("*, parts(name)")
        .eq("work_order_line_id", workOrderLineId);
      let requiredBuilder = supabase
        .from("work_order_parts")
        .select("*, parts(name, part_number, sku, manufacturer, supplier)")
        .eq("work_order_line_id", workOrderLineId)
        .eq("is_active", true);
      if (workOrder?.id) {
        allocBuilder = allocBuilder.eq("work_order_id", workOrder.id);
        requiredBuilder = requiredBuilder.eq("work_order_id", workOrder.id);
      }
      if (workOrder?.shop_id) {
        allocBuilder = allocBuilder.eq("shop_id", workOrder.shop_id);
        requiredBuilder = requiredBuilder.eq("shop_id", workOrder.shop_id);
      }

      const [allocQuery, requiredQuery] = await Promise.all([
        allocBuilder.order("created_at", { ascending: true }),
        requiredBuilder.order("created_at", { ascending: true }),
      ]);
      if (allocQuery.error) throw allocQuery.error;
      if (requiredQuery.error) throw requiredQuery.error;
      setAllocs((allocQuery.data as AllocationRow[]) ?? []);
      setRequiredParts((requiredQuery.data as RequiredPartRow[]) ?? []);
    } catch (e) {
      console.warn("[FocusedJob] load allocations failed", e);
    } finally {
      setAllocsLoading(false);
    }
  }, [supabase, workOrder?.id, workOrder?.shop_id, workOrderLineId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadAllocations();
  }, [isOpen, loadAllocations]);

  useEffect(() => {
    if (!isOpen || !workOrderLineId) return;

    const ch = supabase
      .channel(`wol-parts-${workOrderLineId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_part_allocations",
          filter: `work_order_line_id=eq.${workOrderLineId}`,
        },
        () => void loadAllocations(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_parts",
          filter: `work_order_line_id=eq.${workOrderLineId}`,
        },
        () => void loadAllocations(),
      )
      .subscribe();

    return () => {
      try {
        void supabase.removeChannel(ch);
      } catch {}
    };
  }, [isOpen, workOrderLineId, supabase, loadAllocations]);

  const refresh = useCallback(async () => {
    const { data: l } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("id", workOrderLineId)
      .maybeSingle<WorkOrderLine>();

    setLine(l ?? null);
    setTechNotes(l?.notes ?? "");
    await onChanged?.();
    await loadAllocations();
  }, [supabase, workOrderLineId, onChanged, loadAllocations]);

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("wol:refresh", handler);
    return () => window.removeEventListener("wol:refresh", handler);
  }, [refresh]);

  useEffect(() => {
    const handleClose = () => setOpenParts(false);
    const handleSubmitted = async () => {
      setOpenParts(false);
      await refresh();
    };

    window.addEventListener("parts-request:close", handleClose);
    window.addEventListener("parts-request:submitted", handleSubmitted);
    return () => {
      window.removeEventListener("parts-request:close", handleClose);
      window.removeEventListener("parts-request:submitted", handleSubmitted);
    };
  }, [refresh]);

  useEffect(() => {
    const onInspectionDone = (evt: Event) => {
      const e = evt as CustomEvent<{
        workOrderLineId?: string;
        cause?: string;
        correction?: string;
      }>;
      const detail = e.detail || {};
      if (!detail.workOrderLineId) return;
      if (detail.workOrderLineId !== workOrderLineId) return;

      closeAllSubModals();
      setPrefillCause(detail.cause ?? "");
      setPrefillCorrection(detail.correction ?? "");
      setOpenComplete(true);
    };

    window.addEventListener("inspection:completed", onInspectionDone);
    return () => window.removeEventListener("inspection:completed", onInspectionDone);
  }, [workOrderLineId, closeAllSubModals]);

  const applyHold = async (reason: string, notes?: string) => {
    if (busy || !line) return;

    setBusy(true);
    try {
      await ensureShopContext((workOrder?.shop_id as string | null) ?? null);

      await runJobPunchTransition(workOrderLineId, "pause", {
        holdReason: reason || "On hold",
        notes: notes ?? line.notes ?? null,
      });

      toast.success("Hold applied");
      await refresh();
    } catch (e) {
      showErr("Apply hold failed", e as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  const releaseHold = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ensureShopContext((workOrder?.shop_id as string | null) ?? null);

      await runJobPunchTransition(workOrderLineId, "resume", {
        toAwaiting: true,
      });

      toast.success("Hold removed");
      await refresh();
    } catch (e) {
      showErr("Remove hold failed", e as { message?: string });
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!workOrderLineId || !workOrder?.id) return;

    try {
      await ensureShopContext((workOrder?.shop_id as string | null) ?? null);
    } catch (e) {
      showErr("Shop scope failed", e as { message?: string });
      return;
    }

    const path = `wo/${workOrder.id}/lines/${workOrderLineId}/${uuidv4()}_${file.name}`;
    const { error } = await supabase.storage.from("job-photos").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
    if (error) return showErr("Photo upload failed", error);
    toast.success("Photo attached");
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await ensureShopContext((workOrder?.shop_id as string | null) ?? null);

      const { error } = await supabase
        .from("work_order_lines")
        .update({
          notes: techNotes,
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", workOrderLineId);

      if (error) throw error;

      toast.success("Notes saved");
      await refresh();
    } catch (e) {
      showErr("Update notes failed", e as { message?: string });
    } finally {
      setSavingNotes(false);
    }
  };

  const startAt = line?.punched_in_at ?? null;
  const finishAt = line?.punched_out_at ?? null;

  const titleText =
    (line?.description || line?.complaint || "Focused Job") +
    (line?.job_type ? ` — ${String(line.job_type).replaceAll("_", " ")}` : "");

  const lineLabel =
    (line?.complaint ?? "").trim() ||
    (line?.description ?? "").trim() ||
    "Job";

  const normalizedLineStatus = normalizeWorkOrderLineStatus(line?.status);
  const statusLabel = displayStatusLabel(normalizedLineStatus, line?.punched_in_at ?? null);

  const createdStart = startAt ? format(new Date(startAt), "PPpp") : "—";
  const createdFinish = finishAt ? format(new Date(finishAt), "PPpp") : "—";

  const completionBlocked =
    busy ||
    line?.status === "awaiting_approval" ||
    line?.status === "declined" ||
    (!!line?.approval_state && line.approval_state !== "approved");
  const isPanelVariant = variant === "panel";
  const isExpandedPanel = isPanelVariant;
  const pricing = line
    ? resolveWorkOrderLinePricing({ line, shopLaborRate, allocatedParts: filterAllocationsNotBackedByCanonicalParts(allocs, requiredParts), stagedParts: requiredParts })
    : null;
  const laborDisplay = formatLaborSummary(pricing?.laborHours, Number(pricing?.laborTotal ?? 0));
  const lineTotal = Number(pricing?.lineTotal ?? 0);
  const hasPartsRequestedMarker =
    String(line?.correction ?? "").toLowerCase().includes("demo_moment:parts_bottleneck") ||
    String(line?.hold_reason ?? "").toLowerCase().includes("part") ||
    String(line?.description ?? "").toLowerCase().includes("backorder");
  const partsBottleneckDisplay = resolvePartsBottleneckDisplay({
    hasRequestedMarker: hasPartsRequestedMarker,
    holdReason: line?.hold_reason ?? null,
    partsTotal: Number(pricing?.partsTotal ?? 0),
  });
  const primaryTechDisplay =
    line
      ? (
          assignedTechProfile?.full_name ??
          (line as unknown as { assigned_tech_name?: string | null })?.assigned_tech_name ??
          ""
        ).trim() || resolvePrimaryTechDisplay(line, assignedTechProfile)
      : "Unassigned";

  if (!isOpen) return null;

  const Body = (
    <div
      className={`relative overflow-hidden rounded-[26px] border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] text-foreground shadow-[var(--theme-shadow-medium)] ${
        isPanelVariant
          ? ""
          : openAi
            ? ""
            : "max-h-[82vh]"
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,rgba(184,115,51,0),rgba(184,115,51,0.95),rgba(253,186,116,0.95),rgba(184,115,51,0))]" />
      <div className="pointer-events-none absolute inset-x-12 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(184,115,51,0.18),transparent_72%)]" />

      <div className="flex h-full min-h-0 flex-col">
        <div
          className={`${isPanelVariant ? "" : "sticky top-0 z-20"} border-b border-[color:var(--theme-border-soft)] bg-[var(--theme-surface-inset)] px-4 py-3 backdrop-blur-xl sm:px-5`}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-base font-semibold tracking-tight text-[color:var(--theme-text-primary)] sm:text-lg">
                {titleText}
              </div>
              {workOrder ? (
                <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                  WO #{workOrder.custom_id || workOrder.id?.slice(0, 8)}
                </div>
              ) : null}
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                Selected job
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {workOrder?.id ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--accent-copper-soft)] bg-[var(--accent-copper-faint)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper-soft)]/20"
                  onClick={() => {
                    closeAllSubModals();
                    setOpenAddJob(true);
                  }}
                  disabled={busy}
                >
                  + Job
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  closeAllSubModals();
                  onClose();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-xs text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper-soft)] hover:bg-[color:var(--theme-surface-subtle)] hover:text-[color:var(--theme-text-primary)]"
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${chip(normalizedLineStatus)}`}>
              {statusLabel}
            </span>

            {normalizedLineStatus === "awaiting_approval" ? (
              <span className="inline-flex rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-100">
                Awaiting approval
              </span>
            ) : null}

            {normalizedLineStatus === "declined" ? (
              <span className="inline-flex rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-100">
                Declined
              </span>
            ) : null}

            {line?.approval_state ? (
              <span className="inline-flex rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                Approval {line.approval_state}
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {busy && !line ? (
            <div className="grid gap-3">
              <div className="h-6 w-40 animate-pulse rounded-full bg-[color:var(--theme-surface-subtle)]" />
              <div className="h-24 animate-pulse rounded-2xl bg-[color:var(--theme-surface-subtle)]" />
            </div>
          ) : !line ? (
            <div className="text-sm text-[color:var(--theme-text-secondary)]">No job found.</div>
          ) : (
            <div
              className="space-y-3"
            >
              <div className="space-y-3">
              {mode === "tech" ? (
                <SectionCard title="Operational actions">
                  {line.status !== "completed" ? (
                    <JobPunchButton
                      lineId={line.id}
                      punchedInAt={line.punched_in_at}
                      punchedOutAt={line.punched_out_at}
                      status={line.status as WorkflowStatus}
                      onFinishRequested={() => {
                        closeAllSubModals();
                        setPrefillCause(line.cause ?? "");
                        setPrefillCorrection(line.correction ?? "");
                        setOpenComplete(true);
                      }}
                      onUpdated={refresh}
                      disabled={completionBlocked}
                    />
                  ) : null}

                  <div className="mt-2 grid gap-2">
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => {
                        closeAllSubModals();
                        setPrefillCause(line?.cause ?? "");
                        setPrefillCorrection(line?.correction ?? "");
                        setOpenComplete(true);
                      }}
                      disabled={completionBlocked}
                    >
                      Complete
                    </button>

                    <div className={cn("grid gap-2", isExpandedPanel ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2")}>
                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenHold(true);
                      }}
                      disabled={busy}
                    >
                      {normalizedLineStatus === "on_hold" ? "On Hold" : "Hold"}
                    </button>

                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenParts(true);
                      }}
                      disabled={busy}
                    >
                      Request Parts
                    </button>

                    <button
                      type="button"
                      className={btnSecondary}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenAi(true);
                      }}
                    >
                      AI Assist
                    </button>

                    <button
                      type="button"
                      className={btnTertiary}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenPhoto(true);
                      }}
                      disabled={busy}
                    >
                      Add Photo
                    </button>

                    <button
                      type="button"
                      className={btnTertiary}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenChat(true);
                      }}
                    >
                      Chat
                    </button>

                    <button
                      type="button"
                      className={btnTertiary}
                      onClick={() => {
                        if (!vehicle?.id) {
                          toast.error("No vehicle linked to this work order yet.");
                          return;
                        }
                        closeAllSubModals();
                        setOpenVehicleHistory(true);
                      }}
                      disabled={busy || !vehicle?.id}
                    >
                      Vehicle History
                    </button>
                  </div>
                  </div>

                  {completionBlocked ? (
                    <div className="mt-2 text-[11px] text-amber-300">
                      {normalizedLineStatus === "awaiting_approval"
                        ? "Awaiting approval — punching disabled"
                        : normalizedLineStatus === "declined"
                          ? "Declined — punching disabled"
                          : line.approval_state && line.approval_state !== "approved"
                            ? "Not approved — punching disabled"
                            : ""}
                    </div>
                  ) : null}
                </SectionCard>
              ) : null}

              {!isPanelVariant ? (
                <SectionCard title="Vehicle & customer">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                        Vehicle
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                        {vehicle
                          ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`
                              .trim()
                              .replace(/\s+/g, " ") || "—"
                          : "—"}
                      </div>
                      <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                        VIN: {vehicle?.vin ?? "—"} • Plate: {vehicle?.license_plate ?? "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                        Customer
                      </div>
                      <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                        {customer
                          ? [customer.first_name ?? "", customer.last_name ?? ""]
                              .filter(Boolean)
                              .join(" ") || "—"
                          : "—"}
                      </div>
                      <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                        {customer?.phone ?? "—"} {customer?.email ? `• ${customer.email}` : ""}
                      </div>
                    </div>
                  </div>
                </SectionCard>
              ) : null}

              {mode !== "tech" ? (
                <SectionCard title="Actions">
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    <button
                      type="button"
                      className={btnNeutral}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenChat(true);
                      }}
                    >
                      Chat
                    </button>

                    <button
                      type="button"
                      className={btnInfo}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenAi(true);
                      }}
                    >
                      AI Assist
                    </button>

                    <button
                      type="button"
                      className={btnInfo}
                      onClick={() => {
                        closeAllSubModals();
                        setOpenDtc(true);
                      }}
                      disabled={busy}
                    >
                      DTC Assist
                    </button>
                  </div>
                </SectionCard>
              ) : null}
              </div>

              <div className="space-y-3">
              <SectionCard title="Repair story">
                <button
                  type="button"
                  className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-left text-xs text-[color:var(--theme-text-primary)] hover:border-[var(--accent-copper-light)]/60"
                  onClick={() => {
                    closeAllSubModals();
                    setPrefillCause(line?.cause ?? "");
                    setPrefillCorrection(line?.correction ?? "");
                    setOpenComplete(true);
                  }}
                >
                  <div><span className="text-[color:var(--theme-text-muted)]">Complaint:</span> {line?.complaint?.trim() || line?.description?.trim() || "Add complaint"}</div>
                  <div className="mt-1"><span className="text-[color:var(--theme-text-muted)]">Cause:</span> {line?.cause?.trim() || "Add cause"}</div>
                  <div className="mt-1"><span className="text-[color:var(--theme-text-muted)]">Correction:</span> {line?.correction?.trim() || "Add correction"}</div>
                  <div className="mt-2 text-[11px] text-[var(--accent-copper-light)]">Edit story</div>
                </button>
              </SectionCard>

              <SectionCard title="Tech notes">
                <textarea
                  rows={isExpandedPanel ? 5 : 3}
                  value={techNotes}
                  onChange={(e) => setTechNotes(e.target.value)}
                  onBlur={saveNotes}
                  disabled={savingNotes}
                  className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
                  placeholder="Add notes for this job…"
                />
              </SectionCard>

              <SectionCard title={partsBottleneckDisplay?.heading ?? "Parts used"}>
                {allocsLoading ? (
                  <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading…</div>
                ) : partsBottleneckDisplay && (allocs.length + requiredParts.length) === 0 ? (
                  <div className="text-sm text-[color:var(--theme-text-primary)]">
                    {partsBottleneckDisplay.detail}
                  </div>
                ) : (allocs.length + requiredParts.length) === 0 ? (
                  <div className="text-sm text-[color:var(--theme-text-secondary)]">No parts used yet.</div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
                    <div className="grid grid-cols-12 bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                      <div className="col-span-7">Part</div>
                      <div className="col-span-3">Location</div>
                      <div className="col-span-2 text-right">Qty</div>
                    </div>
                    <ul className="max-h-56 overflow-auto divide-y divide-[color:var(--theme-border-soft)]">
                      {requiredParts.map((p) => {
                        const qty = getCanonicalPartQuantity(p);
                        const unit = getCanonicalPartUnitPrice(p);
                        return (
                          <li key={`required-${p.id}`} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                            <div className="col-span-7 min-w-0 break-words text-[color:var(--theme-text-primary)]">
                              {getCanonicalPartDescription(p) ?? "—"}
                              <div className="text-[11px] text-[color:var(--theme-text-secondary)]">{[getCanonicalPartNumber(p), getCanonicalPartManufacturer(p), p.lifecycle_status ?? "requested"].filter(Boolean).join(" • ")}</div>
                            </div>
                            <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">{unit > 0 ? money(unit) : "—"}</div>
                            <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">{qty}</div>
                          </li>
                        );
                      })}
                      {allocs.map((a) => {
                        const qty =
                          (a as unknown as { qty?: number | null }).qty ??
                          (a as unknown as { quantity?: number | null }).quantity ??
                          0;

                        return (
                          <li key={a.id} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                            <div className="col-span-7 min-w-0 break-words text-[color:var(--theme-text-primary)]">
                              {a.parts?.name ?? "Part"}
                            </div>
                            <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">
                              {(a as unknown as { location_id?: string | null }).location_id
                                ? `loc ${String((a as unknown as { location_id?: string | null }).location_id).slice(0, 6)}…`
                                : "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">
                              {qty}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Quick status">
                <div className={cn("grid gap-2.5 sm:grid-cols-2", isExpandedPanel && "xl:grid-cols-3")}>
                  <MetaStat
                    label="Start"
                    value={createdStart}
                  />
                  <MetaStat
                    label="Finish"
                    value={createdFinish}
                  />
                  <MetaStat
                    label="Hold reason"
                    value={line.hold_reason ?? "—"}
                  />
                  <MetaStat
                    label="Job type"
                    value={String(line.job_type ?? "—").replaceAll("_", " ")}
                  />
                  <MetaStat
                    label="Primary tech"
                    value={primaryTechDisplay}
                  />
                  <MetaStat label="Labor" value={laborDisplay} />
                  <MetaStat
                    label="Line total"
                    value={lineTotal > 0 ? new Intl.NumberFormat("en-CA", {
                      style: "currency",
                      currency: "CAD",
                      maximumFractionDigits: 2,
                    }).format(lineTotal) : "Estimate pending"}
                  />
                </div>
              </SectionCard>

              <SectionCard title="AI suggested repairs">
                <details className="group" open={!isPanelVariant}>
                  <summary className="cursor-pointer text-xs text-[color:var(--theme-text-secondary)] transition group-open:mb-2 hover:text-[color:var(--theme-text-primary)]">
                    {isPanelVariant ? "Expand AI suggestions" : "AI suggestions"}
                  </summary>
                  {line && workOrder ? (
                    <SuggestedQuickAdd
                      jobId={line.id}
                      workOrderId={workOrder.id}
                      vehicleId={vehicle?.id ?? null}
                      onAdded={async () => {
                        toast.success("Suggested line added");
                        await refresh();
                      }}
                    />
                  ) : (
                    <div className="text-sm text-[color:var(--theme-text-secondary)]">Vehicle/work order details required.</div>
                  )}
                </details>
              </SectionCard>

              <div className="px-1 text-xs text-[color:var(--theme-text-muted)]">
                Job ID: {line.id}
                {typeof line.labor_time === "number" ? ` • Labor: ${line.labor_time.toFixed(1)}h` : ""}
                {line.hold_reason ? ` • Hold: ${line.hold_reason}` : ""}
                {line.approval_state ? ` • Approval: ${line.approval_state}` : ""}
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const Shell =
    variant === "panel" ? (
      <div className="relative h-full">{Body}</div>
    ) : (
      <Dialog
        open={isOpen}
        onClose={() => {
          closeAllSubModals();
          onClose();
        }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
      >
        <div className="fixed inset-0 z-[100] bg-[color:var(--theme-surface-inset)] backdrop-blur-sm" aria-hidden="true" />
        <div
          className="relative z-[110] mx-4 my-6 w-full max-w-5xl"
          onClick={(e) => e.stopPropagation()}
        >
          {Body}
        </div>
      </Dialog>
    );

  return (
    <>
      {Shell}

      {openVehicleHistory && vehicle?.id ? (
        <VehicleHistoryModal
          isOpen={openVehicleHistory}
          onClose={() => setOpenVehicleHistory(false)}
          vehicleId={vehicle.id}
          shopId={(workOrder?.shop_id as string | null) ?? null}
        />
      ) : null}

      {openComplete && line ? (
        <CauseCorrectionModal
          isOpen={openComplete}
          onClose={() => setOpenComplete(false)}
          jobId={line.id}
          lineLabel={lineLabel}
          initialCause={prefillCause}
          initialCorrection={prefillCorrection}
          onSubmit={async (cause: string, correction: string) => {
            await ensureShopContext((workOrder?.shop_id as string | null) ?? null);

            try {
              await runJobPunchTransition(line.id, "finish", {
                cause,
                correction,
              });
            } catch (error) {
              showErr("Complete job failed", error as { message?: string });
              throw error;
            }

            toast.success("Job completed");
            setOpenComplete(false);
            await refresh();
          }}
          onSaveDraft={async (cause: string, correction: string) => {
            await ensureShopContext((workOrder?.shop_id as string | null) ?? null);

            const { error } = await supabase
              .from("work_order_lines")
              .update({ cause, correction } as DB["public"]["Tables"]["work_order_lines"]["Update"])
              .eq("id", line.id);

            if (error) {
              showErr("Save story failed", error);
              throw error;
            }

            toast.success("Story saved");
            await refresh();
          }}
        />
      ) : null}

      {openParts && workOrder?.id && line ? (
        <PartsRequestModal
          isOpen={openParts}
          workOrderId={workOrder.id}
          jobId={line.id}
          requestNote={line.description ?? ""}
        />
      ) : null}

      {openHold && line ? (
        <HoldModal
          isOpen={openHold}
          onClose={() => setOpenHold(false)}
          onApply={applyHold}
          onRelease={line.hold_reason ? releaseHold : undefined}
          canRelease={!!line.hold_reason}
          defaultReason={line.hold_reason || "Awaiting parts"}
        />
      ) : null}


      {openDtc && line?.id ? (
        <DtcSuggestionModal
          isOpen={openDtc}
          onClose={() => setOpenDtc(false)}
          jobId={line.id}
          vehicle={
            vehicle
              ? {
                  year: vehicle.year ? String(vehicle.year) : null,
                  make: vehicle.make ?? null,
                  model: vehicle.model ?? null,
                  engine:
                    "engine" in vehicle && typeof vehicle.engine === "string"
                      ? vehicle.engine
                      : null,
                  fuelType:
                    "fuel_type" in vehicle && typeof vehicle.fuel_type === "string"
                      ? vehicle.fuel_type
                      : null,
                  drivetrain:
                    "drivetrain" in vehicle && typeof vehicle.drivetrain === "string"
                      ? vehicle.drivetrain
                      : null,
                  transmission:
                    "transmission" in vehicle && typeof vehicle.transmission === "string"
                      ? vehicle.transmission
                      : null,
                }
              : null
          }
          onApplied={async (payload: {
            summary: string;
            commonRepairs: string;
            laborHours: number | null;
            applyCause: string | null;
            applyCorrection: string | null;
          }) => {
            setPrefillCause(payload.summary);
            setPrefillCorrection(payload.commonRepairs);
            setOpenDtc(false);
            setOpenComplete(true);
            await refresh();
          }}
        />
      ) : null}

      {openPhoto ? (
        <PhotoCaptureModal
          isOpen={openPhoto}
          onClose={() => setOpenPhoto(false)}
          onCapture={uploadPhoto}
        />
      ) : null}

      {openChat ? (
        <NewChatModal
          isOpen={openChat}
          onClose={() => setOpenChat(false)}
          created_by="system"
          onCreated={() => setOpenChat(false)}
          context_type="work_order_line"
          context_id={line?.id ?? null}
        />
      ) : null}

      {openAi ? (
        <AIAssistantModal
          isOpen={openAi}
          onClose={() => setOpenAi(false)}
          workOrderLineId={line?.id ?? undefined}
          defaultVehicle={
            vehicle
              ? {
                  year: vehicle.year ? String(vehicle.year) : undefined,
                  make: vehicle.make ?? undefined,
                  model: vehicle.model ?? undefined,
                }
              : undefined
          }
        />
      ) : null}

      {openAddJob && workOrder?.id ? (
        <AddJobModal
          isOpen={openAddJob}
          onClose={() => setOpenAddJob(false)}
          workOrderId={workOrder.id}
          vehicleId={vehicle?.id ?? null}
          techId={
            (line as unknown as { assigned_tech_id?: string | null })?.assigned_tech_id ?? "system"
          }
          shopId={workOrder?.shop_id ?? null}
          onJobAdded={async () => {
            await refresh();
            setOpenAddJob(false);
          }}
        />
      ) : null}
    </>
  );
}
