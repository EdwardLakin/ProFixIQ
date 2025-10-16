"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import { format, formatDistanceStrict } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

// existing modals
import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import PartsRequestModal from "@work-orders/components/workorders/PartsRequestModal";

// extras
import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";
import StatusPickerModal from "@/features/work-orders/components/workorders/extras/StatusPickerModal";
import TimeAdjustModal from "@/features/work-orders/components/workorders/extras/TimeAdjustModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import CostEstimateModal from "@/features/work-orders/components/workorders/extras/CostEstimateModal";
import CustomerContactModal from "@/features/work-orders/components/workorders/extras/CustomerContactModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";

// voice control
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";

// NEW: chat in the focused modal
import NewChatModal from "@/features/ai/components/chat/NewChatModal";

// NEW: AI suggestions (moved into Focused modal)
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";

type Mode = "tech" | "view";

const statusTextColor: Record<string, string> = {
  in_progress: "text-orange-300",
  awaiting: "text-slate-200",
  queued: "text-indigo-300",
  on_hold: "text-amber-300",
  completed: "text-green-300",
  awaiting_approval: "text-blue-300",
  planned: "text-purple-300",
  new: "text-neutral-200",
};
const chip = (s: string | null) =>
  statusTextColor[(s ?? "awaiting").toLowerCase().replaceAll(" ", "_")] ??
  "text-neutral-200";

const outlineBtn = "font-header rounded border px-3 py-2 text-sm transition-colors";
const outlineNeutral = `${outlineBtn} border-neutral-700 text-neutral-200 hover:bg-neutral-800`;
const outlineSuccess = `${outlineBtn} border-green-600 text-green-300 hover:bg-green-900/20`;
const outlineFinish = `${outlineBtn} border-neutral-600 text-neutral-200 hover:bg-neutral-800`;
const outlineWarn = `${outlineBtn} border-amber-600 text-amber-300 hover:bg-amber-900/20`;
const outlineDanger = `${outlineBtn} border-red-600 text-red-300 hover:bg-red-900/20`;
const outlineInfo = `${outlineBtn} border-blue-600 text-blue-300 hover:bg-blue-900/20`;
const outlinePurple = `${outlineBtn} border-purple-600 text-purple-300 hover:bg-purple-900/20`;

