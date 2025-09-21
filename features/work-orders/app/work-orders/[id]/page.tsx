"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format, formatDistanceStrict } from "date-fns";
import { toast } from "sonner";

import { useWorkOrderMode, type Role } from "@/features/work-orders/hooks/useWorkOrderMode";
import { capabilities } from "@/features/work-orders/lib/capabilities";

import PreviousPageButton from "@shared/components/ui/PreviousPageButton";
import { MenuQuickAdd } from "@work-orders/components/MenuQuickAdd";
import SuggestedQuickAdd from "@work-orders/components/SuggestedQuickAdd";
import { WorkOrderInvoiceDownloadButton } from "@work-orders/components/WorkOrderInvoiceDownloadButton";
import { NewWorkOrderLineForm } from "@work-orders/components/NewWorkOrderLineForm";

import DtcSuggestionPopup from "@work-orders/components/workorders/DtcSuggestionPopup";
import PartsRequestModal from "@work-orders/components/workorders/PartsRequestModal";
import CauseCorrectionModal from "@work-orders/components/workorders/CauseCorrectionModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";
import { generateQuotePDFBytes } from "@work-orders/lib/work-orders/generateQuotePdf";

import { useTabState } from "@/features/shared/hooks/useTabState";

/* ----------------------------- Error Boundary ----------------------------- */
class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{ fallback?: React.ReactNode }>,
  { hasError: boolean; msg?: string }
