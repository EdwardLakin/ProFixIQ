"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { toast } from "sonner";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";

// Focused modal (now contains all other modals internally)
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
// Add Job modal (still launched from this page header)
import AddJobModal from "@work-orders/components/workorders/AddJobModal";

import { useTabState } from "@/features/shared/hooks/useTabState";

/* --------------------------------- Types --------------------------------- */
type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

type ParamsShape = Record<string, string | string[]>;
const paramToString = (v: string | string[] | undefined): string | null =>
  !v ? null : Array.isArray(v) ? v[0] ?? null : v;
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

/* ---------------------------------- Page --------------------------------- */
export default function WorkOrderTechPage(): JSX.Element {
  const params = useParams();
  const woParam = useMemo(() => paramToString((params as ParamsShape)?.id), [params]);

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // Core entities
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);

  // UI state
  const [loading, setLoading] = useState<boolean>(true);
  const [viewError, setViewError] = useState<string | null>(null);

  // user
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // persisted UI toggle
  const [showDetails, setShowDetails] = useTabState<boolean>("wo:showDetails", true);

  // Add Job modal
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);

  // Focused job modal (now the single place for all job actions)
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);

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

  /* ---------------------- FETCH ---------------------- */
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!woParam || !userId) return;

      setLoading(true);
      setViewError(null);

      try {
        // Try by id first, then custom_id
        let { data: woRow, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", woParam)
          .maybeSingle();
        if (woErr) throw woErr;

        if (!woRow && !looksLikeUuid(woParam)) {
          const byCustom = await supabase.from("work_orders").select("*").eq("custom_id", woParam).maybeSingle();
          if (byCustom.data) woRow = byCustom.data;
        }

        if (!woRow) {
          if (retry < 2) {
            await new Promise((r) => setTimeout(r, 200 * Math.pow(2, retry)));
            return fetchAll(retry + 1);
          }
          setViewError("Work order not visible / not found.");
          setWo(null);
          setLines([]);
          setVehicle(null);
          setCustomer(null);
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
        setLines((linesRes.data ?? []) as WorkOrderLine[]);

        if (vehRes?.error) throw vehRes.error;
        setVehicle((vehRes?.data as Vehicle | null) ?? null);

        if (custRes?.error) throw custRes.error;
        setCustomer((custRes?.data as Customer | null) ?? null);
      } catch (e: any) {
        setViewError(e?.message ?? "Failed to load work order.");
        console.error("[WO id page] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [supabase, woParam, userId, warnedMissing]
  );

  useEffect(() => {
    if (!woParam || !userId) return;
    void fetchAll();
  }, [fetchAll, woParam, userId]);

  // Real-time refresh
  useEffect(() => {
    if (!woParam || !userId) return;
    const ch = supabase
      .channel(`wo:${woParam}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders", filter: `id=eq.${woParam}` },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines", filter: `work_order_id=eq.${woParam}` },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [supabase, woParam, userId, fetchAll]);

  // Legacy refresh event
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener("wo:line-added", handler);
    return () => window.removeEventListener("wo:line-added", handler);
  }, [fetchAll]);

  /* ----------------------- Helpers ----------------------- */
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

  const chipClass = (s: string | null): string => {
    const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
    return `text-xs px-2 py-1 rounded ${statusBadge[key] ?? "bg-gray-200 text-gray-800"}`;
  };

  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText = createdAt && !isNaN(createdAt.getTime()) ? format(createdAt, "PPpp") : "—";

  /* -------------------------- UI -------------------------- */
  if (!woParam) {
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
                  Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}
                </h1>
                <button
                  type="button"
                  onClick={() => setIsAddJobModalOpen(true)}
                  className="rounded bg-orange-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-orange-400"
                  title="Add a job to this work order"
                >
                  + Add Job
                </button>
              </div>
              <div className="mt-2 grid gap-2 text-sm text-neutral-300 sm:grid-cols-3">
                <div>
                  <div className="text-neutral-400">Created</div>
                  <div>{createdAtText}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Notes</div>
                  <div className="truncate">{(wo as any)?.notes ?? "—"}</div>
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

            {/* Jobs list (click -> FocusedJobModal) */}
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

                    return (
                      <div
                        key={ln.id}
                        className={`rounded border border-neutral-800 ${tintCls} p-3 ${borderCls} ${
                          punchedIn ? "ring-2 ring-orange-500" : ""
                        } cursor-pointer`}
                        onClick={() => {
                          setFocusedJobId(ln.id);
                          setFocusedOpen(true);
                        }}
                        title="Open focused job"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {ln.description || ln.complaint || "Untitled job"}
                            </div>
                            <div className="text-xs text-neutral-400">
                              {String(ln.job_type ?? "job").replaceAll("_", " ")} •{" "}
                              {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} • Status:{" "}
                              {(ln.status ?? "awaiting").replaceAll("_", " ")}
                            </div>
                            {(ln.complaint || ln.cause || ln.correction) && (
                              <div className="text-xs text-neutral-400 mt-1 flex flex-wrap items-center gap-2">
                                {ln.complaint ? <span>Cmpl: {ln.complaint}</span> : null}
                                {ln.cause ? <span>| Cause: {ln.cause}</span> : null}
                                {ln.correction ? <span>| Corr: {ln.correction}</span> : null}
                              </div>
                            )}
                          </div>
                          <span className={chipClass(ln.status)}>
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

          {/* RIGHT rail – kept simple now that Focused modal owns actions */}
          <aside className="space-y-6">
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
              Select a job to open the focused panel with full controls.
            </div>
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
          techId={currentUserId || "system"}
          onJobAdded={fetchAll}
        />
      )}

      {/* Focused job modal (contains ALL sub-modals and actions) */}
      {focusedOpen && focusedJobId && (
        <FocusedJobModal
          isOpen={focusedOpen}
          onClose={() => setFocusedOpen(false)}
          workOrderLineId={focusedJobId}
          onChanged={fetchAll}
          mode="tech"
        />
      )}
    </div>
  );
}