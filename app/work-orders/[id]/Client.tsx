"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import dynamic from "next/dynamic";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
import { UsePartButton } from "@work-orders/components/UsePartButton";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";
import { useTabState } from "@/features/shared/hooks/useTabState";
import PartsDrawer from "@/features/parts/components/PartsDrawer";

// assign-mechanic modal
import AssignTechModal from "@/features/work-orders/components/workorders/extras/AssignTechModal";

// inspection modal
const InspectionModal = dynamic(
  () => import("@/features/inspections/components/InspectionModal"),
  { ssr: false }
);

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"] & {
    parts?: { name: string | null } | null;
  };
// new table you added
type LineTechRow =
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"];

const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;

function splitCustomId(raw: string): { prefix: string; n: number | null } {
  const m = raw.toUpperCase().match(/^([A-Z]+)\s*0*?(\d+)?$/);
  if (!m) return { prefix: raw.toUpperCase(), n: null };
  const n = m[2] ? parseInt(m[2], 10) : null;
  return { prefix: m[1], n: Number.isFinite(n!) ? n : null };
}

/* ---------------------------- Badges & Row Tints ---------------------------- */

type KnownStatus =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "new"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

const BASE_BADGE =
  "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval: "bg-blue-900/20 border-blue-500/40 text-blue-300",
  awaiting: "bg-sky-900/20  border-sky-500/40  text-sky-300",
  queued: "bg-indigo-900/20 border-indigo-500/40 text-indigo-300",
  in_progress: "bg-orange-900/20 border-orange-500/40 text-orange-300",
  on_hold: "bg-amber-900/20  border-amber-500/40  text-amber-300",
  planned: "bg-purple-900/20 border-purple-500/40 text-purple-300",
  new: "bg-neutral-800   border-neutral-600   text-neutral-200",
  completed: "bg-green-900/20  border-green-500/40 text-green-300",
  ready_to_invoice: "bg-emerald-900/20 border-emerald-500/40 text-emerald-300",
  invoiced: "bg-teal-900/20    border-teal-500/40    text-teal-300",
};

