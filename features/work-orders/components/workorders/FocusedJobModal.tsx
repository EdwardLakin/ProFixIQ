"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Dialog } from "@headlessui/react";
import { format } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

// existing modals
import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
// ⬇️ new request modal (replaces Drawer)
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";

// extras (kept)
import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import StatusPickerModal from "@/features/work-orders/components/workorders/extras/StatusPickerModal";
import TimeAdjustModal from "@/features/work-orders/components/workorders/extras/TimeAdjustModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";

// voice control
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";

// chat + AI
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";

// Punch
import JobPunchButton from "@/features/work-orders/components/JobPunchButton";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

type Mode = "tech" | "view";

const statusTextColor: Record<string, string> = {
  in_progress: "text-orange-300",
  awaiting: "text-slate-200",
  queued: "text-indigo-300",
  on_hold: "text-amber-300",
  completed: "text-green-300",
  paused: "text-amber-300",
  assigned: "text-sky-300",
  unassigned: "text-neutral-200",
  // real DB statuses
  awaiting_approval: "text-blue-300",
  declined: "text-red-300",
};

const chip = (s: string | null) =>
  statusTextColor[(s ?? "awaiting").toLowerCase().replaceAll(" ", "_")] ??
  "text-neutral-200";

const outlineBtn =
  "font-header rounded border px-3 py-2 text-sm transition-colors";
const outlineNeutral = `${outlineBtn} border-neutral-700 text-neutral-200 hover:bg-neutral-800`;
const outlineWarn = `${outlineBtn} border-amber-600 text-amber-300 hover:bg-amber-900/20`;
const outlineDanger = `${outlineBtn} border-red-600 text-red-300 hover:bg-red-900/20`;
const outlineInfo = `${outlineBtn} border-blue-600 text-blue-300 hover:bg-blue-900/20`;
const outlinePurple = `${outlineBtn} border-purple-600 text-purple-300 hover:bg-purple-900/20`;

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };

/** Per CHECK constraints in Supabase */
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

/** Encoded picker value from StatusPickerModal */
type PickerValue =
  | `status:${WorkflowStatus}`
  | "approval:pending"
  | "approval:approved"
  | "approval:declined";

