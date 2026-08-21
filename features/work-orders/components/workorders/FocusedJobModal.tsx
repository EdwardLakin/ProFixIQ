"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Dialog } from "@headlessui/react";
import { format } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  History,
  MessageSquare,
  PackageSearch,
  PauseCircle,
  Sparkles,
  UserRound,
} from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { cn } from "@shared/lib/utils";

import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";
import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import WorkOrderMediaGallery from "@/features/work-orders/components/workorders/extras/WorkOrderMediaGallery";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import AIAssistantModal from "@work-orders/components/workorders/AiAssistantModal";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";
import JobPunchButton from "@/features/work-orders/components/JobPunchButton";
import { runJobPunchTransition } from "@/features/work-orders/lib/jobPunchTransitionsClient";
import { normalizeWorkOrderLineStatus } from "@/features/work-orders/lib/line-status";
import {
  formatLaborSummary,
  resolveOperationalLineStatusLabel,
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
  summarizeCanonicalPartAllocations,
  getCanonicalPartUnitPrice,
} from "@/features/work-orders/lib/display/workOrderParts";
import VehicleHistoryModal from "@/features/work-orders/components/workorders/VehicleHistoryModal";
import DtcSuggestionModal from "@/features/work-orders/components/workorders/DtcSuggestionPopup";
import { WorkOrderWorkspaceModule } from "@/features/work-orders/workspace/WorkOrderWorkspaceFrame";
import {
  getWorkOrderJobWorkspaceTabs,
  type WorkOrderJobWorkspaceTabId,
} from "@/features/work-orders/workspace/workOrderWorkspace";
import { useWorkOrderPartsRefresh } from "@/features/work-orders/workspace/useWorkOrderPartsRefresh";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Mode = "tech" | "view";
type Variant = "modal" | "panel" | "cockpit";

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
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"] & { technician_notes?: string | null };
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type TechnicianOption = {
  id: string;
  full_name: string | null;
  role: string | null;
};

