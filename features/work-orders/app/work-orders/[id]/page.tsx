// app/work-orders/[id]/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format, formatDistanceStrict } from "date-fns";
import { toast } from "sonner";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";
import InspectionModal from "@/features/inspections/components/InspectionModal";
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";

/* --------------------------------- Types --------------------------------- */
type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type WOStatus =
  | "awaiting_review" // advisor review (preferred)
  | "awaiting_approval" // legacy: directly to customer
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed"
  | string;
type JobType = "diagnosis" | "diagnosis-followup" | "maintenance" | "repair" | "tech-suggested" | "inspection" | string;

type ParamsShape = Record<string, string | string[]>;
const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;
const toStr = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/* ----------------------------- Styling maps ------------------------------ */
const statusBorder: Record<string, string> = {
  awaiting: "border-l-4 border-slate-400",
  awaiting_review: "border-l-4 border-blue-400",
  awaiting_approval: "border-l-4 border-blue-500",
  queued: "border-l-4 border-indigo-400",
  in_progress: "border-l-4 border-orange-500",
  on_hold: "border-l-4 border-amber-500",
  completed: "border-l-4 border-green-500",
  planned: "border-l-4 border-purple-500",
  new: "border-l-4 border-gray-400",
};
const statusRowTint: Record<string, string> = {
  awaiting: "bg-neutral-950",
  awaiting_review: "bg-neutral-950",
  awaiting_approval: "bg-neutral-950",
  queued: "bg-neutral-950",
  in_progress: "bg-neutral-950",
  on_hold: "bg-amber-900/30",
  completed: "bg-green-900/30",
  planned: "bg-neutral-950",
  new: "bg-neutral-950",
};

/* ----------------------------- Error Boundary ----------------------------- */
class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{ fallback?: React.ReactNode }>,
  { hasError: boolean; msg?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, msg: undefined };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    console.error("[WO child render error]", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300 text-sm">
            A section failed to load{this.state.msg ? `: ${this.state.msg}` : "."}
          </div>
        )
      );
    }
    return this.props.children ?? null;
  }
}

/* ------------------------------ Small helpers ----------------------------- */
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
function msToTenthHours(ms: number): string {
  const tenths = Math.max(0, Math.round(ms / 360000));
  const hours = (tenths / 10).toFixed(1);
  return `${hours} hr`;
}
function chipClass(s: string | null): string {
  const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
  const badge: Record<string, string> = {
    awaiting_approval: "bg-blue-100 text-blue-800",
    awaiting_review: "bg-sky-100 text-sky-800",
    awaiting: "bg-slate-200 text-slate-800",
    queued: "bg-indigo-100 text-indigo-800",
    in_progress: "bg-orange-100 text-orange-800",
    on_hold: "bg-amber-100 text-amber-800",
    planned: "bg-purple-100 text-purple-800",
    new: "bg-gray-200 text-gray-800",
    completed: "bg-green-100 text-green-800",
  };
  return `text-xs px-2 py-1 rounded ${badge[key] ?? "bg-gray-200 text-gray-800"}`;
}