> {
  constructor(props: React.PropsWithChildren<{ fallback?: React.ReactNode }>) {
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
  | string;

type ParamsShape = Record<string, string | string[]>;
function paramToString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

/* ---------------------------- Status -> Badges ---------------------------- */
const statusBadge: Record<string, string> = {
  awaiting_approval: "bg-blue-100 text-blue-800",
  awaiting: "bg-blue-100 text-blue-800",
  queued: "bg-blue-100 text-blue-800",
  in_progress: "bg-orange-100 text-orange-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  planned: "bg-purple-100 text-purple-800",
  new: "bg-gray-200 text-gray-800",
  completed: "bg-green-100 text-green-800",
};

/* ----------------------------- Lazy Invoice UI ---------------------------- */
function LazyInvoice({
  woId,
  lines,
  vehicle,
  customer,
}: {
  woId: string;
  lines: WorkOrderLine[];
  vehicle: Vehicle | null;
  customer: Customer | null;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800"
      >
        Generate / Download Invoice PDF
      </button>
    );
  }

  return (
    <WorkOrderInvoiceDownloadButton
      workOrderId={woId}
      lines={(lines ?? []).filter(Boolean).map((l) => ({
        complaint: l.complaint ?? l.description ?? "",
        cause: l.cause ?? "",
        correction: l.correction ?? "",
        tools: l.tools ?? "",
        labor_time: typeof l.labor_time === "number" ? l.labor_time : 0,
      }))}
      vehicleInfo={{
        year: vehicle?.year ? String(vehicle.year) : "",
        make: vehicle?.make ?? "",
        model: vehicle?.model ?? "",
        vin: vehicle?.vin ?? "",
      }}
      customerInfo={{
        name: [customer?.first_name ?? "", customer?.last_name ?? ""].filter(Boolean).join(" "),
        phone: customer?.phone ?? "",
        email: customer?.email ?? "",
      }}
    />
  );
}

/* ------------------------------ Small helpers ----------------------------- */
function showErr(prefix: string, err?: { message?: string } | null) {
  const msg = err?.message ?? "Something went wrong.";
  console.error(prefix, err);
  toast.error(`${prefix}: ${msg}`);
}
function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ---------------------------------- Page --------------------------------- */
export default function WorkOrderPage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const woId = useMemo(() => {
    const raw = (params as ParamsShape)?.id;
    return paramToString(raw);
  }, [params]);

  const urlJobId = searchParams.get("jobId");
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // Core entities
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [lines, setLines] = useState<WorkOrderLine[]>([]);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewError, setViewError] = useState<string | null>(null);

  // Role (for gating AI panel + caps)
  const [profileRole, setProfileRole] = useState<string | null>(null);

  // Tech view extras
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [techNotes, setTechNotes] = useState("");
  const [updatingNotes, setUpdatingNotes] = useState(false);
  const [duration, setDuration] = useState("");
  const [tech, setTech] = useState<Profile | null>(null);

  // Photos + user cache
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // UI toggles
  const [showDetails, setShowDetails] = useState(true);
  const [showAddForm, setShowAddForm] = useTabState<boolean>("showAddForm", false);

  // Modals
  const [isPartsModalOpen, setIsPartsModalOpen] = useState(false);
  const [isCauseModalOpen, setIsCauseModalOpen] = useState(false);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);

  // Busy flags
  const [busyQuote, setBusyQuote] = useState(false);
  const [busyQueue, setBusyQueue] = useState(false);
  const [busyAwaiting, setBusyAwaiting] = useState(false);

  // (2) Track which lines we've already normalized to status 'awaiting'
  const [fixedStatus, setFixedStatus] = useState<Set<string>>(new Set());

  // (3) Warn once if WO missing vehicle/customer
  const [warnedMissing, setWarnedMissing] = useState(false);

  // Current user
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        setUserId(user.id);
      } else {
        setCurrentUserId(null);
        setUserId(null);
      }
    })();
  }, [supabase]);

  // Load role
  useEffect(() => {
    (async () => {
      if (!userId) {
        setProfileRole(null);
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      setProfileRole(prof?.role ?? null);
    })();
  }, [supabase, userId]);

  const mode = useWorkOrderMode(profileRole as Role | null);
  const caps = capabilities(profileRole);
  const isViewMode = mode === "view";
  const isTechMode = mode === "tech";

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

  // Fetch everything
  const fetchAll = useCallback(
    async (retry = 0) => {
      if (!woId) return;
      setLoading(true);
      setViewError(null);

      try {
        const { data: woRow, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", woId)
          .maybeSingle();
        if (woErr) throw woErr;

        if (!woRow) {
          if (retry < 3) {
            const delay = 300 * Math.pow(2, retry);
            await sleep(delay);
            return fetchAll(retry + 1);
          } else {
            setWo(null);
            setLines([]);
            setVehicle(null);
            setCustomer(null);
            setLine(null);
            setActiveJobId(null);
            setLoading(false);
            return;
          }
        }
        setWo(woRow);

        // (3) Loud toast if missing vehicle/customer (only once per load session)
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
        setTechNotes(pick?.notes ?? "");
        setUrlJobId(pick?.id ?? null);

        if (pick?.assigned_to) {
          const { data: p } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", pick.assigned_to)
            .single();
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
    [supabase, woId, urlJobId, setUrlJobId, warnedMissing]
  );

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Real-time refresh
  useEffect(() => {
    if (!woId) return;

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
  }, [supabase, woId, fetchAll]);

  // Legacy refresh event
  useEffect(() => {
    const handler = () => fetchAll();
    window.addEventListener("wo:line-added", handler);
    return () => window.removeEventListener("wo:line-added", handler);
  }, [fetchAll]);

  // Live timer
  useEffect(() => {
    const t = setInterval(() => {
      if (line?.punched_in_at && !line?.punched_out_at) {
        setDuration(formatDistanceStrict(new Date(), new Date(line.punched_in_at)));
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [line]);

  /* -------- (2) Normalize any newly created lines to status 'awaiting' ----- */
  useEffect(() => {
    (async () => {
      if (!lines.length) return;
      const toFix = lines
        .filter((l) => !l.status || l.status === (null as any))
        .map((l) => l.id)
        .filter((id) => !fixedStatus.has(id));

      if (toFix.length === 0) return;

      const { error } = await supabase
        .from("work_order_lines")
        .update({ status: "awaiting" })
        .in("id", toFix);

      if (!error) {
        const next = new Set(fixedStatus);
        toFix.forEach((id) => next.add(id));
        setFixedStatus(next);
        // refresh to reflect normalized status
        fetchAll();
      }
    })();
  }, [lines, fixedStatus, supabase, fetchAll]);

  /* ------------------------------ Tech Actions ----------------------------- */
  const handlePunchIn = async (jobId: string) => {
    if (activeJobId && activeJobId !== jobId) {
      const ok = confirm("You are punched into another job. Punch out and switch?");
      if (!ok) return;
      const { error: outErr } = await supabase
        .from("work_order_lines")
        .update({ punched_out_at: new Date().toISOString(), status: "awaiting" })
        .eq("id", activeJobId);
      if (outErr) return showErr("Punch out failed", outErr);
    } else if (activeJobId) {
      toast.error("You are already punched in to a job.");
      return;
    }

    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_in_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", jobId);
    if (error) return showErr("Punch in failed", error);
    toast.success("Punched in");
    setUrlJobId(jobId);
    setActiveJobId(jobId);
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

  const updateTechNotes = async () => {
    if (!line) return;
    setUpdatingNotes(true);
    const { error } = await supabase.from("work_order_lines").update({ notes: techNotes }).eq("id", line.id);
    setUpdatingNotes(false);
    if (error) return showErr("Update notes failed", error);
    toast.success("Notes updated");
  };

  const requestAuthorization = async () => {
    if (!line) return;
    const { error } = await supabase
      .from("work_order_lines")
      .update({
        hold_reason: "Awaiting customer authorization",
        status: "on_hold",
      })
      .eq("id", line.id);
    if (error) return showErr("Request authorization failed", error);
    toast.success("Job put on hold for authorization");
    fetchAll();
  };

  const handleDownloadQuote = async () => {
    if (busyQuote) return;
    if (!wo?.id || !vehicle?.id) {
      toast.error("Missing work order or vehicle info");
      return;
    }
    setBusyQuote(true);
    try {
      const { data: techSuggested, error: tsErr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", wo.id)
        .eq("job_type", "tech-suggested");
      if (tsErr) throw tsErr;

      let jobs = techSuggested ?? [];
      if (!jobs.length) {
        const { data: fallback, error: fbErr } = await supabase
          .from("work_order_lines")
          .select("*")
          .eq("work_order_id", wo.id)
          .neq("status", "completed");
        if (fbErr) throw fbErr;
        jobs = fallback ?? [];
      }

      if (!jobs.length) {
        toast.error("No jobs found to include in the quote.");
        return;
      }

      const bytes = await generateQuotePDFBytes(jobs, vehicle.id);
      const pdfBlob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: "application/pdf" });
      const fileName = `quote-${wo.id}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("quotes")
        .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = await supabase.storage.from("quotes").getPublicUrl(fileName);
      const publicUrl = publicUrlData?.publicUrl ?? null;

      const { error: updErr } = await supabase.from("work_orders").update({ quote_url: publicUrl }).eq("id", wo.id);
      if (updErr) throw updErr;

      if (publicUrl) setWo((prev) => (prev ? { ...prev, quote_url: publicUrl } : prev));

      const { data: woRow } = await supabase
        .from("work_orders")
        .select("id, customer:customer_id (email, full_name)")
        .eq("id", wo.id)
        .single<{
          id: string;
          customer: { email: string | null; full_name: string | null } | null;
        }>();

      const customerEmail = woRow?.customer?.email ?? null;
      const customerName = woRow?.customer?.full_name ?? "";

      if (customerEmail && publicUrl) {
        await fetch("/api/send-email", {
          method: "POST",
          body: JSON.stringify({
            email: customerEmail,
            subject: `Quote for Work Order #${wo.id}`,
            html: `<p>Hi ${customerName || ""},</p>
                   <p>Your quote is ready: <a href="${publicUrl}" target="_blank">View Quote PDF</a></p>`,
            summaryHtml: `<h2>Quote for Work Order</h2><p><a href="${publicUrl}">View PDF</a></p>`,
            fileName,
          }),
          headers: { "Content-Type": "application/json" },
        });

        await supabase.from("email_logs").insert({
          recipient: customerEmail,
          subject: `Quote for Work Order #${wo.id}`,
          quote_url: publicUrl,
          work_order_id: wo.id,
        });
      }

      toast.success("Quote PDF saved" + (customerEmail ? " and emailed to customer" : ""));
    } catch (e: any) {
      showErr("Generate quote failed", e);
    } finally {
      setBusyQuote(false);
    }
  };

  /* -------------------------------- Helpers ------------------------------- */
  const chipClass = (s: string | null): string => {
    const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_");
    return `text-xs px-2 py-1 rounded ${statusBadge[key] ?? "bg-gray-200 text-gray-800"}`;
  };

  const isTech = (profileRole ?? "").toLowerCase() === "tech";

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

  const suggestedJobId: string | null = useMemo(() => {
    if (!sortedLines.length) return null;
    const byStatus = (st: string) => sortedLines.find((l) => (l.status ?? "").toLowerCase() === st)?.id ?? null;
    return byStatus("in_progress") || byStatus("awaiting") || byStatus("queued") || sortedLines[0]?.id || null;
  }, [sortedLines]);

  if (!woId) {
    return <div className="p-6 text-red-500">Missing work order id.</div>;
  }

  const notes: string | null = ((wo as WorkOrderWithMaybeNotes | null)?.notes ?? null) || null;
  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText = createdAt && !isNaN(createdAt.getTime()) ? format(createdAt, "PPpp") : "—";

  const badgeClass =
    statusBadge[(line?.status ?? "awaiting") as keyof typeof statusBadge] ?? "bg-gray-200 text-gray-800";

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`animate-pulse rounded bg-neutral-800/60 ${className}`} />
  );

  return (
    <div className="p-4 sm:p-6 text-white">
      <PreviousPageButton to="/work-orders" />

      {/* Mode toggle */}
      <div className="mb-3 flex items-center gap-2 text-xs text-neutral-300">
        <span className="opacity-70">Mode:</span>
        <button
          className={`rounded px-2 py-1 border ${
            mode === "view" ? "border-orange-500 text-orange-300" : "border-neutral-700 text-neutral-300"
          }`}
          onClick={() => {
            const sp = new URLSearchParams(searchParams.toString());
            sp.set("mode", "view");
            window.history.replaceState(null, "", `?${sp.toString()}`);
            toast.success("Switched to View mode");
          }}
        >
          View
        </button>
        <button
          className={`rounded px-2 py-1 border ${
            mode === "tech" ? "border-orange-500 text-orange-300" : "border-neutral-700 text-neutral-300"
          }`}
          onClick={() => {
            const sp = new URLSearchParams(searchParams.toString());
            sp.set("mode", "tech");
            window.history.replaceState(null, "", `?${sp.toString()}`);
            toast.success("Switched to Tech mode");
          }}
        >
          Tech
        </button>
      </div>

      {viewError && (
        <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-red-300">
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
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Work Order {wo.custom_id || `#${wo.id.slice(0, 8)}`}</h1>
                <span className={chipClass(wo.status as WOStatus)}>
                  {(wo.status ?? "awaiting").replaceAll("_", " ")}
                </span>
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

            {/* Jobs (front-desk quick add + list) */}
            {isViewMode && (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Jobs in this Work Order</h2>

                  {/* (1) Always show the manual Add Job Line toggle */}
                  <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="rounded bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm hover:border-orange-500"
                    aria-expanded={showAddForm}
                  >
                    {showAddForm ? "Hide Add Job Line" : "Add Job Line"}
                  </button>
                </div>

                {/* (1) Always allow opening the manual form when toggled */}
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
                    {sortedLines.map((ln) => (
                      <div key={ln.id} className="rounded border border-neutral-800 bg-neutral-950 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{ln.description || ln.complaint || "Untitled job"}</div>
                            <div className="text-xs text-neutral-400">
                              {String((ln.job_type as JobType) ?? "job").replaceAll("_", " ")} •{" "}
                              {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} • Status:{" "}
                              {(ln.status ?? "awaiting").replaceAll("_", " ")}
                            </div>
                            {(ln.complaint || ln.cause || ln.correction) && (
                              <div className="text-xs text-neutral-400 mt-1">
                                {ln.complaint ? `Cmpl: ${ln.complaint}  ` : ""}
                                {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                                {ln.correction ? `| Corr: ${ln.correction}` : ""}
                              </div>
                            )}
                          </div>
                          <span className={chipClass(ln.status as WOStatus)}>
                            {(ln.status ?? "awaiting").replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Invoice (lazy) */}
            {isViewMode && (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <h3 className="mb-2 font-semibold">Invoice</h3>
                <ErrorBoundary>
                  <LazyInvoice woId={wo.id} lines={sortedLines} vehicle={vehicle} customer={customer} />
                </ErrorBoundary>
              </div>
            )}

            {/* Sticky progress actions */}
            {isViewMode && (
              <div className="sticky bottom-3 z-10 mt-4 rounded border border-neutral-800 bg-neutral-900/95 p-3 backdrop-blur">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => router.push(`/work-orders/quote-review?woId=${wo.id}`)}
                    className="rounded bg-orange-500 px-3 py-2 font-semibold text-black hover:bg-orange-600"
                  >
                    Review Quote
                  </button>

                  <button
                    onClick={async () => {
                      if (busyAwaiting) return;
                      setBusyAwaiting(true);
                      const prev = wo;
                      setWo(prev ? { ...prev, status: "awaiting_approval" } : prev);
                      const { error } = await supabase
                        .from("work_orders")
                        .update({ status: "awaiting_approval" })
                        .eq("id", wo.id);
                      setBusyAwaiting(false);
                      if (error) {
                        setWo(prev);
                        return showErr("Update status failed", error);
                      }
                      toast.success("Marked as awaiting customer approval");
                    }}
                    className="rounded border border-neutral-700 px-3 py-2 hover:border-orange-500 disabled:opacity-60"
                    disabled={busyAwaiting}
                  >
                    Mark Awaiting Approval
                  </button>

                  <button
                    onClick={async () => {
                      if (busyQueue) return;
                      setBusyQueue(true);
                      const prev = wo;
                      setWo(prev ? { ...prev, status: "queued" } : prev);
                      const { error } = await supabase.from("work_orders").update({ status: "queued" }).eq("id", wo.id);
                      setBusyQueue(false);
                      if (error) {
                        setWo(prev);
                        return showErr("Update status failed", error);
                      }
                      toast.success("Moved to Queue");
                      await fetchAll();
                    }}
                    className="rounded border border-neutral-700 px-3 py-2 hover:border-orange-500 disabled:opacity-60"
                    disabled={busyQueue}
                  >
                    Queue Work
                  </button>

                  <button
                    className="rounded bg-purple-600 px-3 py-2 text-white hover:bg-purple-700 disabled:opacity-60"
                    onClick={handleDownloadQuote}
                    disabled={!caps.canGenerateQuote || busyQuote}
                    title={!caps.canGenerateQuote ? "Not permitted" : "Generate quote PDF"}
                  >
                    {busyQuote ? "Saving…" : "Download Quote PDF"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <aside className="space-y-6">
            {isTechMode && isTech && (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <ErrorBoundary>
                  {suggestedJobId ? (
                    <SuggestedQuickAdd jobId={suggestedJobId} workOrderId={wo.id} vehicleId={vehicle?.id ?? null} />
                  ) : (
                    <div className="text-sm text-neutral-400">Add a job line to enable AI suggestions.</div>
                  )}
                </ErrorBoundary>
              </div>
            )}

            {/* Start inspections */}
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-2 font-semibold text-orange-400">Start an Inspection</div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/inspection/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          work_order_id: wo.id,
                          customer: {
                            first_name: customer?.first_name ?? "",
                            last_name: customer?.last_name ?? "",
                            phone: customer?.phone ?? "",
                            email: customer?.email ?? "",
                          },
                          vehicle: {
                            year: String(vehicle?.year ?? ""),
                            make: vehicle?.make ?? "",
                            model: vehicle?.model ?? "",
                            vin: vehicle?.vin ?? "",
                            license_plate: vehicle?.license_plate ?? "",
                            mileage: String(vehicle?.mileage ?? ""),
                            color: "",
                          },
                        }),
                      });
                      const j = await res.json();
                      if (!res.ok) {
                        toast.error(j?.error || "Failed to start inspection.");
                        return;
                      }
                      window.location.assign(`/inspection/maintenance50?inspectionId=${j.inspectionId}`);
                    } catch (e: any) {
                      showErr("Start inspection failed", e);
                    }
                  }}
                >
                  Gas – Maintenance/Inspection
                </button>

                <button
                  className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/inspection/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          work_order_id: wo.id,
                          customer: {
                            first_name: customer?.first_name ?? "",
                            last_name: customer?.last_name ?? "",
                            phone: customer?.phone ?? "",
                            email: customer?.email ?? "",
                          },
                          vehicle: {
                            year: String(vehicle?.year ?? ""),
                            make: vehicle?.make ?? "",
                            model: vehicle?.model ?? "",
                            vin: vehicle?.vin ?? "",
                            license_plate: vehicle?.license_plate ?? "",
                            mileage: String(vehicle?.mileage ?? ""),
                            color: "",
                          },
                        }),
                      });
                      const j = await res.json();
                      if (!res.ok) {
                        toast.error(j?.error || "Failed to start inspection.");
                        return;
                      }
                      window.location.assign(`/inspection/maintenance50?inspectionId=${j.inspectionId}&fuel=diesel`);
                    } catch (e: any) {
                      showErr("Start inspection failed", e);
                    }
                  }}
                >
                  Diesel – Maintenance/Inspection
                </button>
              </div>
            </div>

            {/* Quick add menu */}
            {isViewMode && (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <ErrorBoundary>
                  <MenuQuickAdd workOrderId={wo.id} />
                </ErrorBoundary>
              </div>
            )}

            {/* Tech actions */}
            {isTechMode && line ? (
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
                    <button
                      className="bg-yellow-500 hover:bg-yellow-600 px-3 py-2 rounded text-white"
                      onClick={requestAuthorization}
                    >
                      Request Authorization
                    </button>
                    <button
                      className="bg-gray-800 hover:bg-black px-3 py-2 rounded text-white col-span-1 sm:col-span-2"
                      onClick={() => setIsAddJobModalOpen(true)}
                    >
                      Add Job
                    </button>
                  </div>

                  <div className="mt-3">
                    <button
                      className="bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-white w-full"
                      onClick={handleDownloadQuote}
                      disabled={!caps.canGenerateQuote || busyQuote}
                    >
                      {busyQuote ? "Saving…" : "Download Quote PDF"}
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    <label className="block text-sm">Tech Notes</label>
                    <textarea
                      className="w-full border border-neutral-700 bg-neutral-800 text-white p-2 rounded"
                      rows={3}
                      value={techNotes}
                      onChange={(e) => setTechNotes(e.target.value)}
                      onBlur={updateTechNotes}
                      disabled={updatingNotes}
                    />
                  </div>
                </div>

                {/* Job list with punch-in */}
                <div className="mt-6">
                  <h4 className="font-semibold mb-2">Job List</h4>
                  <div className="space-y-2">
                    {sortedLines.map((job) => {
                      const jobType = (job.job_type as JobType) ?? "unknown";
                      const typeColor: Record<string, string> = {
                        diagnosis: "border-l-4 border-red-500",
                        "diagnosis-followup": "border-l-4 border-orange-500",
                        maintenance: "border-l-4 border-yellow-500",
                        repair: "border-l-4 border-green-500",
                        "tech-suggested": "border-l-4 border-blue-400",
                      };
                      const jobBadge =
                        statusBadge[job.status as keyof typeof statusBadge] ?? "bg-gray-300 text-gray-800";

                      return (
                        <div
                          key={job.id}
                          className={`p-3 border rounded bg-neutral-950 ${typeColor[jobType] || ""}`}
                        >
                          <div className="flex justify-between items-center">
                            <div
                              className="cursor-pointer"
                              title="Focus this job"
                              onClick={() => {
                                setLine(job);
                                setActiveJobId(job.punched_out_at ? null : job.id);
                                setTechNotes(job.notes ?? "");
                                setUrlJobId(job.id);
                              }}
                            >
                              <p className="font-medium text-white">{job.complaint || "No complaint"}</p>
                              <p className="text-xs text-neutral-400">
                                {job.job_type || "unknown"} | {job.status ?? "—"}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-1 rounded ${jobBadge}`}>
                                {(job.status ?? "awaiting").replaceAll("_", " ")}
                              </span>

                              {(!job.punched_in_at || activeJobId !== job.id) && (
                                <button
                                  className="ml-2 bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                                  onClick={() => handlePunchIn(job.id)}
                                >
                                  Punch In
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Diagnosis: AI DTC helper */}
                {line?.job_type === "diagnosis" && line.punched_in_at && !line.cause && !line.correction && vehicle && (
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
            ) : isTechMode ? (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
                No focused job yet.
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {/* Vehicle photos */}
      {vehicle?.id && currentUserId && (
        <div className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold">Vehicle Photos</h2>
          <VehiclePhotoUploader vehicleId={vehicle.id} />
          <VehiclePhotoGallery vehicleId={vehicle.id} currentUserId={currentUserId} />
        </div>
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
    </div>
  );
}