export default function FocusedJobModal(props: {
  isOpen: boolean;
  onClose: () => void;
  workOrderLineId: string;
  onChanged?: () => void | Promise<void>;
  mode?: Mode;
}) {
  const { isOpen, onClose, workOrderLineId, onChanged, mode = "tech" } = props;

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

  // parts used
  const [allocs, setAllocs] = useState<AllocationRow[]>([]);
  const [allocsLoading, setAllocsLoading] = useState(false);

  // ---------- helpers ----------
  const showErr = (prefix: string, err?: { message?: string } | null) => {
    toast.error(`${prefix}: ${err?.message ?? "Something went wrong."}`);
    // eslint-disable-next-line no-console
    console.error(prefix, err);
  };

  // ---------- load initial ----------
  useEffect(() => {
    if (!isOpen || !workOrderLineId) return;
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
          } else setVehicle(null);

          if (wo?.customer_id) {
            const { data: c, error: ce } = await supabase
              .from("customers")
              .select("*")
              .eq("id", wo.customer_id)
              .maybeSingle<Customer>();
            if (ce) throw ce;
            setCustomer(c ?? null);
          } else setCustomer(null);
        }
      } catch (e) {
        const err = e as { message?: string };
        toast.error(err?.message ?? "Failed to load job");
      } finally {
        setBusy(false);
      }
    })();
  }, [isOpen, workOrderLineId, supabase]);

  // ---------- realtime sync for this line ----------
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
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [isOpen, workOrderLineId, supabase]);

  // also listen for local UI refresh events from child buttons
  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("wol:refresh", handler);
    return () => window.removeEventListener("wol:refresh", handler);
  }, []);

  // ---------- allocations ----------
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
      // eslint-disable-next-line no-console
      console.warn(
        "[FocusedJob] load allocations failed",
        (e as { message?: string })?.message
      );
    } finally {
      setAllocsLoading(false);
    }
  }, [supabase, workOrderLineId]);

  // ---------- refresh ----------
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

  // ---------- parts request modal events (close & submitted) ----------
  useEffect(() => {
    const handleClose = () => setOpenParts(false);
    const handleSubmitted = async () => {
      setOpenParts(false);
      await refresh(); // reload any updates after a request is created
    };

    window.addEventListener("parts-request:close", handleClose);
    window.addEventListener("parts-request:submitted", handleSubmitted);
    return () => {
      window.removeEventListener("parts-request:close", handleClose);
      window.removeEventListener("parts-request:submitted", handleSubmitted);
    };
  }, [refresh]);

  // ---------- actions ----------
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
    // approval:* -> update approval_state
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

    // status:* -> update status
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

  // ---------- derived UI ----------
  const startAt = line?.punched_in_at ?? null;
  const finishAt = line?.punched_out_at ?? null;

  const titleText =
    `${line?.line_no ? `#${line.line_no} ` : ""}` +
    (line?.description || line?.complaint || "Focused Job") +
    (line?.job_type ? ` — ${String(line.job_type).replaceAll("_", " ")}` : "");

  const startedText = startAt ? format(new Date(startAt), "PPpp") : "—";
  const finishedText = finishAt ? format(new Date(finishAt), "PPpp") : "—";

  // ---------- render ----------
  return (
    <>
      {isOpen && (
        <VoiceContextSetter
          currentView="focused_job"
          workOrderId={workOrder?.id ?? undefined}
          vehicleId={vehicle?.id ?? undefined}
          customerId={customer?.id ?? undefined}
          lineId={line?.id ?? undefined}
        />
      )}

      <Dialog
        open={isOpen}
        onClose={onClose}
        className="fixed inset-0 z-[100] flex items-center justify-center"
      >
        {/* Dark overlay */}
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
          aria-hidden="true"
        />

        {/* Panel */}
        <div
          className="relative z-[110] mx-4 my-6 w-full max-w-5xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-h-[75vh] overflow-y-auto rounded-lg border border-orange-400 bg-neutral-950 p-5 text-white shadow-xl">
            {/* Title row */}
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="text-lg font-header font-semibold tracking-wide">
                <span className={chip(line?.status ?? null)}>{titleText}</span>
                {workOrder ? (
                  <span className="ml-2 text-sm font-normal text-neutral-400">
                    WO #{workOrder.custom_id || workOrder.id?.slice(0, 8)}
                  </span>
                ) : null}
                {line?.status === "awaiting_approval" && (
                  <span className="ml-2 rounded border border-blue-500 px-2 py-0.5 text-xs text-blue-300">
                    Awaiting approval
                  </span>
                )}
                {line?.status === "declined" && (
                  <span className="ml-2 rounded border border-red-500 px-2 py-0.5 text-xs text-red-300">
                    Declined
                  </span>
                )}
              </div>

              {/* RIGHT actions: Add Job + Close */}
              <div className="flex items-center gap-2">
                {workOrder?.id && (
                  <button
                    type="button"
                    className="rounded bg-orange-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-orange-400"
                    onClick={() => setOpenAddJob(true)}
                    title="Add a job to this work order"
                    disabled={busy}
                  >
                    Add Job
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Body */}
            {busy && !line ? (
              <div className="grid gap-3">
                <div className="h-6 w-40 animate-pulse rounded bg-neutral-800/60" />
                <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
              </div>
            ) : !line ? (
              <div className="text-neutral-400">No job found.</div>
            ) : (
              <div className="space-y-4">
                {/* Meta */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                    <div className="text-xs text-neutral-400">Status</div>
                    <div className={`font-medium ${chip(line.status ?? null)}`}>
                      {String(line.status || "awaiting").replaceAll("_", " ")}
                    </div>
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                    <div className="text-xs text-neutral-400">Start</div>
                    <div className="font-medium">{startedText}</div>
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                    <div className="text-xs text-neutral-400">Finish</div>
                    <div className="font-medium">{finishedText}</div>
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                    <div className="text-xs text-neutral-400">Hold Reason</div>
                    <div className="font-medium">{line.hold_reason ?? "—"}</div>
                  </div>
                </div>

                {/* Vehicle & Customer */}
                <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-neutral-400">Vehicle</div>
                      <div className="truncate">
                        {vehicle
                          ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${
                              vehicle.model ?? ""
                            }`
                              .trim()
                              .replace(/\s+/g, " ") || "—"
                          : "—"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        VIN: {vehicle?.vin ?? "—"} • Plate:{" "}
                        {vehicle?.license_plate ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-400">Customer</div>
                      <div className="truncate">
                        {customer
                          ? [customer.first_name ?? "", customer.last_name ?? ""]
                              .filter(Boolean)
                              .join(" ") || "—"
                          : "—"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {customer?.phone ?? "—"}{" "}
                        {customer?.email ? `• ${customer.email}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Start / Finish row */}
                {mode === "tech" && line && (
                  <div className="grid">
                    <JobPunchButton
                      lineId={line.id}
                      punchedInAt={line.punched_in_at}
                      punchedOutAt={line.punched_out_at}
                      status={line.status as WorkflowStatus}
                      onFinishRequested={() => setOpenComplete(true)}
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

                {/* Controls */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {mode === "tech" ? (
                    <>
                      <button
                        type="button"
                        className={outlinePurple}
                        onClick={() => setOpenComplete(true)}
                        disabled={busy}
                      >
                        Complete (Cause/Correction)
                      </button>

                      <button
                        type="button"
                        className={outlineDanger}
                        onClick={() => setOpenParts(true)}
                        disabled={busy}
                      >
                        Request Parts
                      </button>

                      <button
                        type="button"
                        className={outlineWarn}
                        onClick={() => setOpenHold(true)}
                        disabled={busy}
                      >
                        {line.status === "on_hold" ? "On Hold" : "Hold"}
                      </button>

                      <button
                        type="button"
                        className={outlineInfo}
                        onClick={() => setOpenStatus(true)}
                        disabled={busy}
                      >
                        Change Status
                      </button>

                      <button
                        type="button"
                        className={outlineNeutral}
                        onClick={() => setOpenPhoto(true)}
                        disabled={busy}
                      >
                        Add Photo
                      </button>

                      {/* inspection button removed */}

                      <button
                        type="button"
                        className={outlineInfo}
                        onClick={() => setOpenChat(true)}
                      >
                        Chat
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={outlineInfo}
                        onClick={() => setOpenStatus(true)}
                      >
                        Change Status
                      </button>

                      {/* inspection button removed for view, too */}

                      <button
                        type="button"
                        className={outlineInfo}
                        onClick={() => setOpenChat(true)}
                      >
                        Chat
                      </button>
                    </>
                  )}
                </div>

                {/* Parts used */}
                <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                  <div className="mb-2 text-sm font-header">Parts used</div>

                  {allocsLoading ? (
                    <div className="text-sm text-neutral-400">Loading…</div>
                  ) : allocs.length === 0 ? (
                    <div className="text-sm text-neutral-400">
                      No parts used yet.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded border border-neutral-800">
                      <div className="grid grid-cols-12 bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
                        <div className="col-span-7">Part</div>
                        <div className="col-span-3">Location</div>
                        <div className="col-span-2 text-right">Qty</div>
                      </div>
                      <ul className="max-h-56 overflow-auto divide-y divide-neutral-800">
                        {allocs.map((a) => (
                          <li
                            key={a.id}
                            className="grid grid-cols-12 items-center px-3 py-2 text-sm"
                          >
                            <div className="col-span-7 truncate">
                              {a.parts?.name ?? "Part"}
                            </div>
                            <div className="col-span-3 truncate text-neutral-500">
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

                {/* Tech notes */}
                <div>
                  <label className="mb-1 block text-sm font-header">
                    Tech Notes
                  </label>
                  <textarea
                    rows={4}
                    value={techNotes}
                    onChange={(e) => setTechNotes(e.target.value)}
                    onBlur={saveNotes}
                    disabled={savingNotes}
                    className="w-full rounded border border-orange-500 bg-neutral-900 p-2 text-white placeholder-neutral-400"
                    placeholder="Add notes for this job…"
                  />
                </div>

                {/* AI suggestions */}
                <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
                  <h3 className="mb-2 font-semibold">AI Suggested Repairs</h3>
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
                    <div className="text-sm text-neutral-400">
                      Vehicle/work order details required.
                    </div>
                  )}
                </div>

                <div className="text-xs text-neutral-500">
                  Job ID: {line.id}
                  {typeof line.labor_time === "number"
                    ? ` • Labor: ${line.labor_time.toFixed(1)}h`
                    : ""}
                  {line.hold_reason ? ` • Hold: ${line.hold_reason}` : ""}
                  {line.approval_state
                    ? ` • Approval: ${line.approval_state}`
                    : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* Float the voice mic ABOVE the modal overlay */}
      {isOpen && <VoiceButton />}

      {/* Sub-modals */}
      {openComplete && line && (
        <CauseCorrectionModal
          isOpen={openComplete}
          onClose={() => setOpenComplete(false)}
          jobId={line.id}
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

      {/* Parts request modal */}
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