export default function FocusedJobModal(props: any) {
  const {
    isOpen,
    onClose,
    workOrderLineId,
    onChanged,
    mode = "tech",
  } = props as {
    isOpen: boolean;
    onClose: () => void;
    workOrderLineId: string;
    onChanged?: () => void | Promise<void>;
    mode?: Mode;
  };

  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<any>(null);
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [duration, setDuration] = useState("");

  const [techNotes, setTechNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // sub-modals
  const [openComplete, setOpenComplete] = useState(false);
  const [openParts, setOpenParts] = useState(false);
  const [openHold, setOpenHold] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);
  const [openTime, setOpenTime] = useState(false);
  const [openPhoto, setOpenPhoto] = useState(false);
  const [openCost, setOpenCost] = useState(false);
  const [openContact, setOpenContact] = useState(false);
  const [openChat, setOpenChat] = useState(false);
  const [openAddJob, setOpenAddJob] = useState(false);

  // NEW: tiny visual confirm badge after successful Start
  const [showStartedBadge, setShowStartedBadge] = useState(false);

  useEffect(() => {
    if (!isOpen || !workOrderLineId) return;
    (async () => {
      setBusy(true);
      try {
        const { data: l, error: le } = await supabase
          .from("work_order_lines")
          .select("*")
          .eq("id", workOrderLineId)
          .maybeSingle();
        if (le) throw le;
        setLine(l ?? null);
        setTechNotes(l?.notes ?? "");

        if (l?.work_order_id) {
          const { data: wo, error: we } = await supabase
            .from("work_orders")
            .select("*")
            .eq("id", l.work_order_id)
            .maybeSingle();
          if (we) throw we;
          setWorkOrder(wo ?? null);

          if (wo?.vehicle_id) {
            const { data: v, error: ve } = await supabase
              .from("vehicles")
              .select("*")
              .eq("id", wo.vehicle_id)
              .maybeSingle();
            if (ve) throw ve;
            setVehicle(v ?? null);
          } else setVehicle(null);

          if (wo?.customer_id) {
            const { data: c, error: ce } = await supabase
              .from("customers")
              .select("*")
              .eq("id", wo.customer_id)
              .maybeSingle();
            if (ce) throw ce;
            setCustomer(c ?? null);
          } else setCustomer(null);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load job");
      } finally {
        setBusy(false);
      }
    })();
  }, [isOpen, workOrderLineId, supabase]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => {
      if (line?.punched_in_at && !line?.punched_out_at) {
        setDuration(formatDistanceStrict(new Date(), new Date(line.punched_in_at)));
      } else {
        setDuration("");
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [isOpen, line?.punched_in_at, line?.punched_out_at]);

  const startAt = line?.punched_in_at ?? null;
  const finishAt = line?.punched_out_at ?? null;

  const msToTenthHours = (ms: number) =>
    (Math.max(0, Math.round(ms / 360000)) / 10).toFixed(1) + " hr";
  const renderLiveTenthHours = () => {
    if (startAt && !finishAt)
      return msToTenthHours(Date.now() - new Date(startAt).getTime());
    if (startAt && finishAt)
      return msToTenthHours(
        new Date(finishAt).getTime() - new Date(startAt).getTime()
      );
    return "0.0 hr";
  };

  const refresh = async () => {
    const { data: l } = await supabase
      .from("work_order_lines")
      .select("*")
      .eq("id", workOrderLineId)
      .maybeSingle();
    setLine(l ?? null);
    setTechNotes(l?.notes ?? "");
    await onChanged?.();
  };

  const showErr = (prefix: string, err?: { message?: string } | null) => {
    toast.error(`${prefix}: ${err?.message ?? "Something went wrong."}`);
    console.error(prefix, err);
  };

  // Actions
  const startJob = async () => {
    if (!workOrderLineId || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ punched_in_at: new Date().toISOString(), status: "in_progress" })
        .eq("id", workOrderLineId);
      if (error) return showErr("Start failed", error);
      toast.success("Started");
      // show quick visual badge inside the modal
      setShowStartedBadge(true);
      window.setTimeout(() => setShowStartedBadge(false), 1200);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  // Finish → open Cause/Correction modal to capture details before completing
  const finishJob = async () => setOpenComplete(true);

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
        })
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
        .update({ hold_reason: null, status: "awaiting" })
        .eq("id", workOrderLineId);
      if (error) return showErr("Remove hold failed", error);
      toast.success("Hold removed");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (next: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ status: next })
        .eq("id", workOrderLineId);
      if (error) return showErr("Update status failed", error);
      toast.success("Status updated");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const updateTime = async (inAt: string | null, outAt: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ punched_in_at: inAt, punched_out_at: outAt })
        .eq("id", workOrderLineId);
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

  const applyCost = async (laborHours: number | null, price: number | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("work_order_lines")
        .update({ labor_time: laborHours, price_estimate: price })
        .eq("id", workOrderLineId);
      if (error) return showErr("Save cost failed", error);
      toast.success("Estimate updated");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async (subject: string, body: string) => {
    if (!customer?.email) return toast.error("No customer email on file");
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: customer.email,
        subject,
        html: `<p>${body}</p>`,
      }),
    }).catch(() => null);
    toast.success("Email queued");
  };

  const sendSms = async (message: string) => {
    if (!customer?.phone) return toast.error("No customer phone on file");
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: customer.phone, message }),
    }).catch(() => null);
    toast.success("SMS queued");
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase
      .from("work_order_lines")
      .update({ notes: techNotes })
      .eq("id", workOrderLineId);
    setSavingNotes(false);
    if (error) return showErr("Update notes failed", error);
    toast.success("Notes saved");
    await refresh();
  };

  const titleText =
    (line?.description || line?.complaint || "Focused Job") +
    (line?.job_type ? ` — ${String(line.job_type).replaceAll("_", " ")}` : "");

  const startedText = startAt ? format(new Date(startAt), "PPpp") : "—";
  const finishedText = finishAt ? format(new Date(finishAt), "PPpp") : "—";

  // Rewritten to use router.push (reliable navigation)
  const openInspection = async () => {
    if (!line) return;

    const isAir = String(line.description ?? "").toLowerCase().includes("air");
    const template: "maintenance50" | "maintenance50-air" = isAir ? "maintenance50-air" : "maintenance50";

    try {
      const res = await fetch("/api/inspections/session/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: workOrder?.id,
          workOrderLineId: line.id,
          vehicleId: vehicle?.id ?? null,
          customerId: customer?.id ?? null,
          template,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to create inspection session");

      const sessionId: string = j.sessionId;

      const sp = new URLSearchParams();
      if (workOrder?.id) sp.set("workOrderId", workOrder.id);
      sp.set("workOrderLineId", line.id);
      sp.set("inspectionId", sessionId); // match pages that expect inspectionId
      sp.set("template", template);

      router.push(`/inspections/${template}?${sp.toString()}`);
      toast.success("Inspection opened");
    } catch (e: any) {
      toast.error(e?.message ?? "Unable to open inspection");
    }
  };

  return (
    <>
      {isOpen && (
        <VoiceContextSetter
          currentView="focused_job"
          workOrderId={workOrder?.id}
          vehicleId={vehicle?.id}
          customerId={customer?.id}
          lineId={line?.id}
        />
      )}

      <Dialog
        open={isOpen}
        onClose={onClose}
        className="fixed inset-0 z-[100] flex items-center justify-center"
      >
        {/* Dark overlay (captures clicks) */}
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

        {/* Panel */}
        <div
          className="relative z-[110] mx-4 my-6 w-full max-w-5xl"
          onClick={(e) => e.stopPropagation()} // prevent bubbling to overlay
        >
          {/* ✅ Visual confirm badge for Start */}
          {showStartedBadge && (
            <div className="pointer-events-none absolute right-6 top-4 z-[120]">
              <div className="rounded-md border border-green-500 bg-green-900/30 px-3 py-1.5 text-sm font-medium text-green-300 shadow-lg backdrop-blur">
                ✓ Started
              </div>
            </div>
          )}

          <div className="max-h-[85vh] overflow-y-auto rounded-lg border border-orange-400 bg-neutral-950 p-5 text-white shadow-xl">
            {/* Title row */}
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="text-lg font-header font-semibold tracking-wide">
                <span className={chip(line?.status)}>{titleText}</span>
                {workOrder ? (
                  <span className="ml-2 text-sm font-normal text-neutral-400">
                    WO #{workOrder.custom_id || workOrder.id?.slice(0, 8)}
                  </span>
                ) : null}
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
                    <div className={`font-medium ${chip(line.status)}`}>
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
                          ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || "—"
                          : "—"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        VIN: {vehicle?.vin ?? "—"} • Plate: {vehicle?.license_plate ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-400">Customer</div>
                      <div className="truncate">
                        {customer
                          ? [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") || "—"
                          : "—"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {customer?.phone ?? "—"} {customer?.email ? `• ${customer.email}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {mode === "tech" ? (
                    <>
                      {!startAt || finishAt ? (
                        <button type="button" className={outlineSuccess} onClick={startJob} disabled={busy}>
                          Start
                        </button>
                      ) : (
                        <button type="button" className={outlineFinish} onClick={finishJob} disabled={busy}>
                          Finish
                        </button>
                      )}

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
                        onClick={() => setOpenTime(true)}
                        disabled={busy}
                      >
                        Adjust Time
                      </button>

                      <button
                        type="button"
                        className={outlineNeutral}
                        onClick={() => setOpenAssign(true)}
                        disabled={busy}
                      >
                        Assign Tech
                      </button>

                      <button
                        type="button"
                        className={outlineNeutral}
                        onClick={() => setOpenPhoto(true)}
                        disabled={busy}
                      >
                        Add Photo
                      </button>

                      <button
                        type="button"
                        className={outlineNeutral}
                        onClick={() => setOpenCost(true)}
                        disabled={busy}
                      >
                        Cost / Estimate
                      </button>

                      <button
                        type="button"
                        className={`${outlineInfo} ${line?.job_type === "inspection" ? "" : "opacity-50 cursor-not-allowed"}`}
                        onClick={line?.job_type === "inspection" ? openInspection : undefined}
                        title={line?.job_type === "inspection" ? "Open inspection" : "Not an inspection line"}
                        disabled={busy || line?.job_type !== "inspection"}
                      >
                        Open Inspection
                      </button>

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
                      <button type="button" className={outlineNeutral} onClick={() => setOpenCost(true)}>
                        Cost / Estimate
                      </button>
                      <button type="button" className={outlineNeutral} onClick={() => setOpenContact(true)}>
                        Contact Customer
                      </button>
                      <button type="button" className={outlineInfo} onClick={() => setOpenStatus(true)}>
                        Change Status
                      </button>
                      <button
                        type="button"
                        className={`${outlineInfo} ${line?.job_type === "inspection" ? "" : "opacity-50 cursor-not-allowed"}`}
                        onClick={line?.job_type === "inspection" ? openInspection : undefined}
                        disabled={line?.job_type !== "inspection"}
                      >
                        Open Inspection
                      </button>
                      <button type="button" className={outlineInfo} onClick={() => setOpenChat(true)}>
                        Chat
                      </button>
                    </>
                  )}
                </div>

                {/* Live timer (dark) */}
                <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                  <div className="text-xs text-neutral-400">Live Timer</div>
                  <div className="font-medium">{duration || renderLiveTenthHours()}</div>
                </div>

                {/* Tech notes */}
                <div>
                  <label className="mb-1 block text-sm font-header">Tech Notes</label>
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

                {/* AI suggestions (dark) */}
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
                    <div className="text-sm text-neutral-400">Vehicle/work order details required.</div>
                  )}
                </div>

                <div className="text-xs text-neutral-500">
                  Job ID: {line.id}
                  {typeof line.labor_time === "number" ? ` • Labor: ${line.labor_time.toFixed(1)}h` : ""}
                  {line.hold_reason ? ` • Hold: ${line.hold_reason}` : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* Float the voice mic ABOVE the modal overlay */}
      {isOpen && <VoiceButton />}

      {/* Sub-modals (unchanged logic) */}
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
              })
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
          onClose={() => setOpenParts(false)}
          jobId={line.id}
          workOrderId={workOrder.id}
          requested_by={line.assigned_to || "system"}
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

      {openAssign && line && (
        <AssignTechModal
          isOpen={openAssign}
          onClose={() => setOpenAssign(false)}
          workOrderLineId={line.id}
          onAssigned={refresh}
        />
      )}

      {openStatus && line && (
        <StatusPickerModal
          isOpen={openStatus}
          onClose={() => setOpenStatus(false)}
          current={(line.status || "awaiting") as any}
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

      {openCost && line && (
        <CostEstimateModal
          isOpen={openCost}
          onClose={() => setOpenCost(false)}
          defaultLaborHours={typeof line.labor_time === "number" ? line.labor_time : null}
          defaultPrice={typeof line.price_estimate === "number" ? line.price_estimate : null}
          onApply={applyCost}
        />
      )}

      {openContact && (
        <CustomerContactModal
          isOpen={openContact}
          onClose={() => setOpenContact(false)}
          customerName={
            customer ? [customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") : ""
          }
          customerEmail={customer?.email ?? ""}
          customerPhone={customer?.phone ?? ""}
          onSendEmail={sendEmail}
          onSendSms={sendSms}
        />
      )}

      {openChat && (
        <NewChatModal
          isOpen={openChat}
          onClose={() => setOpenChat(false)}
          created_by={workOrder?.created_by ?? "system"}
          onCreated={() => setOpenChat(false)}
          context_type="work_order_line"
          context_id={line?.id ?? null}
        />
      )}

      {/* Add Job modal */}
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