const chip = (s: string | null | undefined): string => {
  const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
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

// roles allowed to assign
const ASSIGN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

/* ------------------------------------------------------------------------- */

export default function WorkOrderIdClient(): JSX.Element {
  const params = useParams();
  const routeId = (params?.id as string) || "";

  const [wo, setWo] = useTabState<WorkOrder | null>("wo:id:wo", null);
  const [lines, setLines] = useTabState<WorkOrderLine[]>("wo:id:lines", []);
  const [vehicle, setVehicle] = useTabState<Vehicle | null>("wo:id:veh", null);
  const [customer, setCustomer] = useTabState<Customer | null>("wo:id:cust", null);

  const [allocsByLine, setAllocsByLine] = useState<Record<string, AllocationRow[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useTabState<string | null>("wo:id:uid", null);
  const [, setUserId] = useTabState<string | null>("wo:id:effectiveUid", null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [showDetails, setShowDetails] = useTabState<boolean>("wo:showDetails", true);
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);
  const [warnedMissing, setWarnedMissing] = useState(false);

  // parts
  const [partsLineId, setPartsLineId] = useState<string | null>(null);
  const [bulkQueue, setBulkQueue] = useState<string[]>([]);
  const [bulkActive, setBulkActive] = useState<boolean>(false);

  // inspection
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  // assign mechanic
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLineId, setAssignLineId] = useState<string | null>(null);
  const [assignables, setAssignables] = useState<
    Array<Pick<Profile, "id" | "full_name" | "role">>
  >([]);

  // NEW: per-line technicians (from work_order_line_technicians)
  const [lineTechsByLine, setLineTechsByLine] = useState<Record<string, string[]>>({});

  /* ---------------------- AUTH + assignables ---------------------- */
  useEffect(() => {
    let mounted = true;

    const waitForSession = async () => {
      // 1) ensure session
      let {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        for (let i = 0; i < 8; i++) {
          await new Promise((r) => setTimeout(r, 150 * (i + 1)));
          const res = await supabase.auth.getSession();
          session = res.data.session;
          if (session) break;
        }
      }

      // 2) who am I
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;

      const uid = user?.id ?? null;
      setCurrentUserId(uid);
      setUserId(uid);

      // 3) my role
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        setCurrentUserRole(prof?.role ?? null);
      }

      // 4) fetch assignable mechanics from server route (bypasses profiles RLS)
      try {
        const res = await fetch("/api/assignables");
        const json = await res.json();
        if (res.ok && Array.isArray(json.data)) {
          setAssignables(json.data);
        }
      } catch {
        // ignore, modal will try to self-load
      }

      if (!uid) setLoading(false);
    };

    void waitForSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (s?.user) void waitForSession();
      else {
        setCurrentUserId(null);
        setUserId(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [supabase, routeId, setCurrentUserId, setUserId]);

  /* ---------------------- FETCH ---------------------- */
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!routeId) return;
      setLoading(true);
      setViewError(null);

      try {
        let woRow: WorkOrder | null = null;

        // by UUID
        if (looksLikeUuid(routeId)) {
          const { data, error } = await supabase
            .from("work_orders")
            .select("*")
            .eq("id", routeId)
            .maybeSingle();
          if (!error) woRow = (data as WorkOrder | null) ?? null;
        }

        // by custom_id
        if (!woRow) {
          const eqRes = await supabase
            .from("work_orders")
            .select("*")
            .eq("custom_id", routeId)
            .maybeSingle();
          woRow = (eqRes.data as WorkOrder | null) ?? null;

          if (!woRow) {
            const ilikeRes = await supabase
              .from("work_orders")
              .select("*")
              .ilike("custom_id", routeId.toUpperCase())
              .maybeSingle();
            woRow = (ilikeRes.data as WorkOrder | null) ?? null;
          }

          if (!woRow) {
            const { prefix, n } = splitCustomId(routeId);
            if (n !== null) {
              const { data: cands } = await supabase
                .from("work_orders")
                .select("*")
                .ilike("custom_id", `${prefix}%`)
                .limit(50);
              const wanted = `${prefix}${n}`;
              const match = (cands ?? []).find(
                (r) =>
                  (r.custom_id ?? "")
                    .toUpperCase()
                    .replace(/^([A-Z]+)0+/, "$1") === wanted
              );
              if (match) woRow = match as WorkOrder;
            }
          }
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
          setAllocsByLine({});
          setLineTechsByLine({});
          setLoading(false);
          return;
        }

        setWo(woRow);

        if (!warnedMissing && (!woRow.vehicle_id || !woRow.customer_id)) {
          toast.error(
            "This work order is missing vehicle and/or customer. Open the Create form to set them."
          );
          setWarnedMissing(true);
        }

        const [linesRes, vehRes, custRes] = await Promise.all([
          supabase
            .from("work_order_lines")
            .select("*")
            .eq("work_order_id", woRow.id)
            .order("created_at", { ascending: true }),
          woRow.vehicle_id
            ? supabase
                .from("vehicles")
                .select("*")
                .eq("id", woRow.vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as const),
          woRow.customer_id
            ? supabase
                .from("customers")
                .select("*")
                .eq("id", woRow.customer_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as const),
        ]);

        if (linesRes.error) throw linesRes.error;
        const lineRows = (linesRes.data ?? []) as WorkOrderLine[];
        setLines(lineRows);

        if (vehRes?.error) throw vehRes.error;
        setVehicle((vehRes?.data as Vehicle | null) ?? null);

        if (custRes?.error) throw custRes.error;
        setCustomer((custRes?.data as Customer | null) ?? null);

        // allocations
        if (lineRows.length) {
          const [allocsQuery, lineTechsQuery] = await Promise.all([
            supabase
              .from("work_order_part_allocations")
              .select("*, parts(name)")
              .in(
                "work_order_line_id",
                lineRows.map((l) => l.id)
              ),
            // NEW: fetch technicians per line
            supabase
              .from("work_order_line_technicians")
              .select("work_order_line_id, technician_id")
              .in(
                "work_order_line_id",
                lineRows.map((l) => l.id)
              ),
          ]);

          const byLine: Record<string, AllocationRow[]> = {};
          (allocsQuery.data ?? []).forEach((a) => {
            const key = (a as AllocationRow).work_order_line_id;
            if (!byLine[key]) byLine[key] = [];
            byLine[key].push(a as AllocationRow);
          });
          setAllocsByLine(byLine);

          const techMap: Record<string, string[]> = {};
          (lineTechsQuery.data as LineTechRow[] | null)?.forEach((lt) => {
            const lnId = lt.work_order_line_id;
            const techId = lt.technician_id;
            if (!techMap[lnId]) techMap[lnId] = [];
            if (!techMap[lnId].includes(techId)) techMap[lnId].push(techId);
          });
          setLineTechsByLine(techMap);
        } else {
          setAllocsByLine({});
          setLineTechsByLine({});
        }
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to load work order.";
        setViewError(msg);
        console.error("[WO id page] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [
      supabase,
      routeId,
      warnedMissing,
      setWo,
      setLines,
      setVehicle,
      setCustomer,
    ]
  );

  useEffect(() => {
    if (!routeId || !currentUserId) return;
    void fetchAll();
  }, [fetchAll, routeId, currentUserId]);

  /* ---------------------- REALTIME ---------------------- */
  useEffect(() => {
    if (!wo?.id) return;

    const ch = supabase
      .channel(`wo:${wo.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders", filter: `id=eq.${wo.id}` },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchAll()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_part_allocations",
        },
        () => fetchAll()
      )
      // also listen for technicians table if you want live updates
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_line_technicians",
        },
        () => fetchAll()
      )
      .subscribe();

    const local = () => fetchAll();
    window.addEventListener("wo:parts-used", local);

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
      window.removeEventListener("wo:parts-used", local);
    };
  }, [supabase, wo?.id, fetchAll]);

  /* ----------------------- Derived data ----------------------- */
  const approvalPending = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) === "pending"),
    [lines]
  );

  const activeJobLines = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) !== "pending"),
    [lines]
  );

  const sortedLines = useMemo(() => {
    const pr: Record<string, number> = {
      diagnosis: 1,
      inspection: 2,
      maintenance: 3,
      repair: 4,
    };
    return [...activeJobLines].sort((a, b) => {
      const pa = pr[String(a.job_type ?? "repair")] ?? 999;
      const pb = pr[String(b.job_type ?? "repair")] ?? 999;
      if (pa !== pb) return pa - pb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }, [activeJobLines]);

  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText =
    createdAt && !isNaN(createdAt.getTime())
      ? format(createdAt, "PPpp")
      : "—";

  const canAssign = currentUserRole ? ASSIGN_ROLES.has(currentUserRole) : false;

  // quick lookup for tech names
  const assignablesById = useMemo(() => {
    const m: Record<string, { full_name: string | null; role: string | null }> = {};
    assignables.forEach((a) => {
      m[a.id] = { full_name: a.full_name, role: a.role };
    });
    return m;
  }, [assignables]);

  /* ----------------------- Actions ----------------------- */

  const approveLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          approval_state: "approved",
          status: "queued",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);
      if (error) return toast.error(error.message);
      toast.success("Line approved");
      void fetchAll();
    },
    [supabase, fetchAll]
  );

  const declineLine = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          approval_state: "declined",
          status: "awaiting",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);
      if (error) return toast.error(error.message);
      toast.success("Line declined");
      void fetchAll();
    },
    [supabase, fetchAll]
  );

  const sendToParts = useCallback(
    async (lineId: string) => {
      if (!lineId) return;
      const { error } = await supabase
        .from("work_order_lines")
        .update({
          status: "on_hold",
          hold_reason: "Awaiting parts quote",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);
      if (error) return toast.error(error.message);
      setPartsLineId(lineId);
      toast.success("Sent to parts for quoting");
    },
    [supabase]
  );

  const sendAllPendingToParts = useCallback(async () => {
    if (!approvalPending.length) return;
    const ids = approvalPending.map((l) => l.id);
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        status: "on_hold",
        hold_reason: "Awaiting parts quote",
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBulkQueue(ids);
    setBulkActive(true);
    setPartsLineId(ids[0] ?? null);
    toast.success("Queued all pending lines for parts quoting");
  }, [approvalPending, supabase]);

  // open inspection
  const openInspectionForLine = useCallback(
    async (ln: WorkOrderLine) => {
      if (!ln?.id) return;

      const desc = String(ln.description ?? "").toLowerCase();
      const isAir = /\bair\b|cvip|push\s*rod|air\s*brake/.test(desc);
      const isCustom = /\bcustom\b|\bbuilder\b|\bprompt\b|\bad[-\s]?hoc\b/.test(
        desc
      );

      let templateSlug = isAir ? "maintenance50-air" : "maintenance50";
      if (isCustom) {
        templateSlug = "custom:pending";
      }

      try {
        const res = await fetch("/api/inspections/session/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: wo?.id ?? null,
            workOrderLineId: ln.id,
            vehicleId: vehicle?.id ?? null,
            customerId: customer?.id ?? null,
            template: templateSlug,
          }),
        });

        const j = (await res.json().catch(() => null)) as
          | { sessionId?: string; error?: string }
          | null;

        if (!res.ok || !j?.sessionId) {
          throw new Error(j?.error || "Failed to create inspection session");
        }

        if (isCustom) {
          templateSlug = `custom:${j.sessionId}`;
        }

        const sp = new URLSearchParams();
        if (wo?.id) sp.set("workOrderId", wo.id);
        sp.set("workOrderLineId", ln.id);
        sp.set("inspectionId", j.sessionId);
        sp.set("template", templateSlug);
        sp.set("embed", "1");
        if (isCustom && ln.description)
          sp.set("seed", String(ln.description));

        const url = `/inspection/${templateSlug}?${sp.toString()}`;

        setInspectionSrc(url);
        setInspectionOpen(true);
        toast.success("Inspection opened");
      } catch (e) {
        const err = e as { message?: string };
        toast.error(err?.message ?? "Unable to open inspection");
      }
    },
    [wo?.id, vehicle?.id, customer?.id]
  );

  // parts drawer close / bulk
  useEffect(() => {
    if (!partsLineId) return;

    const evtName = `parts-drawer:closed:${partsLineId}`;

    const handler = () => {
      if (bulkActive && bulkQueue.length > 0) {
        const [, ...rest] = bulkQueue;
        setBulkQueue(rest);
        setPartsLineId(rest[0] ?? null);
        if (rest.length === 0) {
          setBulkActive(false);
          void fetchAll();
        }
      } else {
        setPartsLineId(null);
        void fetchAll();
      }
    };

    window.addEventListener(evtName, handler as EventListener);
    return () => window.removeEventListener(evtName, handler as EventListener);
  }, [partsLineId, bulkActive, bulkQueue, fetchAll]);

  /* -------------------------- UI -------------------------- */
  if (!routeId)
    return <div className="p-6 text-red-500">Missing work order id.</div>;

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-neutral-800/60 ${className}`} />
  );

  return (
    <div className="p-4 sm:p-6 text-white">
      <VoiceContextSetter
        currentView="work_order_page"
        workOrderId={wo?.id}
        vehicleId={vehicle?.id}
        customerId={customer?.id}
        lineId={null}
      />

      <PreviousPageButton to="/work-orders" />

      {!currentUserId && (
        <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200 text-sm">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link href="/sign-in" className="underline hover:text-white">
            Sign In
          </Link>{" "}
          and return here.
        </div>
      )}

      {viewError && (
        <div className="mt-4 whitespace-pre-wrap rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300">
          {viewError}
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
        </div>
      ) : !wo ? (
        <div className="mt-6 text-red-500">Work order not found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-semibold">
                    Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}
                  </h1>
                  <span className={chip(wo.status)}>
                    {(wo.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>
              </div>

              <div className="mt-2 grid gap-2 text-sm text-neutral-300 sm:grid-cols-4">
                <div>
                  <div className="text-neutral-400">Created</div>
                  <div>{createdAtText}</div>
                </div>
                <div>
                  <div className="text-neutral-400">WO ID</div>
                  <div className="truncate">{wo.id}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Custom ID</div>
                  <div className="truncate">{wo.custom_id ?? "—"}</div>
                </div>
                <div>
                  <div className="text-neutral-400">Status</div>
                  <div>
                    <span className={chip(wo.status)}>
                      {(wo.status ?? "awaiting").replaceAll("_", " ")}
                    </span>
                  </div>
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
                          {(vehicle.year ?? "").toString()}{" "}
                          {vehicle.make ?? ""} {vehicle.model ?? ""}
                        </p>
                        <p className="text-sm text-neutral-400">
                          VIN: {vehicle.vin ?? "—"} • Plate:{" "}
                          {vehicle.license_plate ?? "—"}
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
                          {[
                            customer.first_name ?? "",
                            customer.last_name ?? "",
                          ]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </p>
                        <p className="text-sm text-neutral-400">
                          {customer.phone ?? "—"}{" "}
                          {customer.email ? `• ${customer.email}` : ""}
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

            {/* Awaiting Customer Approval */}
            <div className="rounded border border-blue-900/40 bg-neutral-950 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-blue-300">
                  Awaiting Customer Approval
                </h2>
                {approvalPending.length > 1 && (
                  <button
                    type="button"
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
                    onClick={sendAllPendingToParts}
                    title="Queue all lines for parts quoting"
                  >
                    Quote all pending lines
                  </button>
                )}
              </div>

              {approvalPending.length === 0 ? (
                <p className="text-sm text-neutral-400">
                  No lines waiting for approval.
                </p>
              ) : (
                <div className="space-y-2">
                  {approvalPending.map((ln, idx) => (
                    <div
                      key={ln.id}
                      className="rounded border border-neutral-800 bg-neutral-900 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {idx + 1}.{" "}
                            {ln.description || ln.complaint || "Untitled job"}
                          </div>
                          <div className="text-xs text-neutral-400">
                            {String(ln.job_type ?? "job").replaceAll("_", " ")}{" "}
                            •{" "}
                            {typeof ln.labor_time === "number"
                              ? `${ln.labor_time}h`
                              : "—"}{" "}
                            • Status:{" "}
                            {(ln.status ?? "awaiting").replaceAll("_", " ")} •
                            Approval:{" "}
                            {(ln.approval_state ?? "pending").replaceAll(
                              "_",
                              " "
                            )}
                          </div>
                          {ln.notes && (
                            <div className="mt-1 text-xs text-neutral-400">
                              Notes: {ln.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded border border-green-700 px-2 py-1 text-xs text-green-300 hover:bg-green-900/20"
                            onClick={() => approveLine(ln.id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="rounded border border-red-700 px-2 py-1 text-xs text-red-300 hover:bg-red-900/20"
                            onClick={() => declineLine(ln.id)}
                          >
                            Decline
                          </button>
                          <button
                            type="button"
                            className="rounded border border-blue-700 px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/20"
                            onClick={() => sendToParts(ln.id)}
                            title="Send to parts for quoting"
                          >
                            Send to Parts
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Jobs list */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  Jobs in this Work Order
                </h2>
              </div>

              {sortedLines.length === 0 ? (
                <p className="text-sm text-neutral-400">No lines yet.</p>
              ) : (
                <div className="space-y-2">
                  {sortedLines.map((ln, idx) => {
                    const statusKey = (ln.status ?? "awaiting")
                      .toLowerCase()
                      .replaceAll(" ", "_");
                    const borderCls =
                      statusBorder[statusKey] ||
                      "border-l-4 border-gray-400";
                    const tintCls =
                      statusRowTint[statusKey] || "bg-neutral-950";
                    const punchedIn =
                      !!ln.punched_in_at && !ln.punched_out_at;

                    const partsForLine = allocsByLine[ln.id] ?? [];

                    // line-level techs from the join table
                    const lineTechIds = lineTechsByLine[ln.id] ?? [];

                    // optional: include the single-column assignment first if present
                    const primaryId =
                      typeof ln.assigned_to === "string"
                        ? (ln.assigned_to as string)
                        : null;

                    // build ordered, unique list: primary first, then others
                    const orderedTechIds: string[] = [];
                    if (primaryId) orderedTechIds.push(primaryId);
                    lineTechIds.forEach((tid) => {
                      if (!orderedTechIds.includes(tid)) {
                        orderedTechIds.push(tid);
                      }
                    });

                    return (
                      <div
                        key={ln.id}
                        className={`rounded border border-neutral-800 ${tintCls} p-3 ${borderCls} ${
                          punchedIn ? "ring-2 ring-orange-500" : ""
                        }`}
                        title="Open focused job"
                        onClick={() => {
                          setFocusedJobId(ln.id);
                          setFocusedOpen(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate font-medium">
                                {idx + 1}.{" "}
                                {ln.description ||
                                  ln.complaint ||
                                  "Untitled job"}
                              </div>
                              {ln.job_type === "inspection" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openInspectionForLine(ln);
                                  }}
                                  className="rounded border border-orange-400 px-2 py-0.5 text-xs text-orange-200 hover:bg-orange-500/10"
                                >
                                  Open inspection
                                </button>
                              )}
                              {canAssign && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssignLineId(ln.id);
                                    setAssignOpen(true);
                                  }}
                                  className="rounded border border-sky-500/70 px-2 py-0.5 text-xs text-sky-200 hover:bg-sky-900/20"
                                  title="Assign mechanic to this line"
                                >
                                  Assign mechanic
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-neutral-400">
                              {String(ln.job_type ?? "job").replaceAll("_", " ")}{" "}
                              •{" "}
                              {typeof ln.labor_time === "number"
                                ? `${ln.labor_time}h`
                                : "—"}{" "}
                              • Status:{" "}
                              {(ln.status ?? "awaiting").replaceAll("_", " ")}
                            </div>

                            {/* NEW: show all techs for this line */}
                            {orderedTechIds.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {orderedTechIds.map((tid) => {
                                  const info = assignablesById[tid];
                                  const label = info?.full_name ?? "Mechanic";
                                  return (
                                    <span
                                      key={tid}
                                      className="inline-flex items-center gap-1 rounded bg-sky-900/30 px-2 py-0.5 text-[10px] text-sky-100"
                                    >
                                      <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {(ln.complaint || ln.cause || ln.correction) && (
                              <div className="text-xs text-neutral-400 mt-1 flex flex-wrap items-center gap-2">
                                {ln.complaint ? (
                                  <span>Cmpl: {ln.complaint}</span>
                                ) : null}
                                {ln.cause ? (
                                  <span>| Cause: {ln.cause}</span>
                                ) : null}
                                {ln.correction ? (
                                  <span>| Corr: {ln.correction}</span>
                                ) : null}
                              </div>
                            )}

                            {/* Parts used */}
                            <div className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-2">
                              <div className="mb-1 flex items-center justify-between">
                                <div className="text-xs font-semibold text-neutral-300">
                                  Parts used
                                </div>
                                <div className="shrink-0">
                                  <UsePartButton
                                    workOrderLineId={ln.id}
                                    onApplied={() =>
                                      window.dispatchEvent(
                                        new CustomEvent("wo:parts-used")
                                      )
                                    }
                                    // renamed per your earlier request
                                    label="Add part"
                                  />
                                </div>
                              </div>
                              {partsForLine.length ? (
                                <ul className="divide-y divide-neutral-800 rounded border border-neutral-800 text-sm">
                                  {partsForLine.map((a) => (
                                    <li
                                      key={a.id}
                                      className="flex items-center justify-between p-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="truncate">
                                          {a.parts?.name ?? "Part"}
                                        </div>
                                        <div className="text-xs text-neutral-500">
                                          loc {String(a.location_id).slice(0, 6)}
                                          …
                                        </div>
                                      </div>
                                      <div className="pl-3 font-semibold">
                                        × {a.qty}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-xs text-neutral-500">
                                  No parts used yet.
                                </div>
                              )}
                            </div>
                          </div>

                          <span className={chip(ln.status)}>
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
          <VehiclePhotoGallery
            vehicleId={vehicle.id}
            currentUserId={currentUserId || "anon"}
          />
        </div>
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

      {/* Parts Drawer */}
      {partsLineId && wo?.id && (
        <PartsDrawer
          open={!!partsLineId}
          workOrderId={wo.id}
          workOrderLineId={partsLineId}
          vehicleSummary={
            vehicle
              ? {
                  year: (
                    vehicle.year as string | number | null
                  )?.toString() ?? null,
                  make: vehicle.make ?? null,
                  model: vehicle.model ?? null,
                }
              : null
          }
          jobDescription={
            lines.find((l) => l.id === partsLineId)?.description ??
            lines.find((l) => l.id === partsLineId)?.complaint ??
            null
          }
          jobNotes={
            lines.find((l) => l.id === partsLineId)?.notes ?? null
          }
          closeEventName={`parts-drawer:closed:${partsLineId}`}
        />
      )}

      {/* Inspection modal */}
      {inspectionOpen && inspectionSrc && (
        <InspectionModal
          open={inspectionOpen}
          src={inspectionSrc}
          title="Inspection"
          onClose={() => setInspectionOpen(false)}
        />
      )}

      {/* Assign mechanic modal — now with mechanics passed in */}
      {assignOpen && assignLineId && (
        <AssignTechModal
          isOpen={assignOpen}
          onClose={() => setAssignOpen(false)}
          workOrderLineId={assignLineId}
          mechanics={assignables}
          onAssigned={async () => {
            await fetchAll();
          }}
        />
      )}

      <VoiceButton />
    </div>
  );
}