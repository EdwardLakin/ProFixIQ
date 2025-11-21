"use client";

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  type JSX,
} from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";

import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import StatusPickerModal from "@/features/work-orders/components/workorders/extras/StatusPickerModal";
import TimeAdjustModal from "@/features/work-orders/components/workorders/extras/TimeAdjustModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";

import AIAssistantModal from "@work-orders/components/workorders/AiAssistantModal";

import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";

import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";

import JobPunchButton from "@/features/work-orders/components/JobPunchButton";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Mode = "tech" | "view";

const statusTextColor: Record<string, string> = {
  in_progress: "text-sky-200",
  awaiting: "text-slate-200",
  queued: "text-indigo-200",
  on_hold: "text-amber-200",
  completed: "text-emerald-200",
  paused: "text-amber-200",
  assigned: "text-sky-200",
  unassigned: "text-neutral-200",
  awaiting_approval: "text-blue-200",
  declined: "text-red-200",
};

const chip = (s: string | null) =>
  statusTextColor[(s ?? "awaiting").toLowerCase().replaceAll(" ", "_")] ??
  "text-neutral-200";

const btnBase =
  "rounded-md border text-sm px-3 py-2 transition-colors text-left";
const btnNeutral =
  btnBase + " border-neutral-700 text-neutral-100 hover:bg-neutral-800/80";
const btnWarn =
  btnBase + " border-amber-500/70 text-amber-100 hover:bg-amber-500/10";
const btnDanger =
  btnBase + " border-red-500/70 text-red-100 hover:bg-red-500/10";
const btnInfo =
  btnBase + " border-sky-500/70 text-sky-100 hover:bg-sky-500/10";
const btnAccent =
  btnBase + " border-accent/80 text-accent hover:bg-accent/10";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };

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

type ApprovalState = "pending" | "approved" | "declined" | null;

type PickerValue =
  | `status:${WorkflowStatus}`
  | "approval:pending"
  | "approval:approved"
  | "approval:declined";

