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
import VehiclePhotoUploader from "@parts/components/VehiclePhotoUploader";
import VehiclePhotoGallery from "@parts/components/VehiclePhotoGallery";
import { generateQuotePDFBytes } from "@work-orders/lib/work-orders/generateQuotePdf";

import { useTabState } from "@/features/shared/hooks/useTabState";

// New unified focused job modal + chat
import FocusedJobModal from "@/features/work-orders/components/workorders/FocusedJobModal";
import AddJobModal from "@work-orders/components/workorders/AddJobModal";
import NewChatModal from "@/features/ai/components/chat/NewChatModal";

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
function msToTenthHours(ms: number): string {
  // .1 hr = 6 min = 360000 ms
  const tenths = Math.max(0, Math.round(ms / 360000));
  const hours = (tenths / 10).toFixed(1);
  return `${hours} hr`;
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
  const [duration, setDuration] = useState("");
  const [tech, setTech] = useState<Profile | null>(null);

  // Photos + user cache
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // UI toggles
  const [showDetails, setShowDetails] = useState(true);
  const [showAddForm, setShowAddForm] = useTabState<boolean>("showAddForm", false);

  // Modals kept
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // NEW: FocusedJobModal & Chat
  const [focusedOpen, setFocusedOpen] = useState(false);
  const [focusedJobId, setFocusedJobId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Busy flags
  const [busyQuote, setBusyQuote] = useState(false);
  const [busyQueue, setBusyQueue] = useState(false);
  const [busyAwaiting, setBusyAwaiting] = useState(false);
  const [busySendApproval, setBusySendApproval] = useState(false);

  // Normalization tracker
  const [fixedStatus, setFixedStatus] = useState<Set<string>>(new Set());

  // One-time missing notice
  const [warnedMissing, setWarnedMissing] = useState(false);

  // Selection for approval
  const [selectedForApproval, setSelectedForApproval] = useState<Set<string>>(new Set());
  const [touchedSelection, setTouchedSelection] = useState(false);

  const setSelection = (ids: string[], touched = true) => {
    setSelectedForApproval(new Set(ids));
    if (touched) setTouchedSelection(true);
  };
  const toggleSelection = (id: string) => {
    setSelectedForApproval((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setTouchedSelection(true);
  };
  const selectAllEligible = () => {
    const ids = (lines ?? []).filter((l) => (l.status ?? "") !== "completed").map((l) => l.id);
    setSelection(ids);
  };
  const clearAllSelection = () => setSelection([], true);

  // Default approval selection
  useEffect(() => {
    if (!touchedSelection) {
      const ids = (lines ?? []).filter((l) => (l.status ?? "") !== "completed").map((l) => l.id);
      setSelectedForApproval(new Set(ids));
    }
  }, [lines, touchedSelection]);

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

        // Warn once if missing vehicle/customer
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

  // Live timer for focused job badge
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

      const { error } = await supabase
        .from("work_order_lines")
        .update({ status: "awaiting" })
        .in("id", toFix);

      if (!error) {
        const next = new Set(fixedStatus);
        toFix.forEach((id) => next.add(id));
        setFixedStatus(next);
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

  const handlePunchOut = async (jobId: string) => {
    const { error } = await supabase
      .from("work_order_lines")
      .update({ punched_out_at: new Date().toISOString(), status: "awaiting" })
      .eq("id", jobId);
    if (error) return showErr("Punch out failed", error);
    toast.success("Punched out");
    setActiveJobId(null);
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

  // Send for Approval with selected subset
  const handleSendForApproval = async () => {
    if (!wo?.id) return;
    if (!customer?.email) {
      toast.error("Customer email is required to send for approval.");
      return;
    }
    const selected = Array.from(selectedForApproval);
    if (!selected.length) {
      toast.error("Select at least one job to send for approval.");
      return;
    }
    if (busySendApproval) return;

    setBusySendApproval(true);
    const prev = wo;
    try {
      setWo(prev ? { ...prev, status: "awaiting_approval" } : prev);

      const { error: upErr } = await supabase
        .from("work_orders")
        .update({ status: "awaiting_approval" })
        .eq("id", wo.id);
      if (upErr) throw upErr;

      const res = await fetch("/work-orders/send-for-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId: wo.id,
          lineIds: selected,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Failed to send for approval.");
      }

      toast.success(`Sent ${selected.length} item(s) to customer for approval.`);
    } catch (e: any) {
      setWo(prev);
      showErr("Send for approval failed", e);
    } finally {
      setBusySendApproval(false);
    }
  };

  /* -------------------------------- Helpers ------------------------------- */
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

  const suggestedJobId: string | null = useMemo(() => {
    if (!sortedLines.length) return null;
    const byStatus = (st: string) => sortedLines.find((l) => (l.status ?? "").toLowerCase() === st)?.id ?? null;
    return byStatus("in_progress") || byStatus("awaiting") || byStatus("queued") || sortedLines[0]?.id || null;
  }, [sortedLines]);

  const notes: string | null = ((wo as WorkOrderWithMaybeNotes | null)?.notes ?? null) || null;
  const createdAt = wo?.created_at ? new Date(wo.created_at) : null;
  const createdAtText = createdAt && !isNaN(createdAt.getTime()) ? format(createdAt, "PPpp") : "—";

  // helper: per-job live duration in tenth hours
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

  // open focused modal (and sync url)
  const openFocused = (jobId: string) => {
    setFocusedJobId(jobId);
    setFocusedOpen(true);
    setUrlJobId(jobId);
  };

  if (!woId) {
    return <div className="p-6 text-red-500">Missing work order id.</div>;
  }

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
        // NOTE: 360px left column so Focused Job card can be sticky + visible
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
          {/* LEFT — Focused/controls (sticky) */}
          <aside className="space-y-4 lg:order-1">
            {line ? (
              <div className="sticky top-20 rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Focused Job</h3>
                  <span className={`text-xs px-2 py-1 rounded ${badgeClass}`}>
                    {(line.status ?? "awaiting").replaceAll("_", " ")}
                  </span>
                </div>

                <div className="mt-2 text-sm text-neutral-300">
                  <div className="truncate font-medium">
                    {line.description || line.complaint || "Untitled job"}
                  </div>
                  <div className="text-xs text-neutral-400">Time: {duration || renderJobDuration(line)}</div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="rounded bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                    onClick={() => openFocused(line.id)}
                  >
                    Open Job
                  </button>
                  <button
                    className="rounded border border-neutral-700 px-3 py-2 text-sm hover:border-orange-500"
                    onClick={() => setIsAddJobModalOpen(true)}
                  >
                    Add Job
                  </button>
                </div>
              </div>
            ) : (
              <div className="sticky top-20 rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="text-sm text-neutral-400">No focused job yet.</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="rounded border border-neutral-700 px-3 py-2 text-sm hover:border-orange-500"
                    onClick={() => setQuickAddOpen(true)}
                  >
                    Quick Add
                  </button>
                  <button
                    className="rounded border border-neutral-700 px-3 py-2 text-sm hover:border-orange-500"
                    onClick={() => setIsAddJobModalOpen(true)}
                  >
                    Add Job
                  </button>
                </div>
              </div>
            )}
          </aside>

          {/* RIGHT — main content */}
          <div className="space-y-6 lg:order-2">
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
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:border-orange-500"
                    onClick={() => router.push(`/work-orders/${wo.id}/approve`)}
                    title="Open signature capture / approval"
                  >
                    Capture Signature
                  </button>
                  <button
                    type="button"
                    className="text-sm text-orange-400 hover:underline"
                    onClick={() => setShowDetails((v) => !v)}
                    aria-expanded={showDetails}
                  >
                    {showDetails ? "Hide details" : "Show details"}
                  </button>
                </div>
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
            <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Jobs in this Work Order</h2>

                <button
                  type="button"
                  onClick={() => setShowAddForm((v) => !v)}
                  className="rounded bg-neutral-800 border border-neutral-700 px-3 py-1.5 text-sm hover:border-orange-500"
                  aria-expanded={showAddForm}
                >
                  {showAddForm ? "Hide Add Job Line" : "Add Job Line"}
                </button>
              </div>

              {/* Approval selection helpers */}
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                <span className="opacity-70">Approval selection:</span>
                <button
                  type="button"
                  className="rounded border border-neutral-700 px-2 py-1 hover:border-orange-500"
                  onClick={selectAllEligible}
                >
                  Select all eligible
                </button>
                <button
                  type="button"
                  className="rounded border border-neutral-700 px-2 py-1 hover:border-orange-500"
                  onClick={clearAllSelection}
                >
                  Clear all
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

                    const isActive = activeJobId === ln.id && !ln.punched_out_at;

                    return (
                      <div key={ln.id} className={`rounded border border-neutral-800 bg-neutral-950 p-3 ${borderCls}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openFocused(ln.id)}
                              className="truncate font-medium text-left hover:underline"
                              title="Open focused job"
                            >
                              {ln.description || ln.complaint || "Untitled job"}
                            </button>
                            <div className="text-xs text-neutral-400">
                              {String((ln.job_type as JobType) ?? "job").replaceAll("_", " ")} •{" "}
                              {typeof ln.labor_time === "number" ? `${ln.labor_time}h` : "—"} • Status:{" "}
                              {(ln.status ?? "awaiting").replaceAll("_", " ")} • Time: {renderJobDuration(ln)}
                            </div>
                            {(ln.complaint || ln.cause || ln.correction) && (
                              <div className="text-xs text-neutral-400 mt-1">
                                {ln.complaint ? `Cmpl: ${ln.complaint}  ` : ""}
                                {ln.cause ? `| Cause: ${ln.cause}  ` : ""}
                                {ln.correction ? `| Corr: ${ln.correction}` : ""}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <label
                              className={`flex items-center gap-1 text-xs ${
                                eligible ? "text-neutral-300" : "text-neutral-500"
                              }`}
                              title={eligible ? "Include in approval" : "Completed jobs are excluded"}
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

                            <span className={chipClass(ln.status as WOStatus)}>
                              {(ln.status ?? "awaiting").replaceAll("_", " ")}
                            </span>

                            {/* Punch controls reflect state */}
                            {!ln.punched_in_at || !isActive ? (
                              <button
                                className="ml-2 bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded"
                                onClick={() => handlePunchIn(ln.id)}
                                disabled={!!activeJobId && activeJobId !== ln.id}
                                title={activeJobId && activeJobId !== ln.id ? "Punch out of current job first" : ""}
                              >
                                {activeJobId === ln.id ? "Punched In" : "Punch In"}
                              </button>
                            ) : (
                              <button
                                className="ml-2 bg-neutral-700 hover:bg-neutral-800 text-white text-xs px-2 py-1 rounded"
                                onClick={() => handlePunchOut(ln.id)}
                              >
                                Punch Out
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Invoice + Actions → View mode only */}
            {mode === "view" && (
              <>
                {/* Invoice (lazy) */}
                <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                  <h3 className="mb-2 font-semibold">Invoice</h3>
                  <ErrorBoundary>
                    <LazyInvoice woId={wo.id} lines={sortedLines} vehicle={vehicle} customer={customer} />
                  </ErrorBoundary>
                </div>

                {/* Sticky progress actions */}
                <div className="sticky bottom-3 z-10 mt-4 rounded border border-neutral-800 bg-neutral-900/95 p-3 backdrop-blur">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => router.push(`/work-orders/quote-review?woId=${wo.id}`)}
                      className="rounded bg-orange-500 px-3 py-2 font-semibold text-black hover:bg-orange-600"
                    >
                      Review Quote
                    </button>

                    {/* Send for Approval uses selection */}
                    <button
                      onClick={handleSendForApproval}
                      disabled={busySendApproval || selectedForApproval.size === 0}
                      className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {busySendApproval ? "Sending…" : `Send for Approval (${selectedForApproval.size})`}
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
                          .eq("id", wo!.id);
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
                        const { error } = await supabase.from("work_orders").update({ status: "queued" }).eq("id", wo!.id);
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
              </>
            )}

            {/* Inspection shortcuts: only if attached */}
            {!!wo.inspection_id && (
              <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-2 font-semibold text-orange-400">Inspection</div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
                    href={`/inspection/maintenance50?inspectionId=${wo.inspection_id}`}
                  >
                    Open Inspection
                  </Link>
                  <Link
                    className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
                    href={`/inspection/maintenance50?inspectionId=${wo.inspection_id}&fuel=diesel`}
                  >
                    Open (Diesel)
                  </Link>
                </div>
              </div>
            )}
          </div>
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

      {/* Add Job modal (kept) */}
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

      {/* AI modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold">AI Suggestions</h3>
              <button className="text-sm text-neutral-300 hover:text-white" onClick={() => setAiModalOpen(false)}>
                Close
              </button>
            </div>
            <ErrorBoundary>
              {suggestedJobId ? (
                <SuggestedQuickAdd jobId={suggestedJobId} workOrderId={wo!.id} vehicleId={vehicle?.id ?? null} />
              ) : (
                <div className="text-sm text-neutral-400">Add a job line to enable AI suggestions.</div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Quick Add modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Quick Add</h3>
              <button className="text-sm text-neutral-300 hover:text-white" onClick={() => setQuickAddOpen(false)}>
                Close
              </button>
            </div>
            <ErrorBoundary>
              <MenuQuickAdd workOrderId={wo!.id} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* NEW: Focused Job modal */}
      {focusedOpen && focusedJobId && (
        <FocusedJobModal
          isOpen={focusedOpen}
          onClose={() => setFocusedOpen(false)}
          workOrderLineId={focusedJobId}
          onChanged={fetchAll}
        />
      )}

      {/* Optional: quick new chat (launch from anywhere you like) */}
      {chatOpen && currentUserId && (
        <NewChatModal
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          created_by={currentUserId}
          onCreated={() => setChatOpen(false)}
          context_type="work_order"
          context_id={wo?.id ?? null}
        />
      )}
    </div>
  );
}