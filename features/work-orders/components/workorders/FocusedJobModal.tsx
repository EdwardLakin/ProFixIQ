"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { Dialog } from "@headlessui/react";
import { format } from "date-fns";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

//import DtcSuggestionModal from "@/features/work-orders/components/workorders/DtcSuggestionPopup";

// existing modals
import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import PartsRequestModal from "@/features/work-orders/components/workorders/PartsRequestModal";

// extras
import HoldModal from "@/features/work-orders/components/workorders/HoldModal";
import PhotoCaptureModal from "@/features/work-orders/components/workorders/extras/PhotoCaptureModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";

// 🔸 AI assistant modal
import AIAssistantModal from "@work-orders/components/workorders/AiAssistantModal";

// chat
import NewChatModal from "@/features/ai/components/chat/NewChatModal";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";

// punch
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
  btnBase +
  " border-white/15 bg-black/40 text-neutral-100 hover:bg-white/5";
const btnWarn =
  btnBase +
  " border-amber-400/80 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20";
const btnDanger =
  btnBase +
  " border-red-500/80 bg-red-500/10 text-red-100 hover:bg-red-500/20";
const btnInfo =
  btnBase +
  " border-sky-500/80 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20";
const btnAccent =
  btnBase +
  " border-[var(--accent-copper-light)] bg-[var(--accent-copper-faint)] text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-soft)]";

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
  const [openPhoto, setOpenPhoto] = useState(false);
  const [openChat, setOpenChat] = useState(false);
  const [openAddJob, setOpenAddJob] = useState(false);
  const [openAi, setOpenAi] = useState(false);
  const [_openDtc, setOpenDtc] = useState(false);

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
    setOpenPhoto(false);
    setOpenChat(false);
    setOpenAddJob(false);
    setOpenAi(false);
    //setOpenDtc(false); // 🔹 ensure DTC modal also closes
  };

  useEffect(() => {
    if (!isOpen) {
      closeAllSubModals();
    }
  }, [isOpen]);

  // initial load
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
  }, [isOpen, workOrderLineId, supabase]);

  // realtime line
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
      void supabase.removeChannel(ch);
    };
  }, [isOpen, workOrderLineId, supabase]);

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
      console.warn("[FocusedJob] load allocations failed", e);
    } finally {
      setAllocsLoading(false);
    }
  }, [supabase, workOrderLineId]);

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
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        //
      }
    };
  }, [isOpen, workOrderLineId, supabase, loadAllocations]);

  const refresh = useCallback(
    async () => {
      const { data: l } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("id", workOrderLineId)
        .maybeSingle<WorkOrderLine>();
      setLine(l ?? null);
      setTechNotes(l?.notes ?? "");
      await onChanged?.();
      await loadAllocations();
    },
    [supabase, workOrderLineId, onChanged, loadAllocations],
  );

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
    if (!line) return;

    setBusy(true);
    try {
      const update: DB["public"]["Tables"]["work_order_lines"]["Update"] = {
        hold_reason: reason || "On hold",
        status: "on_hold",
        // keep any existing notes unless overridden
        notes: notes ?? line.notes ?? null,
      };

      // 🔹 If the job is actively running, "punch off" when putting it on hold
      if (line.punched_in_at && !line.punched_out_at) {
        update.punched_out_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("work_order_lines")
        .update(update)
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
      <Dialog
        open={isOpen}
        onClose={() => {
          closeAllSubModals();
          onClose();
        }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
      >
        {/* backdrop */}
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
          aria-hidden="true"
        />

        {/* panel wrapper */}
        <div
          className="relative z-[110] mx-4 my-6 w-full max-w-5xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 🔹 Outer panel: only scroll when AI is *not* open */}
          <div
            className={`rounded-lg border border-white/15 bg-neutral-950/95 p-5 text-foreground shadow-xl ${
              openAi ? "" : "max-h-[75vh] overflow-y-auto"
            }`}
          >
            {/* header */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="text-lg font-semibold tracking-tight">
                <span className={chip(line?.status ?? null)}>{titleText}</span>
                {workOrder ? (
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    WO #{workOrder.custom_id || workOrder.id?.slice(0, 8)}
                  </span>
                ) : null}
                {line?.status === "awaiting_approval" && (
                  <span className="ml-2 rounded border border-blue-500/80 px-2 py-0.5 text-[0.65rem] text-blue-100">
                    Awaiting approval
                  </span>
                )}
                {line?.status === "declined" && (
                  <span className="ml-2 rounded border border-red-500/80 px-2 py-0.5 text-[0.65rem] text-red-100">
                    Declined
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {workOrder?.id && (
                  <button
                    type="button"
                    className="rounded-md border border-[var(--accent-copper-light)] bg-[var(--accent-copper-soft)] px-3 py-1.5 text-xs font-semibold text-black shadow-[0_0_12px_rgba(248,113,22,0.35)] hover:bg-[var(--accent-copper-light)]"
                    onClick={() => {
                      closeAllSubModals();
                      setOpenAddJob(true);
                    }}
                    disabled={busy}
                  >
                    + Job
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    closeAllSubModals();
                    onClose();
                  }}
                  className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* body */}
            {busy && !line ? (
              <div className="grid gap-3">
                <div className="h-6 w-40 animate-pulse rounded-full bg-white/5" />
                <div className="h-24 animate-pulse rounded-2xl bg-white/5" />
              </div>
            ) : !line ? (
              <div className="text-sm text-neutral-300">No job found.</div>
            ) : (
              <div className="space-y-4">
                {/* meta info */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                      Status
                    </div>
                    <div
                      className={`mt-1 text-sm font-semibold ${chip(
                        line.status ?? null,
                      )}`}
                    >
                      {String(line.status || "awaiting").replaceAll("_", " ")}
                    </div>
                  </div>
                  <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                      Start
                    </div>
                    <div className="mt-1 text-sm text-neutral-100">
                      {createdStart}
                    </div>
                  </div>
                  <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                      Finish
                    </div>
                    <div className="mt-1 text-sm text-neutral-100">
                      {createdFinish}
                    </div>
                  </div>
                  <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                      Hold Reason
                    </div>
                    <div className="mt-1 text-sm text-neutral-100">
                      {line.hold_reason ?? "—"}
                    </div>
                  </div>
                </div>

                {/* vehicle & customer */}
                <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3 text-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                        Vehicle
                      </div>
                      <div className="mt-1 truncate text-neutral-100">
                        {vehicle
                          ? `${vehicle.year ?? ""} ${
                              vehicle.make ?? ""
                            } ${vehicle.model ?? ""}`
                              .trim()
                              .replace(/\s+/g, " ") || "—"
                          : "—"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-400">
                        VIN: {vehicle?.vin ?? "—"} • Plate:{" "}
                        {vehicle?.license_plate ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                        Customer
                      </div>
                      <div className="mt-1 truncate text-neutral-100">
                        {customer
                          ? [customer.first_name ?? "", customer.last_name ?? ""]
                              .filter(Boolean)
                              .join(" ") || "—"
                          : "—"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-neutral-400">
                        {customer?.phone ?? "—"}{" "}
                        {customer?.email ? `• ${customer.email}` : ""}
                      </div>
                    </div>
                  </div>
                </div>

                {/* punch – hidden once job is completed, same as mobile */}
                {mode === "tech" && line && line.status !== "completed" && (
                  <div className="glass-card relative z-[5] rounded-2xl border border-white/10 bg-black/40 p-3">
der                     <JobPunchButton
                      // ✅ Fix: JobPunchButton expects the work orline id param.
                      // Keep lineId too for any older internal usage.
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
                      <div className="mt-2 text-[11px] text-amber-300">
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
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

                      {/* 🔹 DTC Assist button lives with the other controls */}
                      {/*
                      <button
                        type="button"
                        className={btnInfo}
                        onClick={() => {
                          closeAllSubModals();
                          setOpenDtc(true);
                        }}
                        disabled={busy}
                      >
                        DTC Assist (AI)
                      </button>
                      */}
                    </>
                  ) : (
                    <>
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
                        DTC Assist (AI)
                      </button>
                    </>
                  )}
                </div>

                {/* parts used */}
                <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3">
                  <div className="mb-2 text-sm font-medium text-neutral-100">
                    Parts used
                  </div>

                  {allocsLoading ? (
                    <div className="text-sm text-neutral-300">Loading…</div>
                  ) : allocs.length === 0 ? (
                    <div className="text-sm text-neutral-300">
                      No parts used yet.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                      <div className="grid grid-cols-12 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
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
                            <div className="col-span-7 truncate text-neutral-100">
                              {a.parts?.name ?? "Part"}
                            </div>
                            <div className="col-span-3 truncate text-neutral-400">
                              {a.location_id
                                ? `loc ${String(a.location_id).slice(0, 6)}…`
                                : "—"}
                            </div>
                            <div className="col-span-2 text-right font-semibold text-neutral-100">
                              {a.qty}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* tech notes */}
                <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3">
                  <label className="mb-1 block text-sm font-medium text-neutral-100">
                    Tech Notes
                  </label>
                  <textarea
                    rows={4}
                    value={techNotes}
                    onChange={(e) => setTechNotes(e.target.value)}
                    onBlur={saveNotes}
                    disabled={savingNotes}
                    className="w-full rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-400 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-copper-light)]"
                    placeholder="Add notes for this job…"
                  />
                </div>

                {/* AI suggestions */}
                <div className="glass-card rounded-2xl border border-white/10 bg-black/40 p-3">
                  <h3 className="mb-2 text-sm font-medium text-neutral-100">
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
                    <div className="text-sm text-neutral-300">
                      Vehicle/work order details required.
                    </div>
                  )}
                </div>

                <div className="text-xs text-neutral-400">
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

      {/* sub-modals */}
      {openComplete && line && (
        <CauseCorrectionModal
          isOpen={openComplete}
          onClose={() => setOpenComplete(false)}
          jobId={line.id}
          initialCause={prefillCause}
          initialCorrection={prefillCorrection}
          // ✅ COMPLETE job – sets status + punched_out_at
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
          // ✅ SAVE STORY ONLY – no status change, no finish
          onSaveDraft={async (cause: string, correction: string) => {
            const { error } = await supabase
              .from("work_order_lines")
              .update({
                cause,
                correction,
              } as DB["public"]["Tables"]["work_order_lines"]["Update"])
              .eq("id", line.id);

            if (error) return showErr("Save story failed", error);
            toast.success("Story saved");
            await refresh();
            // modal stays open so tech can keep editing or complete later
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

      {/* DTC Suggest modal disabled for now
      {openDtc && line && (
        <DtcSuggestionModal
          isOpen={openDtc}
          onClose={() => setOpenDtc(false)}
          jobId={line.id}
          vehicle={
            vehicle
              ? {
                  year: vehicle.year ? String(vehicle.year) : "",
                  make: vehicle.make ?? "",
                  model: vehicle.model ?? "",
                }
              : {
                  year: "",
                  make: "",
                  model: "",
                }
          }
        />
      )}
        */}

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