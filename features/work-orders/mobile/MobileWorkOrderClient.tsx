// app/work-orders/mobile/MobileWorkOrderClient.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import VoiceContextSetter from "@/features/shared/voice/VoiceContextSetter";
import VoiceButton from "@/features/shared/voice/VoiceButton";
import { useTabState } from "@/features/shared/hooks/useTabState";
import { JobCard } from "@/features/work-orders/components/JobCard";
import MobileFocusedJob from "@/features/work-orders/mobile/MobileFocusedJob";
import InspectionModal from "@/features/inspections/components/InspectionModal";
import { loadInspectionSession } from "@/features/inspections/unified/data/loadSession";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type WorkOrderQuoteLine =
  DB["public"]["Tables"]["work_order_quote_lines"]["Row"];

const looksLikeUuid = (s: string) => s.includes("-") && s.length >= 36;

function splitCustomId(raw: string): { prefix: string; n: number | null } {
  const m = raw.toUpperCase().match(/^([A-Z]+)\s*0*?(\d+)?$/);
  if (!m) return { prefix: raw.toUpperCase(), n: null };
  const n = m[2] ? parseInt(m[2], 10) : null;
  return { prefix: m[1], n: Number.isFinite(n!) ? n : null };
}

/* ---------------------------- Badges ---------------------------- */

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
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-wide";

const BADGE: Record<KnownStatus, string> = {
  awaiting_approval:
    "bg-sky-900/30 border-sky-400/60 text-sky-200 shadow-[0_0_18px_rgba(56,189,248,0.35)]",
  awaiting:
    "bg-slate-900/40 border-slate-400/60 text-slate-200 shadow-[0_0_18px_rgba(148,163,184,0.25)]",
  queued:
    "bg-indigo-900/30 border-indigo-400/70 text-indigo-200 shadow-[0_0_18px_rgba(129,140,248,0.40)]",
  in_progress:
    "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.32),rgba(15,23,42,0.9))] border-[color:var(--accent-copper-soft)] text-[color:var(--accent-copper-light)] shadow-[0_0_20px_rgba(248,113,22,0.50)]",
  on_hold:
    "bg-amber-950/40 border-amber-400/70 text-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
  planned:
    "bg-purple-950/40 border-purple-400/70 text-purple-200 shadow-[0_0_18px_rgba(147,51,234,0.40)]",
  new:
    "bg-neutral-900/80 border-neutral-500/70 text-neutral-200 shadow-[0_0_14px_rgba(148,163,184,0.28)]",
  completed:
    "bg-emerald-950/50 border-emerald-400/70 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.55)]",
  ready_to_invoice:
    "bg-emerald-950/40 border-emerald-400/80 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.55)]",
  invoiced:
    "bg-teal-950/40 border-teal-400/80 text-teal-200 shadow-[0_0_20px_rgba(45,212,191,0.55)]",
};

const chip = (s: string | null | undefined): string => {
  const key = (s ?? "awaiting")
    .toLowerCase()
    .replaceAll(" ", "_") as KnownStatus;
  return `${BASE_BADGE} ${BADGE[key] ?? BADGE.awaiting}`;
};

/* ------------------------------------------------------------------------- */

