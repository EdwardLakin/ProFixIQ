"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import { format, formatDistanceStrict } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
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

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [loading, setLoading] = useState(false);
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
  const [openChat, setOpenChat] = useState(false); // NEW

  useEffect(() => {
    if (!isOpen || !workOrderLineId) return;
    (async () => {
      setLoading(true);
      try {
        const { data: l } = await supabase
          .from("work_order_lines")
          .select("*")
          .eq("id", workOrderLineId)
          .maybeSingle();
        setLine(l ?? null);
        setTechNotes(l?.notes ?? "");

        if (l?.work_order_id) {
          const { data: wo } = await supabase
            .from("work_orders")
            .select("*")
            .eq("id", l.work_order_id)
            .maybeSingle();
          setWorkOrder(wo ?? null);

          if (wo?.vehicle_id) {
            const { data: v } = await supabase
              .from("vehicles")
              .select("*")
              .eq("id", wo.vehicle_id)
              .maybeSingle();
            setVehicle(v ?? null);
          } else setVehicle(null);

          if (wo?.customer_id) {
            const { data: c } = await supabase
              .from("customers")
              .select("*")
              .eq("id", wo.customer_id)
              .maybeSingle();
            setCustomer(c ?? null);
          } else setCustomer(null);
        }
      } finally {
        setLoading(false);
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
    if (!workOrderLineId) return;
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", workOrderLineId);
    if (error) return showErr("Start failed", error);
    toast.success("Started");
    await refresh();
  };

  // Finish → open Cause/Correction modal to capture details before completing
  const finishJob = async () => setOpenComplete(true);

  const applyHold = async (reason: string, notes?: string) => {
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
  };
  const releaseHold = async () => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ hold_reason: null, status: "awaiting" })
      .eq("id", workOrderLineId);
    if (error) return showErr("Remove hold failed", error);
    toast.success("Hold removed");
    await refresh();
  };

  const changeStatus = async (next: string) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ status: next })
      .eq("id", workOrderLineId);
    if (error) return showErr("Update status failed", error);
    toast.success("Status updated");
    await refresh();
  };

  const updateTime = async (inAt: string | null, outAt: string | null) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: inAt, punched_out_at: outAt })
      .eq("id", workOrderLineId);
    if (error) return showErr("Update time failed", error);
    toast.success("Time updated");
    await refresh();
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
    const { error } = await supabase
      .from("work_order_lines")
      .update({ labor_time: laborHours, price_estimate: price })
      .eq("id", workOrderLineId);
    if (error) return showErr("Save cost failed", error);
    toast.success("Estimate updated");
    await refresh();
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

  // REPLACED: async version that ensures/links a session then opens the modal
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
      sp.set("sessionId", sessionId);
      sp.set("template", template);

      const path = `/inspections/${template}`;
      window.dispatchEvent(
        new CustomEvent("inspection:open", {
          detail: { path, params: sp.toString() },
        })
      );

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
        className="fixed inset-0 z-[60] flex items-center justify-center"
      >
        {/* Dark overlay */}
        <div className="fixed inset-0 bg-black/70" aria-hidden="true" />

        {/* Panel */}
        <div className="relative z-[61] mx-4 my-6 w-full max-w-5xl">
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

              <button
                onClick={onClose}
                className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            {loading || !line ? (
              <div className="grid gap-3">
                <div className="h-6 w-40 animate-pulse rounded bg-neutral-800/60" />
                <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Meta (dark blocks) */}
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

                {/* Vehicle & Customer (dark) */}
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
                          ? [customer.first_name ?? "", customer.last_name ?? ""]
                              .filter(Boolean)
                              .join(" ") || "—"
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
                        <button className={outlineSuccess} onClick={startJob}>Start</button>
                      ) : (
                        <button className={outlineFinish} onClick={finishJob}>Finish</button>
                      )}

                      <button className={outlinePurple} onClick={() => setOpenComplete(true)}>
                        Complete (Cause/Correction)
                      </button>

                      <button className={outlineDanger} onClick={() => setOpenParts(true)}>
                        Request Parts
                      </button>

                      <button className={outlineWarn} onClick={() => setOpenHold(true)}>
                        {line.status === "on_hold" ? "On Hold" : "Hold"}
                      </button>

                      <button className={outlineInfo} onClick={() => setOpenStatus(true)}>
                        Change Status
                      </button>

                      <button className={outlineNeutral} onClick={() => setOpenTime(true)}>
                        Adjust Time
                      </button>

                      <button className={outlineNeutral} onClick={() => setOpenAssign(true)}>
                        Assign Tech
                      </button>

                      <button className={outlineNeutral} onClick={() => setOpenPhoto(true)}>
                        Add Photo
                      </button>

                      <button className={outlineNeutral} onClick={() => setOpenCost(true)}>
                        Cost / Estimate
                      </button>

                      <button className={outlineNeutral} onClick={() => setOpenContact(true)}>
                        Contact Customer
                      </button>

                      <button
                        className={`${outlineInfo} ${line?.job_type === "inspection" ? "" : "opacity-50 cursor-not-allowed"}`}
                        onClick={line?.job_type === "inspection" ? openInspection : undefined}
                        title={line?.job_type === "inspection" ? "Open inspection" : "Not an inspection line"}
                      >
                        Open Inspection
                      </button>

                      <button className={outlineInfo} onClick={() => setOpenChat(true)}>
                        Chat
                      </button>
                    </>
                  ) : (
                    <>
                      <button className={outlineNeutral} onClick={() => setOpenCost(true)}>
                        Cost / Estimate
                      </button>
                      <button className={outlineNeutral} onClick={() => setOpenContact(true)}>
                        Contact Customer
                      </button>
                      <button className={outlineInfo} onClick={() => setOpenStatus(true)}>
                        Change Status
                      </button>
                      <button
                        className={`${outlineInfo} ${line?.job_type === "inspection" ? "" : "opacity-50 cursor-not-allowed"}`}
                        onClick={line?.job_type === "inspection" ? openInspection : undefined}
                      >
                        Open Inspection
                      </button>
                      <button className={outlineInfo} onClick={() => setOpenChat(true)}>
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

      {/* Sub-modals (unchanged) */}
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
    </>
  );
}