export default function MobileFocusedJob(props: {
  workOrderLineId: string;
  onBack: () => void;
  onChanged?: () => void | Promise<void>;
  mode?: Mode;
}): JSX.Element {
  const { workOrderLineId, onBack, onChanged, mode = "tech" } = props;

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [techNotes, setTechNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // sub-modals
  const [openComplete, setOpenComplete] = useState(false);
  const [openParts, setOpenParts] = useState(false);
  const [openHold, setOpenHold] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const [openTime, setOpenTime] = useState(false);
  const [openPhoto, setOpenPhoto] = useState(false);
  const [openChat, setOpenChat] = useState(false);
  const [openAddJob, setOpenAddJob] = useState(false);
  const [openAi, setOpenAi] = useState(false);

  // prefill
  const [prefillCause, setPrefillCause] = useState("");
  const [prefillCorrection, setPrefillCorrection] = useState("");

  // parts used
  const [allocs, setAllocs] = useState<AllocationRow[]>([]);
  const [allocsLoading, setAllocsLoading] = useState(false);

  const showErr = (prefix: string, err?: { message?: string } | null) => {
    toast.error(`${prefix}: ${err?.message ?? "Something went wrong."}`);
    console.error(prefix, err);
  };

  const closeAllSubModals = () => {
    setOpenComplete(false);
    setOpenParts(false);
    setOpenHold(false);
    setOpenStatus(false);
    setOpenTime(false);
    setOpenPhoto(false);
    setOpenChat(false);
    setOpenAddJob(false);
    setOpenAi(false);
  };

  // initial load
  useEffect(() => {
    if (!workOrderLineId) return;
    (async () => {
      setBusy(true);
      try {
        const { data: l, error: le } = await supabase
          .from("work_order_lines")
          .select("*")
          .eq("id", workOrderLineId)
          .maybeSingle<WorkOrderLine>();
        if (le) throw le;
        setLine(l ?? null);
        setTechNotes(l?.notes ?? "");

        if (l?.work_order_id) {
          const { data: wo, error: we } = await supabase
            .from("work_orders")
            .select("*")
            .eq("id", l.work_order_id)
            .maybeSingle<WorkOrder>();
          if (we) throw we;
          setWorkOrder(wo ?? null);

          if (wo?.vehicle_id) {
            const { data: v, error: ve } = await supabase
              .from("vehicles")
              .select("*")
              .eq("id", wo.vehicle_id)
              .maybeSingle<Vehicle>();
            if (ve) throw ve;
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
            setCustomer(c ?? null);
          } else {
            setCustomer(null);
          }
        }
      } catch (e) {
        const err = e as { message?: string };
        toast.error(err?.message ?? "Failed to load job");
      } finally {
        setBusy(false);
      }
    })();
  }, [workOrderLineId, supabase]);

  // realtime line
  useEffect(() => {
    if (!workOrderLineId) return;
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
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [workOrderLineId, supabase]);

  const loadAllocations = useCallback(async () => {
    if (!workOrderLineId) return;
    setAllocsLoading(true);
    try {
      const { data, error } = await supabase
        .from("work_order_part_allocations")
        .select("*, parts(name)")
        .eq("work_order_line_id", workOrderLineId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setAllocs((data as AllocationRow[]) ?? []);
    } catch (e) {
      console.warn("[MobileFocusedJob] load allocations failed", e);
    } finally {
      setAllocsLoading(false);
    }
  }, [supabase, workOrderLineId]);

  useEffect(() => {
    void loadAllocations();
  }, [loadAllocations]);

  useEffect(() => {
    if (!workOrderLineId) return;

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
        () => void loadAllocations()
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        //
      }
    };
  }, [workOrderLineId, supabase, loadAllocations]);

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

  // parts request events
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

  // inspection done → open complete
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
    return () =>
      window.removeEventListener("inspection:completed", onInspectionDone);
  }, [workOrderLineId]);

  const applyHold = async (reason: string, notes?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          hold_reason: reason || "On hold",
          status: "on_hold",
          notes: notes ?? line?.notes ?? null,
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", workOrderLineId);
      if (error) return showErr("Apply hold failed", error);
      toast.success("Hold applied");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const releaseHold = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          hold_reason: null,
          status: "awaiting",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", workOrderLineId);
      if (error) return showErr("Remove hold failed", error);
      toast.success("Hold removed");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (next: PickerValue) => {
    if (next.startsWith("approval:")) {
      const val = next.split(":")[1] as ApprovalState;
      if (!line?.id) return;
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          approval_state: val,
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", line.id);
      if (error) return showErr("Update approval failed", error);
      toast.success("Approval state updated");
      await refresh();
      return;
    }

    const workflow = next.split(":")[1] as WorkflowStatus;
    const { error } = await supabase
      .from("work_order_lines")
      .update({ status: workflow } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", workOrderLineId);
    if (error) return showErr("Update status failed", error);
    toast.success("Status updated");
    await refresh();
  };

  const updateTime = async (inAt: string | null, outAt: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          punched_in_at: inAt,
          punched_out_at: outAt,
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", workOrderLineId)
        .select("id, punched_in_at, punched_out_at")
        .single();
      if (error) return showErr("Update time failed", error);
      toast.success("Time updated");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!workOrderLineId || !workOrder?.id) return;
    const path = `wo/${workOrder.id}/lines/${workOrderLineId}/${uuidv4()}_${file.name}`;
    const { error } = await supabase.storage
      .from("job-photos")
      .upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
    if (error) return showErr("Photo upload failed", error);
    toast.success("Photo attached");
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        notes: techNotes,
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", workOrderLineId);
    setSavingNotes(false);
    if (error) return showErr("Update notes failed", error);
    toast.success("Notes saved");
    await refresh();
  };

  const startAt = line?.punched_in_at ?? null;
  const finishAt = line?.punched_out_at ?? null;

  const titleText =
    `${line?.line_no ? `#${line.line_no} ` : ""}` +
    (line?.description || line?.complaint || "Focused Job") +
    (line?.job_type ? ` — ${String(line.job_type).replaceAll("_", " ")}` : "");

  const createdStart = startAt ? format(new Date(startAt), "PPpp") : "—";
  const createdFinish = finishAt ? format(new Date(finishAt), "PPpp") : "—";

  return (
    <>
      <VoiceContextSetter
        currentView="focused_job_mobile"
        workOrderId={workOrder?.id ?? undefined}
        vehicleId={vehicle?.id ?? undefined}
        customerId={customer?.id ?? undefined}
        lineId={line?.id ?? undefined}
      />

      <div className="flex min-h-screen flex-col bg-neutral-950 text-foreground">
        {/* Header */}
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              closeAllSubModals();
              onBack();
            }}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-foreground/80 hover:bg-white/10"
          >
            ← Back
          </button>
          <div className="flex-1 truncate px-2 text-center text-xs font-semibold">
            {line ? (
              <span className={chip(line.status ?? null)}>{titleText}</span>
            ) : (
              "Job"
            )}
          </div>
          {workOrder?.id && (
            <button
              type="button"
              className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-black hover:bg-accent/90"
              onClick={() => {
                closeAllSubModals();
                setOpenAddJob(true);
              }}
              disabled={busy}
            >
              Add Job
            </button>
          )}
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mx-auto max-w-xl space-y-4">
            {busy && !line ? (
              <div className="grid gap-3">
                <div className="h-6 w-40 animate-pulse rounded bg-neutral-800/60" />
                <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
              </div>
            ) : !line ? (
              <div className="text-sm text-muted-foreground">No job found.</div>
            ) : (
              <>
                {/* meta info */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded border border-white/5 bg-neutral-900/70 p-3">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className={`font-medium ${chip(line.status ?? null)}`}>
                      {String(line.status || "awaiting").replaceAll(
                        "_",
                        " "
                      )}
                    </div>
                  </div>
                  <div className="rounded border border-white/5 bg-neutral-900/70 p-3">
                    <div className="text-xs text-muted-foreground">Start</div>
                    <div className="font-medium">{createdStart}</div>
                  </div>
                  <div className="rounded border border-white/5 bg-neutral-900/70 p-3">
                    <div className="text-xs text-muted-foreground">Finish</div>
                    <div className="font-medium">{createdFinish}</div>
                  </div>
                  <div className="rounded border border-white/5 bg-neutral-900/70 p-3">
                    <div className="text-xs text-muted-foreground">
                      Hold Reason
                    </div>
                    <div className="font-medium">
                      {line.hold_reason ?? "—"}
                    </div>
                  </div>
                </div>

                {/* vehicle & customer */}
                <div className="rounded border border-white/5 bg-neutral-900/70 p-3 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Vehicle
                      </div>
                      <div className="truncate">
                        {vehicle
                          ? `${vehicle.year ?? ""} ${
                              vehicle.make ?? ""
                            } ${vehicle.model ?? ""}`
                              .trim()
                              .replace(/\s+/g, " ") || "—"
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground/80">
                        VIN: {vehicle?.vin ?? "—"} • Plate:{" "}
                        {vehicle?.license_plate ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">
                        Customer
                      </div>
                      <div className="truncate">
                        {customer
                          ? [customer.first_name ?? "", customer.last_name ?? ""]
                              .filter(Boolean)
                              .join(" ") || "—"
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground/80">
                        {customer?.phone ?? "—"}{" "}
                        {customer?.email ? `• ${customer.email}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* punch */}
                {mode === "tech" && line && (
                  <div className="grid">
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
                      disabled={
                        busy ||
                        line.status === "awaiting_approval" ||
                        line.status === "declined" ||
                        (!!line.approval_state &&
                          line.approval_state !== "approved")
                      }
                    />
                    {(line.status === "awaiting_approval" ||
                      (line.approval_state &&
                        line.approval_state !== "approved") ||
                      line.status === "declined") && (
                      <div className="mt-1 text-xs text-amber-300">
                        {line.status === "awaiting_approval"
                          ? "Awaiting approval — punching disabled"
                          : line.status === "declined"
                          ? "Declined — punching disabled"
                          : "Not approved — punching disabled"}
                      </div>
                    )}
                  </div>
                )}

                {/* controls */}
                <div className="grid gap-2 sm:grid-cols-2">
                  {mode === "tech" ? (
                    <>
                      <button
                        type="button"
                        className={btnAccent}
                        onClick={() => {
                          closeAllSubModals();
                          setPrefillCause(line?.cause ?? "");
                          setPrefillCorrection(line?.correction ?? "");
                          setOpenComplete(true);
                        }}
                        disabled={busy}
                      >
                        Complete (Cause / Correction)
                      </button>

                      <button
                        type="button"
                        className={btnDanger}
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
                        className={btnWarn}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenHold(true);
                        }}
                        disabled={busy}
                      >
                        {line.status === "on_hold" ? "On Hold" : "Hold"}
                      </button>

                      <button
                        type="button"
                        className={btnInfo}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenStatus(true);
                        }}
                        disabled={busy}
                      >
                        Change Status
                      </button>

                      <button
                        type="button"
                        className={btnNeutral}
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
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={btnInfo}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenStatus(true);
                        }}
                      >
                        Change Status
                      </button>
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
                    </>
                  )}
                </div>

                {/* parts used */}
                <div className="rounded border border-white/5 bg-neutral-900/70 p-3">
                  <div className="mb-2 text-sm font-medium text-foreground/90">
                    Parts used
                  </div>

                  {allocsLoading ? (
                    <div className="text-sm text-muted-foreground">Loading…</div>
                  ) : allocs.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No parts used yet.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded border border-white/5">
                      <div className="grid grid-cols-12 bg-neutral-900/80 px-3 py-2 text-xs text-muted-foreground">
                        <div className="col-span-7">Part</div>
                        <div className="col-span-3">Location</div>
                        <div className="col-span-2 text-right">Qty</div>
                      </div>
                      <ul className="max-h-56 overflow-auto divide-y divide-white/5">
                        {allocs.map((a) => (
                          <li
                            key={a.id}
                            className="grid grid-cols-12 items-center px-3 py-2 text-sm"
                          >
                            <div className="col-span-7 truncate">
                              {a.parts?.name ?? "Part"}
                            </div>
                            <div className="col-span-3 truncate text-muted-foreground">
                              {a.location_id
                                ? `loc ${String(a.location_id).slice(0, 6)}…`
                                : "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold">
                              {a.qty}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* tech notes */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground/90">
                    Tech Notes
                  </label>
                  <textarea
                    rows={4}
                    value={techNotes}
                    onChange={(e) => setTechNotes(e.target.value)}
                    onBlur={saveNotes}
                    disabled={savingNotes}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="Add notes for this job…"
                  />
                </div>

                {/* AI suggestions */}
                <div className="rounded border border-white/5 bg-neutral-900/70 p-3">
                  <h3 className="mb-2 text-sm font-medium text-foreground/90">
                    AI Suggested Repairs
                  </h3>
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
                    <div className="text-sm text-muted-foreground">
                      Vehicle/work order details required.
                    </div>
                  )}
                </div>

                <div className="pb-16 text-xs text-muted-foreground">
                  Job ID: {line.id}
                  {typeof line.labor_time === "number"
                    ? ` • Labor: ${line.labor_time.toFixed(1)}h`
                    : ""}
                  {line.hold_reason ? ` • Hold: ${line.hold_reason}` : ""}
                  {line.approval_state
                    ? ` • Approval: ${line.approval_state}`
                    : ""}
                </div>
              </>
            )}
          </div>
        </main>

        {/* bottom mic */}
        <footer className="sticky bottom-0 flex items-center justify-center border-t border-white/10 bg-neutral-950/90 px-3 py-2">
          <VoiceButton />
        </footer>
      </div>

      {/* sub-modals */}
      {openComplete && line && (
        <CauseCorrectionModal
          isOpen={openComplete}
          onClose={() => setOpenComplete(false)}
          jobId={line.id}
          initialCause={prefillCause}
          initialCorrection={prefillCorrection}
          onSubmit={async (cause: string, correction: string) => {
            const { error } = await supabase
              .from("work_order_lines")
              .update({
                cause,
                correction,
                punched_out_at: new Date().toISOString(),
                status: "completed",
              } as DB["public"]["Tables"]["work_order_lines"]["Update"])
              .eq("id", line.id);
            if (error) return showErr("Complete job failed", error);
            toast.success("Job completed");
            setOpenComplete(false);
            await refresh();
          }}
        />
      )}

      {openParts && workOrder?.id && line && (
        <PartsRequestModal
          isOpen={openParts}
          workOrderId={workOrder.id}
          jobId={line.id}
          requestNote={line.description ?? ""}
        />
      )}

      {openHold && line && (
        <HoldModal
          isOpen={openHold}
          onClose={() => setOpenHold(false)}
          onApply={applyHold}
          onRelease={line.hold_reason ? releaseHold : undefined}
          canRelease={!!line.hold_reason}
          defaultReason={line.hold_reason || "Awaiting parts"}
        />
      )}

      {openStatus && line && (
        <StatusPickerModal
          isOpen={openStatus}
          onClose={() => setOpenStatus(false)}
          current={
            (line?.status || "awaiting") as Parameters<
              typeof StatusPickerModal
            >[0]["current"]
          }
          onChange={changeStatus}
        />
      )}

      {openTime && line && (
        <TimeAdjustModal
          isOpen={openTime}
          onClose={() => setOpenTime(false)}
          punchedInAt={line.punched_in_at}
          punchedOutAt={line.punched_out_at}
          onApply={updateTime}
        />
      )}

      {openPhoto && (
        <PhotoCaptureModal
          isOpen={openPhoto}
          onClose={() => setOpenPhoto(false)}
          onCapture={uploadPhoto}
        />
      )}

      {openChat && (
        <NewChatModal
          isOpen={openChat}
          onClose={() => setOpenChat(false)}
          created_by="system"
          onCreated={() => setOpenChat(false)}
          context_type="work_order_line"
          context_id={line?.id ?? null}
        />
      )}

      {openAi && (
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
      )}

      {openAddJob && workOrder?.id && (
        <AddJobModal
          isOpen={openAddJob}
          onClose={() => setOpenAddJob(false)}
          workOrderId={workOrder.id}
          vehicleId={vehicle?.id ?? null}
          techId={line?.assigned_to || "system"}
          shopId={workOrder?.shop_id ?? null}
          onJobAdded={async () => {
            await refresh();
            setOpenAddJob(false);
          }}
        />
      )}
    </>
  );
}