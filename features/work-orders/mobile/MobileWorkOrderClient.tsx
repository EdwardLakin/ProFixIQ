// app/mobile/work-orders/[id]/page.client.tsx
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
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";

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

  // focused job modal
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [focusedOpen, setFocusedOpen] = useState(false);

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

  // 🔁 refresh when a parts request or inspection completes (FocusedJobModal flow)
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

  const canAssign = false; // stripped-down mobile view: assignments done in FocusedJobModal or desktop

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
        const res = await fetch(`/api/work-orders/quotes/${quoteId}/authorize`, {
          method: "POST",
        });
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

  /* -------------------------- UI -------------------------- */
  if (!routeId)
    return <div className="p-6 text-red-500">Missing work order id.</div>;

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded-lg bg-neutral-800/60 ${className}`} />
  );

  const hasAnyPending = approvalPending.length > 0 || quotePending.length > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col bg-background px-3 py-4 text-foreground">
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
          <span className="rounded-full border border-neutral-800 bg-neutral-900/70 px-3 py-1 text-[11px] text-neutral-300">
            Internal ID: {wo.id.slice(0, 8)}
          </span>
        )}
      </div>

      {!currentUserId && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-900/10 p-3 text-xs text-amber-100">
          You appear signed out on this tab. If actions fail, open{" "}
          <Link href="/sign-in" className="underline hover:text-white">
            Sign In
          </Link>{" "}
          and return here.
        </div>
      )}

      {viewError && (
        <div className="mb-4 whitespace-pre-wrap rounded-lg border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200">
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
        <div className="mt-4 text-sm text-red-400">Work order not found.</div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="rounded-xl border border-border bg-card/95 p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-white sm:text-xl">
                    Work Order{" "}
                    <span className="text-orange-400">
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
          <div className="rounded-xl border border-border bg-card/95 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white sm:text-base">
                Vehicle &amp; Customer
              </h2>
              <button
                type="button"
                className="text-[11px] font-medium text-orange-400 hover:text-orange-300 hover:underline"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
              >
                {showDetails ? "Hide details" : "Show details"}
              </button>
            </div>

            {showDetails && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-neutral-950/60 p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
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
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-neutral-500">
                      No vehicle linked yet.
                    </p>
                  )}
                </div>

                <div className="rounded-lg bg-neutral-950/60 p-3">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Customer
                  </h3>
                  {customer ? (
                    <>
                      <p className="text-sm font-medium text-white">
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
                          href={`/customers/${customer.id}`}
                          className="mt-2 inline-flex text-[11px] font-medium text-orange-400 hover:text-orange-300 hover:underline"
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
          <div className="rounded-xl border border-blue-900/60 bg-gradient-to-b from-slate-950 to-slate-950/90 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-blue-200 sm:text-base">
                Awaiting customer approval
              </h2>
              {approvalPending.length > 1 && (
                <button
                  type="button"
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500"
                  onClick={sendAllPendingToParts}
                  title="Queue all lines for parts quoting"
                >
                  Quote all pending lines
                </button>
              )}
            </div>

            {!hasAnyPending ? (
              <p className="text-xs text-neutral-400">
                No lines waiting for approval.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Job lines needing approval */}
                {approvalPending.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-300/80">
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
                          className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">
                                {idx + 1}.{" "}
                                {ln.description ||
                                  ln.complaint ||
                                  "Untitled job"}
                              </div>
                              <div className="mt-0.5 text-[11px] text-neutral-400">
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
                                <div className="mt-1 text-[11px] text-neutral-400">
                                  Notes: {ln.notes}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="rounded-md border border-green-700 px-2 py-1 text-[11px] font-medium text-green-200 hover:bg-green-900/25"
                                onClick={() => approveLine(ln.id)}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-red-700 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/30"
                                onClick={() => declineLine(ln.id)}
                              >
                                Decline
                              </button>

                              {isAwaitingParts ? (
                                <button
                                  type="button"
                                  disabled
                                  className="cursor-not-allowed rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400"
                                >
                                  Sent to parts
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-md border border-blue-700 px-2 py-1 text-[11px] font-medium text-blue-200 hover:bg-blue-900/25"
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
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-orange-300/80">
                      Quote lines / AI suggestions
                    </div>
                    {quotePending.map((q, idx) => (
                      <div
                        key={q.id}
                        className="rounded-lg border border-neutral-800 bg-neutral-950/80 p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-white">
                              {idx + 1}. {q.description}
                            </div>
                            <div className="mt-0.5 text-[11px] text-neutral-400">
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
                              <div className="mt-1 text-[11px] text-neutral-400">
                                Notes: {q.notes}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="rounded-md border border-green-700 px-2 py-1 text-[11px] font-medium text-green-200 hover:bg-green-900/25"
                              onClick={() => authorizeQuote(q.id)}
                            >
                              Approve &amp; add job
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-red-700 px-2 py-1 text-[11px] font-medium text-red-200 hover:bg-red-900/30"
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
          <div className="rounded-xl border border-border bg-card/95 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white sm:text-base">
                  Jobs in this work order
                </h2>
                <p className="text-[11px] text-neutral-500">
                  Tap a job to open the focused job view.
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

                  return (
                    <JobCard
                      key={ln.id}
                      index={idx}
                      line={ln}
                      parts={[]} // stripped-down: no parts list on main mobile view
                      technicians={[]} // assignment handled in focused modal / desktop
                      canAssign={canAssign}
                      isPunchedIn={punchedIn}
                      onOpen={() => {
                        setFocusedJobId(ln.id);
                        setFocusedOpen(true);
                      }}
                      onAssign={undefined}
                      onOpenInspection={undefined}
                      onAddPart={undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Focused job modal (full controls, parts, inspection, etc.) */}
      {focusedOpen && focusedJobId && (
        <FocusedJobModal
          isOpen={focusedOpen}
          onClose={() => setFocusedOpen(false)}
          workOrderLineId={focusedJobId}
          onChanged={fetchAll}
          mode="tech"
        />
      )}

      <div className="mt-4 flex justify-center">
        <VoiceButton />
      </div>
    </div>
  );
}