/* ---------------------------- Debug Panel (opt-in) ---------------------------- */
function DebugPanel({
  woId,
  supabase,
}: {
  woId: string;
  supabase: ReturnType<typeof createClientComponentClient<DB>>;
}) {
  const [state, setState] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const [{ data: userData }, { data: curShop }, { data: woRow, error: woErr }, vis] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("current_shop_id"),
        supabase.from("work_orders").select("id, shop_id").eq("id", woId).maybeSingle(),
        supabase.from("work_orders").select("id", { head: true, count: "exact" }).eq("id", woId),
      ]);

      setState({
        user: userData?.user?.id ?? null,
        current_shop_id: curShop ?? null,
        wo_shop_id: woRow?.shop_id ?? null,
        visible_to_select: !!vis.count && vis.count > 0,
        wo_error: woErr?.message ?? null,
      });
    })();
  }, [supabase, woId]);

  if (!state) return null;
  return (
    <div className="mt-4 rounded border border-yellow-700 bg-yellow-900/20 p-3 text-xs text-yellow-200">
      <div className="font-semibold mb-1">Debug</div>
      <pre className="whitespace-pre-wrap text-[11px]">{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}

/* ---------------------------------- Page --------------------------------- */
export default function WorkOrderTechPage(): JSX.Element {
  const params = useParams();
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";

  const woId = useMemo(() => toStr((params as ParamsShape)?.id), [params]);
  const urlJobId = searchParams.get("jobId");
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // Core entities
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // UI + state
  const [loading, setLoading] = useState<boolean>(true);
  const [viewError, setViewError] = useState<string | null>(null);

  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [duration, setDuration] = useState("");
  const [,setTech] = useState<Profile | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const [focusedOpen, setFocusedOpen] = useState(false);
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // Approval selection (tech chooses which lines to send to advisor review)
  const [selectedForApproval, setSelectedForApproval] = useState<Set<string>>(new Set());
  const [touchedSelection, setTouchedSelection] = useState(false);

  const setUrlJobId = useCallback(
    (jobId: string | null) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (jobId) sp.set("jobId", jobId);
      else sp.delete("jobId");
      const href = `?${sp.toString()}`;
      window.history.replaceState(null, "", href);
    },
    [searchParams]
  );

  const selectAllEligible = () => {
    const ids = (lines ?? []).filter((l) => (l.status ?? "") !== "completed").map((l) => l.id);
    setSelectedForApproval(new Set(ids));
    setTouchedSelection(true);
  };
  const clearAllSelection = () => {
    setSelectedForApproval(new Set());
    setTouchedSelection(true);
  };
  const toggleSelection = (id: string) => {
    setSelectedForApproval((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setTouchedSelection(true);
  };

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

  // Re-run after auth state changes (helps when session restores)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {});
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  // Live timer for the header
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

  // Listen for "open inspection" requests from FocusedJob
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

  // Default approval selection = any non-completed
  useEffect(() => {
    if (!touchedSelection) {
      const ids = (lines ?? []).filter((l) => (l.status ?? "") !== "completed").map((l) => l.id);
      setSelectedForApproval(new Set(ids));
    }
  }, [lines, touchedSelection]);

  // ------------------------------ FETCH ALL ------------------------------
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!woId || !userId) return;
      setLoading(true);
      setViewError(null);

      try {
        // try UUID id
        let { data: woRow, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", woId)
          .maybeSingle();
        if (woErr) throw woErr;

        // fallback: custom_id (short code)
        if (!woRow && !looksLikeUuid(woId)) {
          const byCustom = await supabase.from("work_orders").select("*").eq("custom_id", woId).maybeSingle();
          if (byCustom.data) woRow = byCustom.data;
        }

        // not visible yet → retry briefly then explain
        if (!woRow) {
          if (retry < 2) {
            await sleep(200 * Math.pow(2, retry));
            return fetchAll(retry + 1);
          }
          const [
            {
              data: { user },
            },
            { data: curShop },
            vis,
          ] = await Promise.all([
            supabase.auth.getUser(),
            supabase.rpc("current_shop_id"),
            supabase.from("work_orders").select("id", { head: true, count: "exact" }).eq("id", woId),
          ]);

          const parts = [
            "Work order not visible / not found.",
            `• param: ${woId}`,
            `• treated_as_uuid: ${looksLikeUuid(woId)}`,
            `• session: ${user ? "present" : "missing"}`,
            `• current_shop_id: ${curShop ?? "NULL"}`,
            `• visible via SELECT count: ${vis.count ?? 0}`,
          ];
          setViewError(parts.join("\n"));
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
        setUrlJobId(pick?.id ?? null);

        if (pick?.assigned_to) {
          const { data: p } = await supabase.from("profiles").select("*").eq("id", pick.assigned_to).single();
          setTech(p ?? null);
        } else {
          setTech(null);
        }
      } catch (e: any) {
        const msg = e?.message ?? "Failed to load work order.";
        setViewError(msg);
        console.error("[WO tech page] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [supabase, woId, userId, urlJobId, setUrlJobId]
  );

  // Only fetch once we have both: an id and an authenticated user
  useEffect(() => {
    if (!woId || !userId) return;
    void fetchAll();
  }, [fetchAll, woId, userId]);

  // Real-time refresh (subscribe when authed + id present)
  useEffect(() => {
    if (!woId || !userId) return;

    const ch = supabase
      .channel(`wo:${woId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders", filter: `id=eq.${woId}` }, () =>
        fetchAll()
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

  // ------------------------------ TECH ACTIONS ------------------------------
  const handleStart = async (jobId: string) => {
    if (activeJobId && activeJobId !== jobId) {
      const ok = confirm("You are currently on another job. Finish it and switch?");
      if (!ok) return;
      const { error: outErr } = await supabase
        .from("work_order_lines")
        .update({ punched_out_at: new Date().toISOString(), status: "awaiting" })
        .eq("id", activeJobId);
      if (outErr) return toast.error(`Finish current job failed: ${outErr.message}`);
      setActiveJobId(null);
    } else if (activeJobId) {
      toast.error("You have already started a job.");
      return;
    }

    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", jobId);
    if (error) return toast.error(`Start failed: ${error.message}`);
    toast.success("Started job");
    setUrlJobId(jobId);
    setActiveJobId(jobId);
    fetchAll();
  };

  const handleFinish = async (jobId: string) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_out_at: new Date().toISOString(), status: "awaiting" })
      .eq("id", jobId);
    if (error) return toast.error(`Finish failed: ${error.message}`);
    toast.success("Finished job");
    setActiveJobId(null);
    fetchAll();
  };

  const handleDeleteLine = async (lineId: string) => {
    const ok = confirm("Delete this job line? This cannot be undone.");
    if (!ok) return;
    const { error } = await supabase.from("work_order_lines").delete().eq("id", lineId);
    if (error) return toast.error(`Delete failed: ${error.message}`);
    toast.success("Line deleted");
    fetchAll();
  };

  const [busySendApproval, setBusySendApproval] = useState(false);
  const handleSendToAdvisor = async () => {
    if (!wo?.id) return;
    const selected = Array.from(selectedForApproval);
    if (!selected.length) {
      toast.error("Select at least one job to send for review.");
      return;
    }
    if (busySendApproval) return;

    setBusySendApproval(true);
    const prev = wo;
    try {
      // Prefer the staged status "awaiting_review" (advisor). If that column/state is not allowed, we fall back silently.
      setWo(prev ? { ...prev, status: "awaiting_review" as WOStatus } : prev);
      const up = await supabase.from("work_orders").update({ status: "awaiting_review" as any }).eq("id", wo.id);
      if (up.error) {
        // fallback to legacy "awaiting_approval"
        await supabase.from("work_orders").update({ status: "awaiting_approval" as any }).eq("id", wo.id);
      }

      // Fire-and-forget server action / route to notify advisor pipeline (implement your API route)
      fetch("/work-orders/submit-for-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: wo.id, lineIds: selected }),
      }).catch(() => {});

      toast.success(`Sent ${selected.length} job(s) to advisor for review.`);
    } catch (e: any) {
      setWo(prev);
      toast.error(e?.message || "Send to advisor failed");
    } finally {
      setBusySendApproval(false);
    }
  };

  // ------------------------------- RENDER --------------------------------
  if (!woId) {
    return <div className="p-6 text-red-500">Missing work order id.</div>;
  }

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-neutral-800/60 ${className}`} />
  );

  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText = createdAt && !isNaN(createdAt.getTime()) ? format(createdAt, "PPpp") : "—";

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
        <div className="space-y-6">
          {/* Header */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold">
                Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}
              </h1>
              {duration ? (
                <div className="text-xs text-neutral-300" title="Active job time">
                  Active time: {duration}
                </div>
              ) : null}
            </div>
            <div className="mt-2 grid gap-2 text-sm text-neutral-300 sm:grid-cols-3">
              <div>
                <div className="text-neutral-400">Created</div>
                <div>{createdAtText}</div>
              </div>
              <div>
                <div className="text-neutral-400">Status</div>
                <div>
                  <span className={chipClass(wo.status as WOStatus)}>
                    {(wo.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-neutral-400">WO ID</div>
                <div className="truncate">{wo.id}</div>
              </div>
            </div>
          </div>

          {/* Vehicle & Customer (tech needs quick reference + link) */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Vehicle & Customer</h2>
              {customer?.id && (
                <Link
                  href={`/customers/${customer.id}`}
                  className="text-sm text-orange-400 hover:underline"
                  title="Open customer profile"
                >
                  Customer Profile →
                </Link>
              )}
            </div>

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
                  </>
                ) : (
                  <p className="text-neutral-400">—</p>
                )}
              </div>
            </div>
          </div>

          {/* Jobs (tech workspace) */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Jobs in this Work Order</h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAddOpen((v) => !v)}
                  className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:border-orange-500"
                  aria-expanded={quickAddOpen}
                  title="Open Quick Add menu"
                >
                  {quickAddOpen ? "Hide Quick Add" : "Quick Add"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm((v) => !v)}
                  className="rounded bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm hover:border-orange-500"
                  aria-expanded={showAddForm}
                >
                  {showAddForm ? "Hide Add Job Line" : "Add Job Line"}
                </button>
              </div>
            </div>

            {/* Quick Add */}
            {quickAddOpen && (
              <div className="mb-3 rounded border border-neutral-800 bg-neutral-950 p-3">
                <ErrorBoundary>
                  <MenuQuickAdd workOrderId={wo.id} />
                </ErrorBoundary>
                <div className="mt-2 text-[11px] text-neutral-500">
                  Tip: Keyboard shortcuts — <span className="text-neutral-300">Alt+S</span> to Start,{" "}
                  <span className="text-neutral-300">Alt+F</span> to Finish the focused job.
                </div>
              </div>
            )}

            {/* Approval selection helpers (tech → advisor) */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-300">
              <span className="opacity-70">Choose items to send for advisor review:</span>
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 hover:border-orange-500"
                onClick={selectAllEligible}
              >
                Select all
              </button>
              <button
                type="button"
                className="rounded border border-neutral-700 px-2 py-1 hover:border-orange-500"
                onClick={clearAllSelection}
              >
                Clear
              </button>
              <span className="ml-auto">
                Selected: <strong>{selectedForApproval.size}</strong>
              </span>
            </div>

            {showAddForm && (
              <ErrorBoundary>
                <NewWorkOrderLineForm
                  workOrderId={wo.id}
                  vehicleId={vehicle?.id ?? null}
                  defaultJobType={null}
                  onCreated={() => fetchAll()}
                />
              </ErrorBoundary>
            )}

            {sortedLines.length === 0 ? (
              <p className="text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {sortedLines.map((ln) => {
                  const eligible = (ln.status ?? "") !== "completed";
                  const checked = selectedForApproval.has(ln.id);
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
                        setFocusedJobId(ln.id);
                        setFocusedOpen(true);
                        setUrlJobId(ln.id);
                        setLine(ln);
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

                        <div className="flex flex-col items-end gap-2">
                          {/* include in advisor review */}
                          <label
                            className={`flex items-center gap-1 text-xs ${
                              eligible ? "text-neutral-300" : "text-neutral-500"
                            }`}
                            title={eligible ? "Include in advisor review" : "Completed jobs are excluded"}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              disabled={!eligible}
                              checked={eligible && checked}
                              onChange={() => eligible && toggleSelection(ln.id)}
                            />
                            Include
                          </label>

                          {/* Delete line (if allowed by RLS) */}
                          <button
                            className="rounded border border-red-600 px-2 py-1 text-xs text-red-300 hover:bg-red-900/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLine(ln.id);
                            }}
                            title="Delete line"
                          >
                            Delete
                          </button>

                          <span className={chipClass(ln.status as WOStatus)}>
                            {(ln.status ?? "awaiting").replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Sticky actions (tech → advisor) */}
            <div className="sticky bottom-3 z-10 mt-4 rounded border border-neutral-800 bg-neutral-900/95 p-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSendToAdvisor}
                  disabled={busySendApproval || selectedForApproval.size === 0}
                  className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                  title="Send selected jobs to advisor review"
                >
                  {busySendApproval ? "Sending…" : `Send to Advisor (${selectedForApproval.size})`}
                </button>

                {/* Advisor’s review & customer signature live on /work-orders/quote-review */}
                <a
                  href={`/work-orders/quote-review?woId=${wo?.id ?? ""}`}
                  className="rounded border border-neutral-700 px-3 py-2 hover:border-orange-500"
                  title="Open advisor/customer review"
                >
                  Open Review / Signature
                </a>
              </div>
            </div>
          </div>

          {/* Optional inline diagnostics */}
          {debug && woId && <DebugPanel woId={woId} supabase={supabase} />}
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

      {/* Focused Job modal — hosts “Open Inspection” & tech actions */}
      {focusedOpen && focusedJobId && (
        <FocusedJobModal
          isOpen={focusedOpen}
          onClose={() => setFocusedOpen(false)}
          workOrderLineId={focusedJobId}
          workOrderId={wo?.id ?? ""}
          vehicleId={vehicle?.id ?? null}
          onChanged={fetchAll}
          onStart={handleStart}
          onFinish={handleFinish}
        />
      )}

      {/* INSPECTION MODAL (dark, never navigates away) */}
      {inspectionOpen && inspectionSrc && (
        <InspectionModal isOpen={inspectionOpen} onClose={() => setInspectionOpen(false)} src={inspectionSrc} />
      )}
    </div>
  );
}