const EMPTY_TECHNICIAN_OPTIONS: readonly TechnicianOption[] = [];

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
  lineSnapshot?: WorkOrderLine | null;
  primaryTechSnapshot?: TechnicianOption | null;
  isPunchedInSnapshot?: boolean;
  canAssignTechnician?: boolean;
  technicianOptions?: readonly TechnicianOption[];
  onAssignTechnician?: (
    lineId: string,
    technicianId: string,
  ) => void | Promise<void>;
  onOpenInspection?: () => void | Promise<void>;
  onOpenPartsInventory?: () => void;
  onChanged?: () => void | Promise<void>;
  mode?: Mode;
  variant?: Variant;
}): JSX.Element | null {
  const {
    isOpen,
    onClose,
    workOrderLineId,
    lineSnapshot,
    primaryTechSnapshot,
    isPunchedInSnapshot,
    canAssignTechnician = false,
    technicianOptions = EMPTY_TECHNICIAN_OPTIONS,
    onAssignTechnician,
    onOpenInspection,
    onOpenPartsInventory,
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
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  const [openChat, setOpenChat] = useState(false);
  const [openAddJob, setOpenAddJob] = useState(false);
  const [openAi, setOpenAi] = useState(false);
  const [openDtc, setOpenDtc] = useState(false);
  const [openVehicleHistory, setOpenVehicleHistory] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<WorkOrderJobWorkspaceTabId>("overview");
  const inspectionAvailable = Boolean(onOpenInspection);
  const workspaceTabs = useMemo(
    () => getWorkOrderJobWorkspaceTabs({ inspectionAvailable }),
    [inspectionAvailable],
  );

  const [prefillCause, setPrefillCause] = useState("");
  const [prefillCorrection, setPrefillCorrection] = useState("");

  const [allocs, setAllocs] = useState<AllocationRow[]>([]);
  const [requiredParts, setRequiredParts] = useState<RequiredPartRow[]>([]);
  const displayOnlyAllocations = useMemo(
    () => filterAllocationsNotBackedByCanonicalParts(allocs, requiredParts),
    [allocs, requiredParts],
  );
  const [assignedTechProfile, setAssignedTechProfile] = useState<TechnicianOption | null>(null);
  const [assigningTechnician, setAssigningTechnician] = useState(false);
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
    setActiveWorkspaceTab("overview");
  }, [workOrderLineId]);

  useEffect(() => {
    if (
      !workspaceTabs.some((tab) => tab.id === activeWorkspaceTab)
    ) {
      setActiveWorkspaceTab("overview");
    }
  }, [activeWorkspaceTab, workspaceTabs]);

  useEffect(() => {
    if (lineSnapshot?.id === workOrderLineId) {
      setLine(lineSnapshot);
    }
  }, [lineSnapshot, workOrderLineId]);

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
        setTechNotes(l?.technician_notes ?? "");

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
    if (!isOpen) return;

    const assignedTechId = line?.assigned_tech_id ?? null;
    if (!assignedTechId) {
      setAssignedTechProfile(null);
      return;
    }
    if (primaryTechSnapshot?.id === assignedTechId) {
      setAssignedTechProfile(primaryTechSnapshot);
      return;
    }

    let cancelled = false;
    setAssignedTechProfile(null);

    void (async () => {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", assignedTechId)
        .maybeSingle<TechnicianOption>();

      if (cancelled) return;
      if (error) {
        console.warn("[FocusedJob] assigned technician lookup failed:", error);
        return;
      }
      setAssignedTechProfile(profile ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, line?.assigned_tech_id, primaryTechSnapshot, supabase]);

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
    setTechNotes(l?.technician_notes ?? "");
    await onChanged?.();
    await loadAllocations();
  }, [supabase, workOrderLineId, onChanged, loadAllocations]);

  const assignTechnician = useCallback(
    async (technicianId: string): Promise<void> => {
      if (!line?.id || !onAssignTechnician || assigningTechnician) return;
      setAssigningTechnician(true);
      try {
        await onAssignTechnician(line.id, technicianId);
      } finally {
        setAssigningTechnician(false);
      }
    },
    [assigningTechnician, line?.id, onAssignTechnician],
  );

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("wol:refresh", handler);
    return () => window.removeEventListener("wol:refresh", handler);
  }, [refresh]);

  useWorkOrderPartsRefresh(workOrderLineId, loadAllocations);

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

    const isVideo = file.type.startsWith("video/") || /\.(mov|m4v|mp4|webm)$/i.test(file.name);
    const contentType = file.type || (isVideo ? "video/mp4" : "image/jpeg");
    const path = `wo/${workOrder.id}/lines/${workOrderLineId}/${uuidv4()}_${file.name}`;
    const { error } = await supabase.storage.from("job-photos").upload(path, file, {
      contentType,
      upsert: true,
    });
    if (error) return showErr(isVideo ? "Video upload failed" : "Photo upload failed", error);
    setMediaRefreshKey((key) => key + 1);
    toast.success(isVideo ? "Video attached" : "Photo attached");
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await ensureShopContext((workOrder?.shop_id as string | null) ?? null);

      const { error } = await supabase
        .from("work_order_lines")
        .update({
          technician_notes: techNotes,
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
  const isOperationallyActive =
    isPunchedInSnapshot ??
    (Boolean(line?.punched_in_at) && !line?.punched_out_at);
  const statusLabel = line
    ? resolveOperationalLineStatusLabel(line, { isActive: isOperationallyActive })
    : "Loading";

  const createdStart = startAt
    ? format(new Date(startAt), "PPpp")
    : isOperationallyActive
      ? "Active session"
      : "—";
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
  const assignedTechnicianIsSelectable = Boolean(
    line?.assigned_tech_id &&
      technicianOptions.some((technician) => technician.id === line.assigned_tech_id),
  );
  const customerDisplay = customer
    ? customer.business_name?.trim() ||
      [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") ||
      "Customer"
    : "No customer linked";
  const vehicleDisplay = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model]
        .filter((value) => value != null && String(value).trim())
        .join(" ") || "Vehicle linked"
    : "No vehicle linked";

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
                      isActive={isOperationallyActive}
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

              {workOrder?.id ? (
                <SectionCard>
                  <WorkOrderMediaGallery
                    workOrderId={workOrder.id}
                    workOrderLineId={workOrderLineId}
                    refreshKey={mediaRefreshKey}
                  />
                </SectionCard>
              ) : null}

              <SectionCard title={partsBottleneckDisplay?.heading ?? "Parts used"}>
                {allocsLoading ? (
                  <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading…</div>
                ) : partsBottleneckDisplay && (displayOnlyAllocations.length + requiredParts.length) === 0 ? (
                  <div className="text-sm text-[color:var(--theme-text-primary)]">
                    {partsBottleneckDisplay.detail}
                  </div>
                ) : (displayOnlyAllocations.length + requiredParts.length) === 0 ? (
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
                        const allocation = summarizeCanonicalPartAllocations(p, allocs);
                        return (
                          <li key={`required-${p.id}`} className="grid grid-cols-12 items-center gap-2 px-3 py-2 text-sm">
                            <div className="col-span-7 min-w-0 break-words text-[color:var(--theme-text-primary)]">
                              {getCanonicalPartDescription(p) ?? "—"}
                              <div className="text-[11px] text-[color:var(--theme-text-secondary)]">{[getCanonicalPartNumber(p), getCanonicalPartManufacturer(p), p.lifecycle_status ?? "requested"].filter(Boolean).join(" • ")}</div>
                            </div>
                            <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">
                              {allocation.locations.length > 0
                                ? allocation.locations.map((location) => `loc ${location.slice(0, 6)}…`).join(", ")
                                : unit > 0 ? money(unit) : "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">
                              {allocation.allocatedQuantity > 0 ? `${allocation.allocatedQuantity}/${qty}` : qty}
                            </div>
                          </li>
                        );
                      })}
                      {displayOnlyAllocations.map((a) => {
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

  const repairStoryWorkspace = line ? (
    <section className="border-b border-[color:var(--theme-border-soft)] pb-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Repair story
          </div>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
            Complaint, cause &amp; correction
          </h3>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
          onClick={() => {
            closeAllSubModals();
            setPrefillCause(line.cause ?? "");
            setPrefillCorrection(line.correction ?? "");
            setOpenComplete(true);
          }}
        >
          Edit story
        </button>
      </div>
      <dl className="grid gap-3 text-sm">
        {[
          ["Complaint", line.complaint?.trim() || line.description?.trim() || "Add complaint"],
          ["Cause", line.cause?.trim() || "Add cause"],
          ["Correction", line.correction?.trim() || "Add correction"],
          ["Blocker", line.hold_reason?.trim() || "None"],
        ].map(([label, value]) => (
          <div key={label} className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
            <dt className="font-medium text-[color:var(--theme-text-secondary)]">{label}</dt>
            <dd className="text-[color:var(--theme-text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  ) : null;

  const partsWorkspace = line ? (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Parts &amp; labor
          </div>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
            Job economics and fulfillment
          </h3>
        </div>
        <button
          type="button"
          className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
          onClick={() => {
            closeAllSubModals();
            setOpenParts(true);
          }}
          disabled={busy}
        >
          Request parts
        </button>
      </div>
      <div className="grid divide-y divide-[color:var(--theme-border-soft)] border-y border-[color:var(--theme-border-soft)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-3 py-3 sm:first:pl-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Labor</div>
          <div className="mt-1 text-sm font-medium text-[color:var(--theme-text-primary)]">{laborDisplay}</div>
        </div>
        <div className="px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Parts</div>
          <div className="mt-1 text-sm font-medium text-[color:var(--theme-text-primary)]">
            {allocsLoading
              ? "Loading…"
              : `${allocs.length + requiredParts.length} attached or required`}
          </div>
        </div>
        <div className="px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Line total</div>
          <div className="mt-1 font-mono text-sm font-semibold text-[color:var(--theme-text-primary)]">
            {lineTotal > 0 ? money(lineTotal) : "Estimate pending"}
          </div>
        </div>
      </div>
      {partsBottleneckDisplay ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/8 px-3 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">{partsBottleneckDisplay.heading}</div>
            <div className="mt-0.5 text-xs text-amber-100/80">{partsBottleneckDisplay.detail}</div>
          </div>
        </div>
      ) : null}
    </section>
  ) : null;

  const fullPartsWorkspace = line ? (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Fulfillment
          </div>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
            {partsBottleneckDisplay?.heading ?? "Parts used and required"}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenPartsInventory ? (
            <button
              type="button"
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)]"
              onClick={onOpenPartsInventory}
              disabled={busy}
            >
              Add from inventory
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
            onClick={() => {
              closeAllSubModals();
              setOpenParts(true);
            }}
            disabled={busy}
          >
            Request parts
          </button>
        </div>
      </div>
      {allocsLoading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading…</div>
      ) : allocs.length + requiredParts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-4 py-8 text-center text-sm text-[color:var(--theme-text-secondary)]">
          {partsBottleneckDisplay?.detail ?? "No parts used yet."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)]">
          <div className="grid grid-cols-12 bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[color:var(--theme-text-secondary)]">
            <div className="col-span-7">Part</div>
            <div className="col-span-3">Price / location</div>
            <div className="col-span-2 text-right">Qty</div>
          </div>
          <ul className="divide-y divide-[color:var(--theme-border-soft)]">
            {requiredParts.map((part) => {
              const qty = getCanonicalPartQuantity(part);
              const unit = getCanonicalPartUnitPrice(part);
              return (
                <li key={`cockpit-required-${part.id}`} className="grid grid-cols-12 items-center gap-2 px-3 py-3 text-sm">
                  <div className="col-span-7 min-w-0 text-[color:var(--theme-text-primary)]">
                    <div className="truncate font-medium">{getCanonicalPartDescription(part) ?? "Part"}</div>
                    <div className="mt-0.5 truncate text-[11px] text-[color:var(--theme-text-secondary)]">
                      {[getCanonicalPartNumber(part), getCanonicalPartManufacturer(part), part.lifecycle_status ?? "requested"].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                  <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">{unit > 0 ? money(unit) : "—"}</div>
                  <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">{qty}</div>
                </li>
              );
            })}
            {allocs.map((allocation) => {
              const qty =
                (allocation as unknown as { qty?: number | null }).qty ??
                (allocation as unknown as { quantity?: number | null }).quantity ??
                0;
              const locationId = (allocation as unknown as { location_id?: string | null }).location_id;
              return (
                <li key={`cockpit-allocated-${allocation.id}`} className="grid grid-cols-12 items-center gap-2 px-3 py-3 text-sm">
                  <div className="col-span-7 truncate font-medium text-[color:var(--theme-text-primary)]">{allocation.parts?.name ?? "Part"}</div>
                  <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">{locationId ? `loc ${locationId.slice(0, 6)}…` : "—"}</div>
                  <div className="col-span-2 text-right font-semibold text-[color:var(--theme-text-primary)]">{qty}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  ) : null;

  const inspectionWorkspace = line && onOpenInspection ? (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            Inspection workflow
          </div>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
            Attached inspection
          </h3>
        </div>
        <button
          type="button"
          className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
          onClick={() => void onOpenInspection()}
          disabled={busy}
        >
          Open inspection
        </button>
      </div>
      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-4">
        <div className="text-sm font-medium text-[color:var(--theme-text-primary)]">
          {lineLabel}
        </div>
        <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
          Continue the existing inspection, evidence, autosave, and completion flow for this job.
        </p>
      </div>
    </section>
  ) : null;

  const CockpitBody = (
    <div
      data-work-order-cockpit="true"
      data-work-order-scroll-owner="page"
      className="grid items-start gap-2 bg-transparent lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <section className="flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-[0_16px_42px_rgba(15,23,42,0.1)]">
        <header className="border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-5 pb-0 pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--brand-primary)]" aria-hidden="true" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                  {String(line?.job_type ?? "Selected job").replaceAll("_", " ")}
                </span>
                {line?.approval_state ? (
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
                    Approval {line.approval_state}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-2 line-clamp-2 text-lg font-semibold tracking-tight text-[color:var(--theme-text-primary)]">
                {lineLabel}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--theme-text-muted)]">
                <span className="font-mono">
                  {workOrder ? `WO ${workOrder.custom_id || workOrder.id.slice(0, 8)}` : "Selected job"}
                </span>
                <span aria-hidden="true">•</span>
                <span>{customerDisplay}</span>
                <span aria-hidden="true">•</span>
                <span>{vehicleDisplay}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Selected job workspace">
            {workspaceTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeWorkspaceTab === tab.id}
                data-workspace-module-action={tab.module}
                onClick={() => setActiveWorkspaceTab(tab.id)}
                className={cn(
                  "border-b-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition",
                  activeWorkspaceTab === tab.id
                    ? "border-[color:var(--brand-primary)] text-[color:var(--theme-text-primary)]"
                    : "border-transparent text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <div className="px-5 py-5">
          {busy && !line ? (
            <div className="grid gap-3">
              <div className="h-6 w-40 animate-pulse rounded bg-[color:var(--theme-surface-subtle)]" />
              <div className="h-32 animate-pulse rounded-xl bg-[color:var(--theme-surface-subtle)]" />
            </div>
          ) : !line ? (
            <div className="text-sm text-[color:var(--theme-text-secondary)]">No job found.</div>
          ) : activeWorkspaceTab === "overview" ? (
            <div className="space-y-6">
              {repairStoryWorkspace}
              {partsWorkspace}
              {workOrder?.id ? (
                <section className="border-t border-[color:var(--theme-border-soft)] pt-6">
                  <WorkOrderMediaGallery
                    workOrderId={workOrder.id}
                    workOrderLineId={workOrderLineId}
                    refreshKey={mediaRefreshKey}
                  />
                </section>
              ) : null}
            </div>
          ) : activeWorkspaceTab === "story" ? (
            <div className="space-y-6">
              {repairStoryWorkspace}
              <section>
                <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                  Technician notes
                </div>
                <textarea
                  rows={10}
                  value={techNotes}
                  onChange={(event) => setTechNotes(event.target.value)}
                  onBlur={saveNotes}
                  disabled={savingNotes}
                  className="w-full resize-y rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm leading-6 text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20"
                  placeholder="Add notes for this job…"
                />
                <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                  Notes save when focus leaves the field.
                </div>
              </section>
            </div>
          ) : activeWorkspaceTab === "inspection" ? (
            <WorkOrderWorkspaceModule module="inspection">
              {inspectionWorkspace}
            </WorkOrderWorkspaceModule>
          ) : activeWorkspaceTab === "parts" ? (
            <WorkOrderWorkspaceModule module="parts">
              {fullPartsWorkspace}
            </WorkOrderWorkspaceModule>
          ) : activeWorkspaceTab === "evidence" ? (
            workOrder?.id ? (
              <WorkOrderMediaGallery
                workOrderId={workOrder.id}
                workOrderLineId={workOrderLineId}
                refreshKey={mediaRefreshKey}
              />
            ) : null
          ) : (
            <div className="space-y-6">
              <section>
                <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
                  Job details
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  <MetaStat label="Start" value={createdStart} />
                  <MetaStat label="Finish" value={createdFinish} />
                  <MetaStat label="Hold reason" value={line.hold_reason ?? "—"} />
                  <MetaStat label="Job type" value={String(line.job_type ?? "—").replaceAll("_", " ")} />
                  <MetaStat label="Primary tech" value={primaryTechDisplay} />
                  <MetaStat label="Labor" value={laborDisplay} />
                  <MetaStat label="Line total" value={lineTotal > 0 ? money(lineTotal) : "Estimate pending"} />
                </div>
              </section>
              <section className="border-t border-[color:var(--theme-border-soft)] pt-6">
                <details className="group">
                  <summary className="cursor-pointer text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    AI suggested repairs
                  </summary>
                  <div className="mt-3">
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
                    ) : null}
                  </div>
                </details>
              </section>
              <div className="font-mono text-[11px] text-[color:var(--theme-text-muted)]">
                Job ID {line.id}
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="rounded-[20px] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[0_16px_42px_rgba(15,23,42,0.1)]">
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
            Command center
          </div>
          <div className="mt-4 grid gap-3">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-5 w-5 text-sky-300" />
              <div>
                <div className="text-[11px] text-[color:var(--theme-text-secondary)]">Current state</div>
                <div className={`mt-0.5 text-sm font-semibold ${chip(normalizedLineStatus)}`}>{statusLabel}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertTriangle className={cn("mt-0.5 h-5 w-5", line?.hold_reason ? "text-amber-300" : "text-[color:var(--theme-text-muted)]")} />
              <div>
                <div className="text-[11px] text-[color:var(--theme-text-secondary)]">Blocker</div>
                <div className="mt-0.5 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                  {line?.hold_reason || partsBottleneckDisplay?.detail || "None"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {line ? (
          <div className="space-y-4 px-4 py-4">
            {mode === "tech" ? (
              <section>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                  Next action
                </div>
                {line.status !== "completed" ? (
                  <JobPunchButton
                    lineId={line.id}
                    punchedInAt={line.punched_in_at}
                    punchedOutAt={line.punched_out_at}
                    status={line.status as WorkflowStatus}
                    isActive={isOperationallyActive}
                    onFinishRequested={() => {
                      closeAllSubModals();
                      setPrefillCause(line.cause ?? "");
                      setPrefillCorrection(line.correction ?? "");
                      setOpenComplete(true);
                    }}
                    onUpdated={refresh}
                    disabled={completionBlocked}
                  />
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-3 text-sm font-semibold text-emerald-100">
                    <CheckCircle2 className="h-4 w-4" />
                    Job completed
                  </div>
                )}

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={cn(btnInfo, "gap-1.5 text-xs")}
                    onClick={() => {
                      closeAllSubModals();
                      setOpenParts(true);
                    }}
                    disabled={busy}
                  >
                    <PackageSearch className="h-4 w-4" />
                    Parts
                  </button>
                  <button
                    type="button"
                    className={cn(btnInfo, "gap-1.5 text-xs")}
                    onClick={() => {
                      closeAllSubModals();
                      setOpenHold(true);
                    }}
                    disabled={busy}
                  >
                    <PauseCircle className="h-4 w-4" />
                    {normalizedLineStatus === "on_hold"
                      ? "Manage hold"
                      : isOperationallyActive
                        ? "Hold"
                        : "Add hold"}
                  </button>
                  <button
                    type="button"
                    className={cn(btnTertiary, "gap-1.5 text-xs")}
                    onClick={() => {
                      closeAllSubModals();
                      setOpenPhoto(true);
                    }}
                    disabled={busy}
                  >
                    <Camera className="h-4 w-4" />
                    Add photo
                  </button>
                  <button
                    type="button"
                    className={cn(btnTertiary, "gap-1.5 text-xs")}
                    onClick={() => {
                      closeAllSubModals();
                      setOpenChat(true);
                    }}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Message
                  </button>
                  <button
                    type="button"
                    className={cn(btnTertiary, "gap-1.5 text-xs")}
                    onClick={() => {
                      closeAllSubModals();
                      setOpenAi(true);
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                    AI assist
                  </button>
                  <button
                    type="button"
                    className={cn(btnTertiary, "gap-1.5 text-xs")}
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
                    <History className="h-4 w-4" />
                    History
                  </button>
                </div>

                {completionBlocked ? (
                  <div className="mt-2 text-[11px] text-amber-300">
                    {normalizedLineStatus === "awaiting_approval"
                      ? "Awaiting approval — labor actions disabled"
                      : normalizedLineStatus === "declined"
                        ? "Declined — labor actions disabled"
                        : line.approval_state && line.approval_state !== "approved"
                          ? "Not approved — labor actions disabled"
                          : ""}
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="border-t border-[color:var(--theme-border-soft)] pt-4">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[color:var(--theme-text-secondary)]">Approval</span>
                  <span className="font-semibold capitalize text-[color:var(--theme-text-primary)]">{line.approval_state ?? "Not required"}</span>
                </div>
                {canAssignTechnician && onAssignTechnician && technicianOptions.length > 0 ? (
                  <label className="grid gap-1.5">
                    <span className="text-[color:var(--theme-text-secondary)]">Primary tech</span>
                    <span className="relative block">
                      <UserRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[color:var(--theme-text-muted)]" />
                      <select
                        aria-label="Primary technician"
                        value={line.assigned_tech_id ?? ""}
                        onChange={(event) => void assignTechnician(event.target.value)}
                        disabled={busy || assigningTechnician}
                        className="h-10 w-full appearance-none rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] py-2 pl-9 pr-3 text-sm font-semibold text-[color:var(--theme-text-primary)] outline-none transition focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:var(--brand-primary)]/20 disabled:cursor-wait disabled:opacity-60"
                      >
                        <option value="" disabled>
                          Choose technician
                        </option>
                        {line.assigned_tech_id && !assignedTechnicianIsSelectable ? (
                          <option value={line.assigned_tech_id}>
                            {primaryTechDisplay === "Unassigned"
                              ? "Current technician"
                              : primaryTechDisplay}
                          </option>
                        ) : null}
                        {technicianOptions.map((technician) => (
                          <option key={technician.id} value={technician.id}>
                            {technician.full_name || "Unnamed technician"}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[color:var(--theme-text-secondary)]">Primary tech</span>
                    <span className="inline-flex min-w-0 items-center gap-1.5 truncate font-semibold text-[color:var(--theme-text-primary)]">
                      <UserRound className="h-4 w-4 shrink-0" />
                      {primaryTechDisplay}
                    </span>
                  </div>
                )}
              </div>
            </section>

            <section className="border-t border-[color:var(--theme-border-soft)] pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Timing</div>
              <dl className="mt-3 grid gap-2 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-[color:var(--theme-text-secondary)]">Start</dt><dd className="text-right text-[color:var(--theme-text-primary)]">{createdStart}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[color:var(--theme-text-secondary)]">Finish</dt><dd className="text-right text-[color:var(--theme-text-primary)]">{createdFinish}</dd></div>
              </dl>
            </section>
            <div
              id="work-order-runtime-status"
              className="border-t border-[color:var(--theme-border-soft)] pt-4 empty:hidden"
            />
          </div>
        ) : null}
      </aside>
    </div>
  );

  const Shell =
    variant === "cockpit" ? (
      <div className="relative h-full">{CockpitBody}</div>
    ) : variant === "panel" ? (
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

      {openVehicleHistory && vehicle?.id && workOrder?.id && line?.id ? (
        <VehicleHistoryModal
          isOpen={openVehicleHistory}
          onClose={() => setOpenVehicleHistory(false)}
          workOrderId={workOrder.id}
          workOrderLineId={line.id}
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
            canAssignTechnician
              ? ((line as unknown as { assigned_tech_id?: string | null })
                  ?.assigned_tech_id ?? "system")
              : "system"
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
