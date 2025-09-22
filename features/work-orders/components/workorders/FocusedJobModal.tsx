"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ModalShell from "@/features/shared/components/ModalShell";

// existing modals in your codebase
import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import PartsRequestModal from "@work-orders/components/workorders/PartsRequestModal";

// new unified-look modals
import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";
import StatusPickerModal from "@/features/work-orders/components/workorders/extras/StatusPickerModal";
import TimeAdjustModal from "@/features/work-orders/components/workorders/extras/TimeAdjustModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import CostEstimateModal from "@/features/work-orders/components/workorders/extras/CostEstimateModal";
import CustomerContactModal from "@/features/work-orders/components/workorders/extras/CustomerContactModal";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";

export default function FocusedJobModal(props: any) {
  const {
    isOpen,
    onClose,
    workOrderLineId,
    onChanged,
  } = props;

  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [loading, setLoading] = useState(false);
  const [line, setLine] = useState<any>(null);
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [vehicle, setVehicle] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);

  const [techNotes, setTechNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

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
            const { data: v } = await supabase.from("vehicles").select("*").eq("id", wo.vehicle_id).maybeSingle();
            setVehicle(v ?? null);
          } else {
            setVehicle(null);
          }

          if (wo?.customer_id) {
            const { data: c } = await supabase.from("customers").select("*").eq("id", wo.customer_id).maybeSingle();
            setCustomer(c ?? null);
          } else {
            setCustomer(null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, workOrderLineId, supabase]);

  const refreshLine = async () => {
    const { data: l } = await supabase.from("work_order_lines").select("*").eq("id", workOrderLineId).maybeSingle();
    setLine(l ?? null);
    setTechNotes(l?.notes ?? "");
    await onChanged?.();
  };

  const showErr = (prefix: string, err?: any) => {
    const msg = err?.message ?? "Something went wrong.";
    console.error(prefix, err);
    toast.error(`${prefix}: ${msg}`);
  };

  const punchIn = async () => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", workOrderLineId);
    if (error) return showErr("Punch in failed", error);
    toast.success("Punched in");
    await refreshLine();
  };

  const punchOut = async () => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_out_at: new Date().toISOString(), status: "awaiting" })
      .eq("id", workOrderLineId);
    if (error) return showErr("Punch out failed", error);
    toast.success("Punched out");
    await refreshLine();
  };

  const applyHold = async (reason: string, notes?: string) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ hold_reason: reason || "On hold", status: "on_hold", notes: notes ?? line?.notes ?? null })
      .eq("id", workOrderLineId);
    if (error) return showErr("Apply hold failed", error);
    toast.success("Hold applied");
    await refreshLine();
  };

  const releaseHold = async () => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ hold_reason: null, status: "awaiting" })
      .eq("id", workOrderLineId);
    if (error) return showErr("Remove hold failed", error);
    toast.success("Hold removed");
    await refreshLine();
  };

  const changeStatus = async (next: string) => {
    const { error } = await supabase.from("work_order_lines").update({ status: next }).eq("id", workOrderLineId);
    if (error) return showErr("Update status failed", error);
    toast.success("Status updated");
    await refreshLine();
  };

  const updateTime = async (inAt: string | null, outAt: string | null) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: inAt, punched_out_at: outAt })
      .eq("id", workOrderLineId);
    if (error) return showErr("Update time failed", error);
    toast.success("Time updated");
    await refreshLine();
  };

  const uploadPhoto = async (file: File) => {
    if (!workOrder?.id) return;
    const path = `wo/${workOrder.id}/lines/${workOrderLineId}/${uuidv4()}_${file.name}`;
    const { error } = await supabase.storage.from("job-photos").upload(path, file, {
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
    await refreshLine();
  };

  const sendEmail = async (subject: string, body: string) => {
    if (!customer?.email) {
      toast.error("No customer email on file");
      return;
    }
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: customer.email, subject, html: `<p>${body}</p>` }),
    }).catch(() => null);
    toast.success("Email queued");
  };

  const sendSms = async (message: string) => {
    if (!customer?.phone) {
      toast.error("No customer phone on file");
      return;
    }
    await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: customer.phone, message }),
    }).catch(() => null);
    toast.success("SMS queued");
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    const { error } = await supabase.from("work_order_lines").update({ notes: techNotes }).eq("id", workOrderLineId);
    setSavingNotes(false);
    if (error) return showErr("Update notes failed", error);
    toast.success("Notes saved");
    await refreshLine();
  };

  const title =
    (line?.description || line?.complaint || "Focused Job") +
    (line?.job_type ? ` — ${String(line.job_type).replaceAll("_", " ")}` : "");

  const punchedInText = line?.punched_in_at ? format(new Date(line.punched_in_at), "PPpp") : "—";
  const punchedOutText = line?.punched_out_at ? format(new Date(line.punched_out_at), "PPpp") : "—";

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        subtitle={workOrder ? `WO #${workOrder.custom_id || (workOrder.id || "").slice(0, 8)}` : undefined}
        size="lg"
      >
        {loading ? (
          <div className="grid gap-3">
            <div className="h-6 w-40 animate-pulse rounded bg-neutral-800/60" />
            <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
          </div>
        ) : !line ? (
          <div className="text-sm text-red-400">Job not found.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-400">Status</div>
                <div className="font-medium">{String(line.status || "awaiting").replaceAll("_", " ")}</div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-400">Punched In</div>
                <div className="font-medium">{punchedInText}</div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-400">Punched Out</div>
                <div className="font-medium">{punchedOutText}</div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
                <div className="text-xs text-neutral-400">Hold Reason</div>
                <div className="font-medium">{line.hold_reason || "—"}</div>
              </div>
            </div>

            <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
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

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {!line.punched_in_at || line.punched_out_at ? (
                <button className="rounded bg-green-600 px-3 py-2 text-white hover:bg-green-700" onClick={punchIn}>
                  Punch In
                </button>
              ) : (
                <button className="rounded bg-neutral-700 px-3 py-2 text-white hover:bg-neutral-800" onClick={punchOut}>
                  Punch Out
                </button>
              )}

              <button
                className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"
                onClick={() => setOpenComplete(true)}
              >
                Complete (Cause/Correction)
              </button>

              <button
                className="rounded bg-red-600 px-3 py-2 text-white hover:bg-red-700"
                onClick={() => setOpenParts(true)}
              >
                Request Parts
              </button>

              <button
                className="rounded bg-amber-600 px-3 py-2 text-white hover:bg-amber-700"
                onClick={() => setOpenHold(true)}
              >
                {line.status === "on_hold" ? "On Hold" : "Hold"}
              </button>

              <button
                className="rounded bg-purple-600 px-3 py-2 text-white hover:bg-purple-700"
                onClick={() => setOpenStatus(true)}
              >
                Change Status
              </button>

              <button
                className="rounded bg-neutral-700 px-3 py-2 text-white hover:bg-neutral-800"
                onClick={() => setOpenTime(true)}
              >
                Adjust Time
              </button>

              <button
                className="rounded bg-neutral-700 px-3 py-2 text-white hover:bg-neutral-800"
                onClick={() => setOpenAssign(true)}
              >
                Assign Tech
              </button>

              <button
                className="rounded bg-neutral-700 px-3 py-2 text-white hover:bg-neutral-800"
                onClick={() => setOpenPhoto(true)}
              >
                Add Photo
              </button>

              <button
                className="rounded bg-neutral-700 px-3 py-2 text-white hover:bg-neutral-800"
                onClick={() => setOpenCost(true)}
              >
                Cost / Estimate
              </button>

              <button
                className="rounded bg-neutral-700 px-3 py-2 text-white hover:bg-neutral-800"
                onClick={() => setOpenContact(true)}
              >
                Contact Customer
              </button>

              <button
                className="rounded bg-pink-600 px-3 py-2 text-white hover:bg-pink-700"
                onClick={() => setOpenChat(true)}
              >
                New Chat
              </button>
            </div>

            <div>
              <label className="mb-1 block text-sm">Tech Notes</label>
              <textarea
                rows={4}
                value={techNotes}
                onChange={(e) => setTechNotes(e.target.value)}
                onBlur={saveNotes}
                disabled={savingNotes}
                className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-white placeholder-neutral-400"
                placeholder="Add notes for this job…"
              />
            </div>

            <div className="text-xs text-neutral-500">
              Job ID: {line.id}
              {typeof line.labor_time === "number" ? ` • Labor: ${line.labor_time.toFixed(1)}h` : ""}
              {line.hold_reason ? ` • Hold: ${line.hold_reason}` : ""}
            </div>
          </div>
        )}
      </ModalShell>

      {openComplete && line && (
        <CauseCorrectionModal
          isOpen={openComplete}
          onClose={() => setOpenComplete(false)}
          jobId={line.id}
          // IMPORTANT: matches your modal's (jobId, cause, correction) signature
          onSubmit={async (jobId: string, cause: string, correction: string) => {
            const { error } = await supabase
              .from("work_order_lines")
              .update({
                cause,
                correction,
                punched_out_at: new Date().toISOString(),
                status: "completed",
              })
              .eq("id", jobId);
            if (error) return showErr("Complete job failed", error);
            toast.success("Job completed");
            setOpenComplete(false);
            await refreshLine();
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
          onAssigned={refreshLine}
        />
      )}

      {openStatus && line && (
        <StatusPickerModal
          isOpen={openStatus}
          onClose={() => setOpenStatus(false)}
          current={line.status || "awaiting"}
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
          onCreated={() => setOpenChat(false)}
          created_by={line?.assigned_to || "system"}
          context_type="work_order_line"
          context_id={line?.id || null}
        />
      )}
    </>
  );
}