"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format, formatDistanceStrict } from "date-fns";
import { toast } from "sonner";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";

// kept tech features
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import DtcSuggestionPopup from "@work-orders/components/workorders/DtcSuggestionPopup";
import PartsRequestModal from "@work-orders/components/workorders/PartsRequestModal";
import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import InspectionModal from "@/features/inspections/components/InspectionModal";

// NEW (per request): AI quick add on tech page
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";

// local helpers/hooks
import { useTabState } from "@/features/shared/hooks/useTabState";

/* --------------------------------- Types --------------------------------- */
type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type WorkOrderWithMaybeNotes = WorkOrder & { notes?: string | null };

type WOStatus =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed";
type JobType =
  | "diagnosis"
  | "diagnosis-followup"
  | "maintenance"
  | "repair"
  | "tech-suggested"
  | "inspection"
  | string;

type ParamsShape = Record<string, string | string[]>;
function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}
const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;

/* ---------------------------- Status -> Styles ---------------------------- */
const statusBadge: Record<string, string> = {
  awaiting_approval: "bg-blue-100 text-blue-800",
  awaiting: "bg-slate-200 text-slate-800",
  queued: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-orange-100 text-orange-800",
  on_hold: "bg-amber-100 text-amber-800",
  planned: "bg-purple-100 text-purple-800",
  new: "bg-gray-200 text-gray-800",
  completed: "bg-green-100 text-green-800",
};
const statusBorder: Record<string, string> = {
  awaiting: "border-l-4 border-slate-400",
  queued: "border-l-4 border-indigo-400",
  in_progress: "border-l-4 border-orange-500",
  on_hold: "border-l-4 border-amber-500",
  completed: "border-l-4 border-green-500",
  awaiting_approval: "border-l-4 border-blue-500",
  planned: "border-l-4 border-purple-500",
  new: "border-l-4 border-gray-400",
};
const statusRowTint: Record<string, string> = {
  awaiting: "bg-neutral-950",
  queued: "bg-neutral-950",
  in_progress: "bg-neutral-950",
  on_hold: "bg-amber-900/30",
  completed: "bg-green-900/30",
  awaiting_approval: "bg-neutral-950",
  planned: "bg-neutral-950",
  new: "bg-neutral-950",
};

/* ------------------------------ Small helpers ----------------------------- */
function showErr(prefix: string, err?: { message?: string } | null) {
  const msg = err?.message ?? "Something went wrong.";
  console.error(prefix, err);
  toast.error(`${prefix}: ${msg}`);
}
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
function msToTenthHours(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 360000));
  const hours = (tenths / 10).toFixed(1);
  return `${hours} hr`;
}

