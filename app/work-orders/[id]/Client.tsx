"use client";

/**
 * Work Order — ID Page (Tech/View)
 * - Reads route id with useParams().
 * - Auth-stabilized fetches: retry on 401/403/bad_jwt with refreshSession().
 * - Falls back to custom_id (case-insensitive, leading-zero tolerant).
 * - Realtime updates for WO & WO lines.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { toast } from "sonner";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import { useTabState } from "@/features/shared/hooks/useTabState";

/* ------------------------------- Types -------------------------------- */
type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];

/* --------------------------- Utilities -------------------------------- */
const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;

/** Normalize a custom id like WC00003 → {prefix:"WC", n:3}. */
function splitCustomId(raw: string): { prefix: string; n: number | null } {
  const m = raw.toUpperCase().match(/^([A-Z]+)\s*0*?(\d+)?$/);
  if (!m) return { prefix: raw.toUpperCase(), n: null };
  const n = m[2] ? parseInt(m[2], 10) : null;
  return { prefix: m[1], n: Number.isFinite(n!) ? n : null };
}

function isAuthError(e: unknown): boolean {
  if (!e) return false;
  const msg = (e as any)?.message?.toString?.() ?? "";
  const status = (e as any)?.status ?? (e as any)?.code ?? (e as any)?.statusCode;
  return (
    msg.includes("JWT") ||
    msg.includes("bad jwt") ||
    msg.includes("invalid token") ||
    status === 401 ||
    status === 403
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------- Status → Styles ---------------------------- */
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

export default function WorkOrderIdClient(): JSX.Element {
  const params = useParams();
  const routeId = (params?.id as string) || "";

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // Core entities (persist some UI state per tab)
  const [wo, setWo] = useTabState<WorkOrder | null>("wo:id:wo", null);
  const [lines, setLines] = useTabState<WorkOrderLine[]>("wo:id:lines", []);
  const [vehicle, setVehicle] = useTabState<Vehicle | null>("wo:id:veh", null);
  const [customer, setCustomer] = useTabState<Customer | null>("wo:id:cust", null);

  // UI/auth/debug state
  const [loading, setLoading] = useState(true);
  const [viewError, setViewError] = useState<string | null>(null);
  const [lastErrDetail, setLastErrDetail] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useTabState<string | null>("wo:id:uid", null);
  const [, setUserId] = useTabState<string | null>("wo:id:effectiveUid", null);

  const [showDetails, setShowDetails] = useTabState<boolean>("wo:showDetails", true);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);
  const [warnedMissing, setWarnedMissing] = useState(false);

  /* ---------------------- Auth bootstrap + listener ---------------------- */
  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        try {
          await supabase.auth.refreshSession();
        } catch {/* ignore */}
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user?.id ?? null;
        setCurrentUserId(uid);
        setUserId(uid);
      } catch {/* keep null */}
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      setUserId(uid);
      // When we *gain* a user, refetch
      if (uid) void fetchAll();
    });

    return () => {
      try { sub?.subscription.unsubscribe(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  /* ---------------------- Auth-aware fetch helper ---------------------- */
  const authFetch = useCallback(
    async <T,>(fn: () => Promise<{ data: T | null; error: any }>, label: string): Promise<T | null> => {
      let attempt = 0;
      let lastErr: any = null;

      while (attempt < 5) {
        const { data, error } = await fn();
        if (!error) {
          setLastErrDetail(null);
          return data as T;
        }

        lastErr = error;
        const detail = `${label} failed (try ${attempt + 1}/5) — ${error?.message ?? error}`;
        setLastErrDetail(detail);

        if (isAuthError(error)) {
          try { await supabase.auth.refreshSession(); } catch {/* ignore */}
          await sleep(150 * Math.pow(2, attempt)); // 150ms, 300ms, 600ms, ...
          attempt += 1;
          continue;
        }

        // Non-auth error → break immediately
        break;
      }

      throw lastErr ?? new Error(`${label} failed`);
    },
    [supabase],
  );

  /* ------------------------------ Fetch all ------------------------------ */
  const fetchAll = useCallback(async () => {
    if (!routeId) return;
    setLoading(true);
    setViewError(null);

    try {
      // 1) Load WO (by id, then by custom id with smart matching)
      let woRow = await authFetch<WorkOrder | null>(
        () => supabase.from("work_orders").select("*").eq("id", routeId).maybeSingle(),
        "Select work_order by id",
      );

      if (!woRow && !looksLikeUuid(routeId)) {
        const eq = await authFetch<WorkOrder | null>(
          () => supabase.from("work_orders").select("*").eq("custom_id", routeId).maybeSingle(),
          "Select work_order by custom_id (eq)",
        );
        woRow = eq;

        if (!woRow) {
          const ilike = await authFetch<WorkOrder | null>(
            () => supabase.from("work_orders").select("*").ilike("custom_id", routeId.toUpperCase()).maybeSingle(),
            "Select work_order by custom_id (ilike)",
          );
          woRow = ilike;
        }

        if (!woRow) {
          const { prefix, n } = splitCustomId(routeId);
          if (n !== null) {
            const cands = await authFetch<WorkOrder[] | null>(
              () => supabase.from("work_orders").select("*").ilike("custom_id", `${prefix}%`).limit(50),
              "Scan custom_id candidates",
            );
            const wanted = `${prefix}${n}`;
            const match =
              (cands ?? []).find((r) => (r.custom_id ?? "").toUpperCase().replace(/^([A-Z]+)0+/, "$1") === wanted) ||
              null;
            woRow = match;
          }
        }
      }

      if (!woRow) {
        setViewError("Work order not visible / not found.");
        setWo(null);
        setLines([]);
        setVehicle(null);
        setCustomer(null);
        return;
      }

      setWo(woRow);

      if (!warnedMissing && (!woRow.vehicle_id || !woRow.customer_id)) {
        toast.error("This work order is missing vehicle and/or customer. Open the Create form to set them.");
        setWarnedMissing(true);
      }

      // 2) Related rows (lines, vehicle, customer)
      const [linesRes, vehRes, custRes] = await Promise.all([
        authFetch<WorkOrderLine[]>(
          () =>
            supabase
              .from("work_order_lines")
              .select("*")
              .eq("work_order_id", woRow!.id)
              .order("created_at", { ascending: true }),
          "Select work_order_lines",
        ),
        woRow.vehicle_id
          ? authFetch<Vehicle | null>(
              () => supabase.from("vehicles").select("*").eq("id", woRow!.vehicle_id!).maybeSingle(),
              "Select vehicle",
            )
          : Promise.resolve(null),
        woRow.customer_id
          ? authFetch<Customer | null>(
              () => supabase.from("customers").select("*").eq("id", woRow!.customer_id!).maybeSingle(),
              "Select customer",
            )
          : Promise.resolve(null),
      ]);

      setLines(linesRes ?? []);
      setVehicle(vehRes ?? null);
      setCustomer(custRes ?? null);
      setLastErrDetail(null);
    } catch (e: any) {
      const msg = e?.message || "Failed to load work order.";
      setViewError(msg);
      setLastErrDetail(String(msg));
      // eslint-disable-next-line no-console
      console.error("[WO id page] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [routeId, supabase, authFetch, warnedMissing, setWo, setLines, setVehicle, setCustomer]);

  useEffect(() => {
    if (!routeId) return;
    void fetchAll();
  }, [fetchAll, routeId]);

  // Realtime
  useEffect(() => {
    if (!routeId) return;
    const ch = supabase
      .channel(`wo:${routeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders", filter: `id=eq.${routeId}` },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_order_lines", filter: `work_order_id=eq.${routeId}` },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(ch); } catch {/* ignore */}
    };
  }, [supabase, routeId, fetchAll]);

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
    return `text-xs px-2 py-1 rounded ${
      (statusBadge as Record<string, string>)[key] ?? "bg-gray-200 text-gray-800"
    }`;
  };

  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText = createdAt && !isNaN(createdAt.getTime()) ? format(createdAt, "PPpp") : "—";

  /* -------------------------- UI -------------------------- */
  if (!routeId) return <div className="p-6 text-red-500">Missing work order id.</div>;

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-neutral-800/60 ${className}`} />
  );

  return (
    <div className="p-4 sm:p-6 text-white">
      <PreviousPageButton to="/work-orders" />

      {/* Auth hint (iPad/Safari cookies) */}
      {!currentUserId && (
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-sm">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link href="/sign-in" className="underline hover:text-white">
            Sign In
          </Link>{" "}
          and reauthenticate, then return here.
        </div>
      )}

      {/* Debug detail (only when we have an error detail) */}
      {lastErrDetail && (
        <div className="mt-3 rounded border border-neutral-800 bg-neutral-900 p-3 text-xs text-neutral-300">
          <div className="font-semibold text-orange-400 mb-1">Debug</div>
          <div>routeId: <code className="text-neutral-400">{routeId}</code></div>
          <div>uid: <code className="text-neutral-400">{currentUserId || "null"}</code></div>
          <div className="truncate">last error: <code className="text-red-300">{lastErrDetail}</code></div>
        </div>
      )}

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

      {!loading && !wo && !viewError && (
        <div className="mt-6 text-red-500">Work order not found.</div>
      )}

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
                  <div className="truncate">{(wo as unknown as { notes?: string | null })?.notes ?? "—"}</div>
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
                        <p>
                          {[customer.first_name ?? "", customer.last_name ?? ""]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </p>
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

            {/* Jobs list */}
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

          {/* RIGHT rail */}
          <aside className="space-y-6">
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
              Select a job to open the focused panel with full controls.
            </div>
          </aside>
        </div>
      )}

      {/* Vehicle photos */}
      {vehicle?.id && (
        <div className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold">Vehicle Photos</h2>
          <VehiclePhotoUploader vehicleId={vehicle.id} />
          <VehiclePhotoGallery vehicleId={vehicle.id} currentUserId={currentUserId || "anon"} />
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

      {/* Focused job modal */}
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