export default function MobileWorkOrderClient({
  routeId,
}: {
  routeId: string;
}): JSX.Element {
  const [wo, setWo] = useTabState<WorkOrder | null>("m:wo:id:wo", null);
  const [lines, setLines] = useTabState<WorkOrderLine[]>(
    "m:wo:id:lines",
    [],
  );
  const [quoteLines, setQuoteLines] = useTabState<WorkOrderQuoteLine[]>(
    "m:wo:id:quoteLines",
    [],
  );
  const [vehicle, setVehicle] = useTabState<Vehicle | null>(
    "m:wo:id:veh",
    null,
  );
  const [customer, setCustomer] = useTabState<Customer | null>(
    "m:wo:id:cust",
    null,
  );

  const [loading, setLoading] = useState<boolean>(false);
  const [viewError, setViewError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useTabState<string | null>(
    "m:wo:id:uid",
    null,
  );
  const [, setUserId] = useTabState<string | null>(
    "m:wo:id:effectiveUid",
    null,
  );
  const [, setCurrentUserRole] = useState<string | null>(null);

  const [showDetails, setShowDetails] = useTabState<boolean>(
    "m:wo:showDetails",
    true,
  );
  const [warnedMissing, setWarnedMissing] = useState(false);

  // mobile focused job view
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);

  // unified inspection modal state
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [inspectionSrc, setInspectionSrc] = useState<string | null>(null);

  /* ---------------------- AUTH ---------------------- */
  useEffect(() => {
    let mounted = true;

    const waitForSession = async () => {
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

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;

      const uid = user?.id ?? null;
      setCurrentUserId(uid);
      setUserId(uid);

      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        setCurrentUserRole(prof?.role ?? null);
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
  }, [routeId, setCurrentUserId, setUserId]);

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
                    .replace(/^([A-Z]+)0+/, "$1") === wanted,
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
          setQuoteLines([]);
          setVehicle(null);
          setCustomer(null);
          setLoading(false);
          return;
        }

        setWo(woRow);

        if (!warnedMissing && (!woRow.vehicle_id || !woRow.customer_id)) {
          toast.error(
            "This work order is missing vehicle and/or customer. Open the Create form to set them.",
          );
          setWarnedMissing(true);
        }

        const [linesRes, vehRes, custRes, quotesRes] = await Promise.all([
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
          supabase
            .from("work_order_quote_lines")
            .select("*")
            .eq("work_order_id", woRow.id)
            .order("created_at", { ascending: true }),
        ]);

        if (linesRes.error) throw linesRes.error;
        const lineRows = (linesRes.data ?? []) as WorkOrderLine[];
        setLines(lineRows);

        if (quotesRes.error) throw quotesRes.error;
        setQuoteLines(
          (quotesRes.data as WorkOrderQuoteLine[] | null) ?? [],
        );

        if (vehRes?.error) throw vehRes.error;
        setVehicle((vehRes?.data as Vehicle | null) ?? null);

        if (custRes?.error) throw custRes.error;
        setCustomer((custRes?.data as Customer | null) ?? null);
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : "Failed to load work order.";
        setViewError(msg);
        // eslint-disable-next-line no-console
        console.error("[Mobile WO id page] load error:", e);
      } finally {
        setLoading(false);
      }
    },
    [
      routeId,
      warnedMissing,
      setWo,
      setLines,
      setQuoteLines,
      setVehicle,
      setCustomer,
    ],
  );

  useEffect(() => {
    if (!routeId || !currentUserId) return;
    void fetchAll();
  }, [fetchAll, routeId, currentUserId]);

  /* ---------------------- REALTIME ---------------------- */
  useEffect(() => {
    if (!wo?.id) return;

    const ch = supabase
      .channel(`m:wo:${wo.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_orders",
          filter: `id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_order_quote_lines",
          filter: `work_order_id=eq.${wo.id}`,
        },
        () => fetchAll(),
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        //
      }
    };
  }, [wo?.id, fetchAll]);

  // 🔁 refresh when a parts request or inspection completes
  useEffect(() => {
    const handleParts = () => {
      void fetchAll();
    };
    const handleInspectionCompleted = (
      ev: CustomEvent<{
        workOrderLineId?: string;
        cause?: string;
        correction?: string;
      }>,
    ) => {
      const d = ev.detail || {};
      const lineId = d.workOrderLineId;
      if (!lineId) return;

      setFocusedJobId(lineId);
      setFocusedOpen(true);

      // legacy event for desktop flow – harmless if unused on mobile
      window.dispatchEvent(
        new CustomEvent("wo:prefill-cause-correction", {
          detail: {
            lineId,
            cause: d.cause ?? "",
            correction: d.correction ?? "",
          },
        }),
      );
    };

    window.addEventListener("parts-request:submitted", handleParts);
    window.addEventListener(
      "inspection:completed",
      handleInspectionCompleted as EventListener,
    );

    return () => {
      window.removeEventListener("parts-request:submitted", handleParts);
      window.removeEventListener(
        "inspection:completed",
        handleInspectionCompleted as EventListener,
      );
    };
  }, [fetchAll]);

  /* ----------------------- Derived data ----------------------- */
  const approvalPending = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) === "pending"),
    [lines],
  );

  const quotePending = useMemo(
    () => quoteLines.filter((q) => q.status !== "converted"),
    [quoteLines],
  );

  const activeJobLines = useMemo(
    () => lines.filter((l) => (l.approval_state ?? null) !== "pending"),
    [lines],
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
    createdAt && !Number.isNaN(createdAt.getTime())
      ? format(createdAt, "PPpp")
      : "—";

  const canAssign = false; // assignments handled in focused view / desktop

  /* ----------------------- line & quote actions ----------------------- */

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
    [fetchAll],
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
    [fetchAll],
  );

  const sendToParts = useCallback(async (lineId: string) => {
    if (!lineId) return;
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        status: "on_hold",
        hold_reason: "Awaiting parts quote",
      } as DB["public"]["Tables"]["work_order_lines"]["Update"])
      .eq("id", lineId);
    if (error) return toast.error(error.message);
    toast.success("Sent to parts for quoting");
  }, []);

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
    toast.success("Queued all pending lines for parts quoting");
  }, [approvalPending]);

  const authorizeQuote = useCallback(
    async (quoteId: string) => {
      if (!quoteId) return;
      try {
        const res = await fetch(
          `/api/work-orders/quotes/${quoteId}/authorize`,
          {
            method: "POST",
          },
        );
        const j = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(j?.error || "Failed to authorize quote line");
        }
        toast.success("Quote authorized and added as job line");
        void fetchAll();
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : "Failed to authorize quote line",
        );
      }
    },
    [fetchAll],
  );

  const declineQuote = useCallback(
    async (quoteId: string) => {
      if (!quoteId) return;
      const { error } = await supabase
        .from("work_order_quote_lines")
        .update({ status: "declined" })
        .eq("id", quoteId);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Quote declined");
      void fetchAll();
    },
    [fetchAll],
  );

  /* ----------------------- helpers ----------------------- */

  // 🔗 Open unified inspection screen in the modal (new unified stack)
  const openInspection = useCallback(
    async (line: WorkOrderLine) => {
      if (!wo?.id) return;

      const anyLine = line as any;

      // Prefer explicit template slug/name from metadata
      const templateSlug: string | null =
        anyLine?.inspection_template ??
        anyLine?.inspectionTemplate ??
        anyLine?.template ??
        anyLine?.metadata?.inspection_template ??
        anyLine?.metadata?.template ??
        null;

      if (!templateSlug) {
        toast.error(
          "This job line doesn't have an inspection template attached yet.",
        );
        return;
      }

      // Try to load an existing unified session for this line
      let existing: InspectionSession | null = null;
      try {
        existing = await loadInspectionSession(line.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.debug("mobile loadInspectionSession error", err);
      }

      const params = new URLSearchParams({
        workOrderId: wo.id,
        workOrderLineId: line.id,
        template: templateSlug,
        embed: "1",
        view: "mobile",
      });

      if (wo.vehicle_id) params.set("vehicleId", wo.vehicle_id);
      if (wo.customer_id) params.set("customerId", wo.customer_id);
      if (line.description) params.set("seed", String(line.description));
      if (existing?.id) params.set("sessionId", existing.id);

      const url = `/inspections/unified/run?${params.toString()}`;

      setInspectionSrc(url);
      setInspectionOpen(true);
    },
    [wo],
  );

  /* ----------------------- mobile focused job view ----------------------- */

  if (focusedOpen && focusedJobId) {
    return (
      <MobileFocusedJob
        workOrderLineId={focusedJobId}
        onBack={() => setFocusedOpen(false)}
        onChanged={fetchAll}
        mode="tech"
      />
    );
  }

  /* -------------------------- UI -------------------------- */
  if (!routeId)
    return <div className="p-6 text-red-400">Missing work order id.</div>;

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div
      className={`animate-pulse rounded-2xl bg-neutral-900/70 backdrop-blur-md ${className}`}
    />
  );

  const hasAnyPending = approvalPending.length > 0 || quotePending.length > 0;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col bg-transparent px-3 py-4 text-white">
      <VoiceContextSetter
        currentView="work_order_page_mobile"
        workOrderId={wo?.id}
        vehicleId={vehicle?.id}
        customerId={customer?.id}
        lineId={null}
      />

      {/* header bar */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <PreviousPageButton to="/mobile/work-orders" />
        {wo?.custom_id && (
          <span className="rounded-full border border-white/12 bg-black/40 px-3 py-1 text-[11px] text-neutral-300 backdrop-blur">
            Internal ID:{" "}
            <span className="font-mono text-neutral-100">
              {wo.id.slice(0, 8)}
            </span>
          </span>
        )}
      </div>

      {!currentUserId && (
        <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-950/40 px-3 py-3 text-xs text-amber-100 backdrop-blur">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link
            href="/sign-in"
            className="underline decoration-dotted underline-offset-2 hover:text-white"
          >
            Sign In
          </Link>{" "}
          and return here.
        </div>
      )}

      {viewError && (
        <div className="mb-4 whitespace-pre-wrap rounded-2xl border border-red-500/50 bg-red-950/70 px-3 py-3 text-xs text-red-100 backdrop-blur">
          {viewError}
        </div>
      )}

      {loading ? (
        <div className="mt-4 grid gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-32" />
          <Skeleton className="h-40" />
        </div>
      ) : !wo ? (
        <div className="mt-4 text-sm text-red-300">
          Work order not found.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header card */}
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.85)] backdrop-blur-md">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold sm:text-xl">
                    Work Order{" "}
                    <span className="text-[color:var(--accent-copper-light)]">
                      {wo.custom_id || `#${wo.id.slice(0, 8)}`}
                    </span>
                  </h1>
                  <span className={chip(wo.status)}>
                    {(wo.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Created {createdAtText}
                </p>
              </div>
            </div>

            <div className="mt-3 grid gap-3 text-[11px] text-neutral-300 sm:grid-cols-2">
              <div>
                <div className="text-neutral-500">Created</div>
                <div>{createdAtText}</div>
              </div>
              <div>
                <div className="text-neutral-500">WO ID</div>
                <div className="truncate font-mono text-[11px] text-neutral-200">
                  {wo.id}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Custom ID</div>
                <div className="truncate">
                  {wo.custom_id ?? (
                    <span className="text-neutral-500">Not set</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-neutral-500">Status</div>
                <div className="mt-0.5">
                  <span className={chip(wo.status)}>
                    {(wo.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle & Customer */}
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 shadow-[0_14px_36px_rgba(0,0,0,0.80)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold sm:text;base">
                Vehicle &amp; Customer
              </h2>
              <button
                type="button"
                className="text-[11px] font-medium text-[color:var(--accent-copper-light)] underline-offset-2 hover:underline"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            </div>

            {showDetails && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Vehicle
                  </h3>
                  {vehicle ? (
                    <>
                      <p className="text-sm font-medium text-white">
                        {(vehicle.year ?? "").toString()} {vehicle.make ?? ""}{" "}
                        {vehicle.model ?? ""}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        VIN:{" "}
                        <span className="font-mono">
                          {vehicle.vin ?? "—"}
                        </span>
                        <br />
                        Plate:{" "}
                        {vehicle.license_plate ?? (
                          <span className="text-neutral-500">—</span>
                        )}
                        <br />
                        Mileage:{" "}
                        {vehicle.mileage ?? (
                          <span className="text-neutral-500">—</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No vehicle linked yet.
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Customer
                  </h3>
                  {customer ? (
                    <>
                      <p className="text-sm font-medium text:white">
                        {[
                          customer.first_name ?? "",
                          customer.last_name ?? "",
                        ]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </p>
                      <p className="mt-1 text-[11px] text-neutral-400">
                        {customer.phone ?? "—"}{" "}
                        {customer.email ? (
                          <>
                            <span className="mx-1 text-neutral-600">•</span>
                            {customer.email}
                          </>
                        ) : null}
                      </p>
                      {customer.id && (
                        <Link
                          href={`/mobile/work-orders/${wo.id}/vehicle`}
                          className="mt-2 inline-flex text-[11px] font-medium text-[color:var(--accent-copper-light)] underline-offset-2 hover:underline"
                          title="Open customer profile"
                        >
                          View customer profile →
                        </Link>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No customer linked yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Awaiting Customer Approval */}
          <div className="rounded-2xl border border-slate-600/60 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.20),rgba(15,23,42,0.98)),radial-gradient(circle_at_bottom,_rgba(15,23,42,1),#020617_85%)] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.95)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-sky-100 sm:text-base">
                Awaiting customer approval
              </h2>
              {approvalPending.length > 1 && (
                <button
                  type="button"
                  className="rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.65)] hover:bg-sky-400"
                  onClick={sendAllPendingToParts}
                  title="Queue all lines for parts quoting"
                >
                  Quote all pending lines
                </button>
              )}
            </div>

            {!hasAnyPending ? (
              <p className="text-xs text-slate-200/75">
                No lines waiting for approval.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Job lines needing approval */}
                {approvalPending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/90">
                      Jobs awaiting approval
                    </div>
                    {approvalPending.map((ln, idx) => {
                      const isAwaitingParts =
                        (ln.status === "on_hold" &&
                          (ln.hold_reason ?? "")
                            .toLowerCase()
                            .includes("part")) ||
                        (ln.hold_reason ?? "")
                          .toLowerCase()
                          .includes("quote");

                      return (
                        <div
                          key={ln.id}
                          className="rounded-xl border border:white/10 bg-slate-950/70 p-3 backdrop-blur"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">
                                {idx + 1}.{" "}
                                {ln.description ||
                                  ln.complaint ||
                                  "Untitled job"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-300">
                                {String(ln.job_type ?? "job").replaceAll(
                                  "_",
                                  " ",
                                )}{" "}
                                •{" "}
                                {typeof ln.labor_time === "number"
                                  ? `${ln.labor_time}h`
                                  : "—"}{" "}
                                • Status:{" "}
                                {(ln.status ?? "awaiting").replaceAll(
                                  "_",
                                  " ",
                                )}{" "}
                                • Approval:{" "}
                                {(ln.approval_state ?? "pending").replaceAll(
                                  "_",
                                  " ",
                                )}
                              </div>
                              {ln.notes && (
                                <div className="mt-1 text-[11px] text-slate-300">
                                  Notes: {ln.notes}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="rounded-md border border-emerald-400/80 px-2.5 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/10"
                                onClick={() => approveLine(ln.id)}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-red-400/80 px-2.5 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/10"
                                onClick={() => declineLine(ln.id)}
                              >
                                Decline
                              </button>

                              {isAwaitingParts ? (
                                <button
                                  type="button"
                                  disabled
                                  className="cursor-not-allowed rounded-md border border-slate-500/70 px-2.5 py-1 text-[11px] text-slate-300"
                                >
                                  Sent to parts
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-md border border-sky-400/80 px-2.5 py-1 text-[11px] font-medium text-sky-100 hover:bg-sky-500/15"
                                  onClick={() => sendToParts(ln.id)}
                                  title="Send to parts for quoting"
                                >
                                  Send to parts
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Quote lines created from AI suggestions etc. */}
                {quotePending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-light)]/90">
                      Quote lines / AI suggestions
                    </div>
                    {quotePending.map((q, idx) => (
                      <div
                        key={q.id}
                        className="rounded-xl border border-white/10 bg-slate-950/75 p-3 backdrop-blur"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">
                              {idx + 1}. {q.description}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-300">
                              {String(q.job_type ?? "job").replaceAll(
                                "_",
                                " ",
                              )}{" "}
                              •{" "}
                              {typeof q.est_labor_hours === "number"
                                ? `${q.est_labor_hours}h`
                                : "—"}{" "}
                              • Quote status:{" "}
                              {(q.status ?? "pending_parts").replaceAll(
                                "_",
                                " ",
                              )}
                            </div>
                            {q.notes && (
                              <div className="mt-1 text-[11px] text-slate-300">
                                Notes: {q.notes}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-emerald-400/80 px-2.5 py-1 text-[11px] font-medium text-emerald-100 hover:bg-emerald-500/10"
                              onClick={() => authorizeQuote(q.id)}
                            >
                              Approve &amp; add job
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-red-400/80 px-2.5 py-1 text-[11px] font-medium text-red-100 hover:bg-red-500/10"
                              onClick={() => declineQuote(q.id)}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Jobs list */}
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.88)] backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold sm:text-base">
                  Jobs in this work order
                </h2>
                <p className="text-[11px] text-neutral-500">
                  Tap a job or open inspection to go into the focused job view.
                </p>
              </div>
            </div>

            {sortedLines.length === 0 ? (
              <p className="text-sm text-neutral-400">No lines yet.</p>
            ) : (
              <div className="space-y-2">
                {sortedLines.map((ln, idx) => {
                  const punchedIn =
                    !!ln.punched_in_at && !ln.punched_out_at;

                  const openFocused = () => {
                    setFocusedJobId(ln.id);
                    setFocusedOpen(true);
                  };

                  return (
                    <JobCard
                      key={ln.id}
                      index={idx}
                      line={ln}
                      parts={[]} // stripped-down: no parts list on main mobile view
                      technicians={[]} // assignment handled in focused view / desktop
                      canAssign={canAssign}
                      isPunchedIn={punchedIn}
                      onOpen={openFocused}
                      onAssign={undefined}
                      onOpenInspection={() => {
                        void openInspection(ln);
                      }}
                      onAddPart={undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-center pb-1">
        <VoiceButton />
      </div>

      {/* unified inspection modal – now loads unified session screen */}
      <InspectionModal
        open={inspectionOpen}
        src={inspectionSrc}
        title="Inspection"
        onClose={() => setInspectionOpen(false)}
      />
    </div>
  );
}