/* ---------------------------------- Page --------------------------------- */
export default function WorkOrderTechPage(): JSX.Element {
  const params = useParams();
  const searchParams = useSearchParams();

  const woId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const urlJobId = searchParams.get("jobId") ?? null;
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // Core entities
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // UI / page state
  const [loading, setLoading] = useState<boolean>(true);
  const [viewError, setViewError] = useState<string | null>(null);

  // tech focus & timing
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [duration, setDuration] = useState("");

  // tech (assignee)
  const [tech, setTech] = useState<Profile | null>(null);

  // photos + user cache
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // keep "Show details" persisted with useTabState (still used on this page)
  const [showDetails, setShowDetails] = useTabState<boolean>("wo:showDetails", true);

  // modals
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [isCauseModalOpen, setIsCauseModalOpen] = useState(false);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);

  // Inspection modal state (triggered from FocusedJob via window event)
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // normalize tracker
  const [fixedStatus, setFixedStatus] = useState<Set<string>>(new Set());

  // one-time missing notice
  const [warnedMissing, setWarnedMissing] = useState(false);

  // Current user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        setUserId(user.id);
      } else {
        setCurrentUserId(null);
        setUserId(null);
      }
    })();
  }, [supabase]);

  // ---------------------- FETCH (guarded by user session) ----------------------
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!woId || !userId) return;
      setLoading(true);
      setViewError(null);

      try {
        // Primary: try UUID id
        let { data: woRow, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", woId)
          .maybeSingle();
        if (woErr) throw woErr;

        // Fallback: custom_id if param looks short
        if (!woRow && !looksLikeUuid(woId)) {
          const byCustom = await supabase.from("work_orders").select("*").eq("custom_id", woId).maybeSingle();
          if (byCustom.data) woRow = byCustom.data;
        }

        if (!woRow) {
          if (retry < 2) {
            await sleep(200 * Math.pow(2, retry));
            return fetchAll(retry + 1);
          }
          setViewError("Work order not visible / not found.");
          setWo(null);
          setLines([]);
          setVehicle(null);
          setCustomer(null);
          setLine(null);
          setActiveJobId(null);
          setLoading(false);
          return;
        }

        setWo(woRow);

        if (!warnedMissing && (!woRow.vehicle_id || !woRow.customer_id)) {
          toast.error("This work order is missing vehicle and/or customer. Open the Create form to set them.", {
            important: true,
          } as any);
          setWarnedMissing(true);
        }

        const [linesRes, vehRes, custRes] = await Promise.all([
          supabase
            .from("work_order_lines")
            .select("*")
            .eq("work_order_id", woRow.id)
            .order("created_at", { ascending: true }),
          woRow.vehicle_id
            ? supabase.from("vehicles").select("*").eq("id", woRow.vehicle_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          woRow.customer_id
            ? supabase.from("customers").select("*").eq("id", woRow.customer_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (linesRes.error) throw linesRes.error;
        const list = (linesRes.data ?? []) as WorkOrderLine[];
        setLines(list);

        if (vehRes?.error) throw vehRes.error;
        setVehicle((vehRes?.data as Vehicle | null) ?? null);

        if (custRes?.error) throw custRes.error;
        setCustomer((custRes?.data as Customer | null) ?? null);

        let pick: WorkOrderLine | null =
          (urlJobId && list.find((j) => j.id === urlJobId)) ||
          list.find((j) => j.status === "in_progress") ||
          list.find((j) => !j.punched_out_at) ||
          list[0] ||
          null;

        setLine(pick ?? null);
        setActiveJobId(pick && !pick?.punched_out_at ? pick.id : null);

        if (pick?.assigned_to) {
          const { data: p } = await supabase.from("profiles").select("*").eq("id", pick.assigned_to).single();
          setTech(p ?? null);
        } else {
          setTech(null);
        }
      } catch (e: any) {
        const msg = e?.message ?? "Failed to load work order.";
        setViewError(msg);
        console.error("[WO id page] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [supabase, woId, userId, urlJobId, warnedMissing]
  );

  useEffect(() => {
    if (!woId || !userId) return;
    void fetchAll();
  }, [fetchAll, woId, userId]);

  // Real-time refresh
  useEffect(() => {
    if (!woId || !userId) return;

    const ch = supabase
      .channel(`wo:${woId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders", filter: `id=eq.${woId}` },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines", filter: `work_order_id=eq.${woId}` },
        () => fetchAll()
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [supabase, woId, userId, fetchAll]);

  // Legacy refresh event
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener("wo:line-added", handler);
    return () => window.removeEventListener("wo:line-added", handler);
  }, [fetchAll]);

  // Listen for "open inspection" requests (from focused job)
  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as CustomEvent<{ path: string; params: string }>;
      if (!ce?.detail) return;
      const url = `${ce.detail.path}?${ce.detail.params}`;
      setInspectionSrc(url);
      setInspectionOpen(true);
    };
    window.addEventListener("inspection:open", onOpen as EventListener);
    return () => window.removeEventListener("inspection:open", onOpen as EventListener);
  }, []);

  // Live timer for focused job badge + header timer
  useEffect(() => {
    const t = setInterval(() => {
      if (line?.punched_in_at && !line?.punched_out_at) {
        setDuration(formatDistanceStrict(new Date(), new Date(line.punched_in_at)));
      } else {
        setDuration("");
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [line]);

  /* -------- Normalize any newly created lines to status 'awaiting' -------- */
  useEffect(() => {
    (async () => {
      if (!lines.length) return;
      const toFix = lines
        .filter((l) => !l.status || l.status === (null as any))
        .map((l) => l.id)
        .filter((id) => !fixedStatus.has(id));

      if (toFix.length === 0) return;

      const { error } = await supabase.from("work_order_lines").update({ status: "awaiting" }).in("id", toFix);

      if (!error) {
        const next = new Set(fixedStatus);
        toFix.forEach((id) => next.add(id));
        setFixedStatus(next);
        fetchAll();
      }
    })();
  }, [lines, fixedStatus, supabase, fetchAll]);

  /* ------------------------------ Tech Actions ----------------------------- */
  const handleStart = async (jobId: string) => {
    if (activeJobId && activeJobId !== jobId) {
      const ok = confirm("You are currently on another job. Finish it and switch?");
      if (!ok) return;
      const { error: outErr } = await supabase
        .from("work_order_lines")
        .update({ punched_out_at: new Date().toISOString(), status: "awaiting" })
        .eq("id", activeJobId);
      if (outErr) return showErr("Finish current job failed", outErr);
      setActiveJobId(null);
    } else if (activeJobId) {
      toast.error("You have already started a job.");
      return;
    }

    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", jobId);
    if (error) return showErr("Start failed", error);
    toast.success("Started job");
    setActiveJobId(jobId);
    fetchAll();
  };

  const handleFinish = async (jobId: string) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_out_at: new Date().toISOString(), status: "awaiting" })
      .eq("id", jobId);
    if (error) return showErr("Finish failed", error);
    toast.success("Finished job");
    setActiveJobId(null);
    fetchAll();
  };

  const handleCompleteJob = async (cause: string, correction: string) => {
    if (!line) return;
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
    setIsCauseModalOpen(false);
    fetchAll();
  };

  // Sorting & helpers
  const chipClass = (s: string | null): string => {
    const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
    return `text-xs px-2 py-1 rounded ${statusBadge[key] ?? "bg-gray-200 text-gray-800"}`;
  };
  const sortedLines = useMemo(() => {
    const pr: Record<string, number> = { diagnosis: 1, inspection: 2, maintenance: 3, repair: 4 };
    return [...lines].sort((a, b) => {
      const pa = pr[String(a.job_type ?? "repair")] ?? 999;
      const pb = pr[String(b.job_type ?? "repair")] ?? 999;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [lines]);

  const notes: string | null = ((wo as WorkOrderWithMaybeNotes | null)?.notes ?? null) || null;
  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText = createdAt && !isNaN(createdAt.getTime()) ? format(createdAt, "PPpp") : "—";

  const badgeClass =
    statusBadge[(line?.status ?? "awaiting") as keyof typeof statusBadge] ?? "bg-gray-200 text-gray-800";

  const renderJobDuration = (job: WorkOrderLine) => {
    if (job.punched_in_at && !job.punched_out_at) {
      const ms = Date.now() - new Date(job.punched_in_at).getTime();
      return msToTenthHours(ms);
    }
    if (job.punched_in_at && job.punched_out_at) {
      const ms = new Date(job.punched_out_at).getTime() - new Date(job.punched_in_at).getTime();
      return msToTenthHours(ms);
    }
    return "0.0 hr";
  };

  if (!woId) {
    return <div className="p-6 text-red-500">Missing work order id.</div>;
  }

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-neutral-800/60 ${className}`} />
  );

  return (
    <div className="p-4 sm:p-6 text-white">
      <PreviousPageButton to="/work-orders" />

      {viewError && (
        <div className="mt-4 whitespace-pre-wrap rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300">
          {viewError}
        </div>
      )}

      {loading && (
        <div className="mt-6 grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
        </div>
      )}

      {!loading && !wo && !viewError && <div className="mt-6 text-red-500">Work order not found.</div>}

      {!loading && wo && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-2xl font-semibold">
                  Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}{" "}
                  {line ? (
                    <span
                      className={`ml-2 align-middle text-[11px] px-2 py-1 rounded ${badgeClass}`}
                      title="Focused job status"
                    >
                      {(line.status ?? "awaiting").replaceAll("_", " ")}
                    </span>
                  ) : null}
                </h1>
              </div>
              <div className="mt-2 grid gap-2 text-sm text-neutral-300 sm:grid-cols-3">
                <div>
                  <div className="text-neutral-400">Created</div>
                  <div>{createdAtText}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Notes</div>
                  <div className="truncate">{notes ?? "—"}</div>
                </div>
                <div>
                  <div className="text-neutral-400">WO ID</div>
                  <div className="truncate">{wo.id}</div>
                </div>
              </div>
            </div>

            {/* Vehicle & Customer */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Vehicle & Customer</h2>
                <button
                  type="button"
                  className="text-sm text-orange-400 hover:underline"
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                >
                  {showDetails ? "Hide details" : "Show details"}
                </button>
              </div>

              {showDetails && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-1 font-semibold">Vehicle</h3>
                    {vehicle ? (
                      <>
                        <p>
                          {(vehicle.year ?? "").toString()} {vehicle.make ?? ""} {vehicle.model ?? ""}
                        </p>
                        <p className="text-sm text-neutral-400">
                          VIN: {vehicle.vin ?? "—"} • Plate: {vehicle.license_plate ?? "—"}
                        </p>
                      </>
                    ) : (
                      <p className="text-neutral-400">—</p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-1 font-semibold">Customer</h3>
                    {customer ? (
                      <>
                        <p>{[customer.first_name ?? "", customer.last_name ?? ""].filter(Boolean).join(" ") || "—"}</p>
                        <p className="text-sm text-neutral-400">
                          {customer.phone ?? "—"} {customer.email ? `• ${customer.email}` : ""}
                        </p>
                        {customer.id && (
                          <Link
                            href={`/customers/${customer.id}`}
                            className="mt-1 inline-block text-xs text-orange-500 hover:underline"
                            title="Open customer profile"
                          >
                            View Customer Profile →
                          </Link>
                        )}
                      </>
                    ) : (
                      <p className="text-neutral-400">—</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Jobs (list only; front-desk add/approval controls removed) */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Jobs in this Work Order</h2>
              </div>

              {sortedLines.length === 0 ? (
                <p className="text-sm text-neutral-400">No lines yet.</p>
              ) : (
                <div className="space-y-2">
                  {sortedLines.map((ln) => {
                    const statusKey = (ln.status ?? "awaiting").toLowerCase().replaceAll(" ", "_");
                    const borderCls = statusBorder[statusKey] || "border-l-4 border-gray-400";
                    const tintCls = statusRowTint[statusKey] || "bg-neutral-950";
                    const punchedIn = !!ln.punched_in_at && !ln.punched_out_at;

                    const isInspection = (ln.job_type ?? "") === "inspection";
                    const holdMsg =
                      (ln.status as WOStatus) === "on_hold" && ln.hold_reason
                        ? `on hold for ${ln.hold_reason}`
                        : (ln.status as WOStatus) === "on_hold"
                        ? "on hold"
                        : "";

                    return (
                      <div
                        key={ln.id}
                        className={`rounded border border-neutral-800 ${tintCls} p-3 ${borderCls} ${
                          punchedIn ? "ring-2 ring-orange-500" : ""
                        } cursor-pointer`}
                        onClick={() => {
                          setLine(ln);
                          setActiveJobId(ln.punched_out_at ? null : ln.id);
                        }}
                        title="Open focused job"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {ln.description || ln.complaint || "Untitled job"}
                            </div>
                            <div className="text-xs text-neutral-400">
                              {String((ln.job_type as JobType) ?? "job").replaceAll("_", " ")} •{" "}
                              {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} • Status:{" "}
                              {(ln.status ?? "awaiting").replaceAll("_", " ")} • Time: {renderJobDuration(ln)}
                              {holdMsg ? <span className="ml-2 italic text-amber-300">{`(${holdMsg})`}</span> : null}
                            </div>
                            {(ln.complaint || ln.cause || ln.correction || isInspection) && (
                              <div className="text-xs text-neutral-400 mt-1 flex flex-wrap items-center gap-2">
                                {ln.complaint ? <span>Cmpl: {ln.complaint}</span> : null}
                                {ln.cause ? <span>| Cause: {ln.cause}</span> : null}
                                {ln.correction ? <span>| Corr: {ln.correction}</span> : null}
                                {isInspection ? (
                                  <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[11px] text-neutral-300">
                                    Inspection available — open from Focused Job
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </div>

                          <span className={chipClass(ln.status as WOStatus)}>
                            {(ln.status ?? "awaiting").replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT rail */}
          <aside className="space-y-6">
            {/* Suggested AI quick add (uses current focused/active/sensible job) */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              {(() => {
                // pick a sensible job to suggest for
                const chosen =
                  line?.id ||
                  sortedLines.find((l) => l.status === "in_progress")?.id ||
                  sortedLines.find((l) => !l.punched_out_at)?.id ||
                  sortedLines[0]?.id ||
                  null;

                return chosen ? (
                  <SuggestedQuickAdd
                    jobId={chosen}
                    workOrderId={wo.id}
                    vehicleId={vehicle?.id ?? null}
                    onAdded={fetchAll}
                  />
                ) : (
                  <div className="text-sm text-neutral-400">Add a job line to enable AI suggestions.</div>
                );
              })()}
            </div>

            {/* Focused job controls */}
            {line ? (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Focused Job</h3>
                  <span className={`text-xs px-2 py-1 rounded ${badgeClass}`}>
                    {(line.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-2 p-3 rounded border border-neutral-800 bg-neutral-950">
                  <p>
                    <strong>Complaint:</strong> {line.complaint || "—"}
                  </p>
                  <p>
                    <strong>Status:</strong> {line.status ?? "—"}
                  </p>
                  <p>
                    <strong>Live Timer:</strong> {duration}
                  </p>
                  <p>
                    <strong>Punched In:</strong>{" "}
                    {line.punched_in_at ? format(new Date(line.punched_in_at), "PPpp") : "—"}
                  </p>
                  <p>
                    <strong>Punched Out:</strong>{" "}
                    {line.punched_out_at ? format(new Date(line.punched_out_at), "PPpp") : "—"}
                  </p>
                  <p>
                    <strong>Labor Time:</strong> {line.labor_time ?? "—"} hrs
                  </p>
                  <p>
                    <strong>Hold Reason:</strong> {line.hold_reason || "—"}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    <button
                      className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-white"
                      onClick={() => handleStart(line.id)}
                    >
                      Start
                    </button>
                    <button
                      className="bg-zinc-700 hover:bg-zinc-800 px-3 py-2 rounded text-white"
                      onClick={() => handleFinish(line.id)}
                    >
                      Finish
                    </button>
                    <button
                      className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-white"
                      onClick={() => setIsCauseModalOpen(true)}
                    >
                      Complete Job
                    </button>
                    <button
                      className="bg-red-500 hover:bg-red-600 px-3 py-2 rounded text-white"
                      onClick={() => setIsPartsModalOpen(true)}
                    >
                      Request Parts
                    </button>
                  </div>
                </div>

                {/* Diagnosis DTC helper (unchanged usage) */}
                {line.job_type === "diagnosis" && line.punched_in_at && !line.cause && !line.correction && vehicle && (
                  <div className="mt-4">
                    <DtcSuggestionPopup
                      jobId={line.id}
                      vehicle={{
                        id: vehicle.id,
                        year: (vehicle.year ?? "").toString(),
                        make: vehicle.make ?? "",
                        model: vehicle.model ?? "",
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
                No focused job yet.
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Vehicle photos */}
      {vehicle?.id && currentUserId && (
        <div className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold">Vehicle Photos</h2>
          <VehiclePhotoUploader vehicleId={vehicle.id} />
          <VehiclePhotoGallery vehicleId={vehicle.id} currentUserId={currentUserId!} />
        </div>
      )}

      {/* Add Job modal */}
      {isAddJobModalOpen && wo?.id && vehicle?.id && (
        <AddJobModal
          isOpen={isAddJobModalOpen}
          onClose={() => setIsAddJobModalOpen(false)}
          workOrderId={wo.id}
          vehicleId={vehicle.id}
          techId={tech?.id || "system"}
          onJobAdded={fetchAll}
        />
      )}

      {/* Focused Job modal — hosts “Open Inspection” & tech actions */}
      {line && (
        <FocusedJobModal
          isOpen={!!line}
          onClose={() => setLine(null)}
          workOrderLineId={line.id}
          workOrderId={wo?.id ?? ""}
          vehicleId={vehicle?.id ?? null}
          onChanged={fetchAll}
          onStart={handleStart}
          onFinish={handleFinish}
        />
      )}

      {/* Tech modals */}
      {isPartsModalOpen && wo?.id && line && (
        <PartsRequestModal
          isOpen={isPartsModalOpen}
          onClose={() => setIsPartsModalOpen(false)}
          jobId={line.id}
          workOrderId={wo.id}
          requested_by={tech?.id || "system"}
        />
      )}

      {isCauseModalOpen && line && (
        <CauseCorrectionModal
          isOpen={isCauseModalOpen}
          onClose={() => setIsCauseModalOpen(false)}
          jobId={line.id}
          onSubmit={handleCompleteJob}
        />
      )}

      {/* INSPECTION MODAL (dark, never navigates away) */}
      {inspectionOpen && inspectionSrc && (
        <InspectionModal isOpen={inspectionOpen} onClose={() => setInspectionOpen(false)} src={inspectionSrc} />
      )}
    </div>
  );
}