// app/work-orders/view/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import { toast } from "sonner";

import { WorkOrderAssignedSummary } from "@/features/work-orders/components/WorkOrderAssignedSummary";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Customer = DB["public"]["Tables"]["customers"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type Row = WorkOrder & {
  customers: Pick<Customer, "first_name" | "last_name" | "phone" | "email"> | null;
  vehicles: Pick<Vehicle, "year" | "make" | "model" | "license_plate"> | null;
};

/* --------------------------- Invoice Review Types --------------------------- */
type ReviewIssue = { kind: string; lineId?: string; message: string };
type ReviewResponse = { ok: boolean; issues: ReviewIssue[] };

/* --------------------------- Status badges --------------------------- */
type StatusKey =
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

const BADGE_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium tracking-[0.08em] uppercase";

const STATUS_BADGE: Record<StatusKey, string> = {
  awaiting_approval: "bg-blue-500/10 border-blue-400/60 text-blue-100",
  awaiting: "bg-sky-500/10 border-sky-400/60 text-sky-100",
  queued: "bg-indigo-500/10 border-indigo-400/60 text-indigo-100",
  in_progress:
    "bg-[var(--accent-copper)]/15 border-[var(--accent-copper-light)]/70 text-[var(--accent-copper-light)]",
  on_hold: "bg-amber-500/10 border-amber-400/70 text-amber-100",
  planned: "bg-purple-500/10 border-purple-400/70 text-purple-100",
  new: "bg-neutral-900/80 border-neutral-500/80 text-neutral-100",
  completed: "bg-green-500/10 border-green-400/70 text-green-100",
  ready_to_invoice: "bg-emerald-500/10 border-emerald-400/70 text-emerald-100",
  invoiced: "bg-teal-500/10 border-teal-400/70 text-teal-100",
};

const chip = (s: string | null | undefined) => {
  const key = (s ?? "awaiting").toLowerCase().replaceAll(" ", "_") as StatusKey;
  const cls = STATUS_BADGE[key] ?? STATUS_BADGE.awaiting;
  return `${BADGE_BASE} ${cls}`;
};

/** “Normal flow” = tech/active; hides AA, completed, billing states */
const NORMAL_FLOW_STATUSES: StatusKey[] = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "planned",
  "new",
];

// roles that can assign techs from this view
const ASSIGN_ROLES = new Set(["owner", "admin", "manager", "advisor"]);

/* --------------------------- Themed input styles --------------------------- */
const INPUT_DARK =
  "w-full rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs sm:text-sm text-neutral-100 placeholder:text-neutral-500 " +
  "shadow-[0_0_18px_rgba(0,0,0,0.8)] backdrop-blur focus:border-[var(--accent-copper)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper)]";
const SELECT_DARK =
  "w-full rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs sm:text-sm text-neutral-100 " +
  "shadow-[0_0_18px_rgba(0,0,0,0.8)] backdrop-blur focus:border-[var(--accent-copper)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper)]";
const BUTTON_MUTED =
  "rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs sm:text-sm text-neutral-100 shadow-[0_0_14px_rgba(0,0,0,0.7)] " +
  "transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/15 hover:text-white active:opacity-80";

export default function WorkOrdersView(): JSX.Element {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  // assigning
  const [assigningFor, setAssigningFor] = useState<string | null>(null);
  const [techs, setTechs] = useState<Array<Pick<Profile, "id" | "full_name" | "role">>>(
    [],
  );
  const [selectedTechId, setSelectedTechId] = useState<string>("");

  const [currentRole, setCurrentRole] = useState<string | null>(null);

  // 🔁 version counter to force assigned summary to refetch
  const [, setAssignVersion] = useState(0);

  // ✅ invoice review loading indicator per row
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);

  // ✅ store review result per work order (gate + indicators)
  const [reviewByWo, setReviewByWo] = useState<Record<string, ReviewResponse | undefined>>(
    {},
  );

  // -------------------------------------------------------------------
  // Load work orders
  // -------------------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    let query = supabase
      .from("work_orders")
      .select(
        `
        *,
        customers:customers(first_name,last_name,phone,email),
        vehicles:vehicles(year,make,model,license_plate)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (status === "") {
      query = query.in("status", NORMAL_FLOW_STATUSES as unknown as string[]);
    } else {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const workOrders = data as Row[];

    const qlc = q.trim().toLowerCase();
    const filtered =
      qlc.length === 0
        ? workOrders
        : workOrders.filter((r) => {
            const name = [r.customers?.first_name ?? "", r.customers?.last_name ?? ""]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            const plate = r.vehicles?.license_plate?.toLowerCase() ?? "";
            const ymm = [
              r.vehicles?.year ?? "",
              r.vehicles?.make ?? "",
              r.vehicles?.model ?? "",
            ]
              .join(" ")
              .toLowerCase();
            const cid = (r.custom_id ?? "").toLowerCase();
            return (
              r.id.toLowerCase().includes(qlc) ||
              cid.includes(qlc) ||
              name.includes(qlc) ||
              plate.includes(qlc) ||
              ymm.includes(qlc)
            );
          });

    setRows(filtered);
    setLoading(false);
  }, [q, status, supabase]);

  // -------------------------------------------------------------------
  // Invoice review gate (AI)
  // -------------------------------------------------------------------
  const runInvoiceReview = useCallback(async (woId: string) => {
  try {
    setReviewLoadingId(woId);

    const res = await fetch(`/api/work-orders/${woId}/invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const raw = await res.text();

    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!res.ok) {
      console.error("[invoice-review] Non-OK response", {
        status: res.status,
        statusText: res.statusText,
        raw,
      });
      toast.error(`Invoice review failed (${res.status}).`);
      return;
    }

    // Validate shape
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).ok !== "boolean"
    ) {
      console.error("[invoice-review] Invalid JSON shape", { raw, parsed });
      toast.error("Invoice review failed (invalid response shape).");
      return;
    }

    const obj = parsed as Record<string, unknown>;
    const issues = Array.isArray(obj.issues) ? (obj.issues as ReviewIssue[]) : [];

    const safeResult: ReviewResponse = {
      ok: Boolean(obj.ok),
      issues,
    };

    setReviewByWo((prev) => ({ ...prev, [woId]: safeResult }));

    if (safeResult.ok) {
      toast.success("Invoice review passed ✅ Ready to invoice.");
    } else {
      toast.error(
        `Invoice review found ${issues.length} issue(s)${
          issues[0]?.message ? `: ${issues[0].message}` : ""
        }`,
      );
    }
  } catch (e) {
    console.error("[invoice-review] crash:", e);
    toast.error("Invoice review crashed");
  } finally {
    setReviewLoadingId(null);
  }
}, []);

  // -------------------------------------------------------------------
  // Auth + portal role + mechanics
  // -------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user?.id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        setCurrentRole(prof?.role ?? null);
      }

      try {
        const res = await fetch("/api/assignables");
        const json = (await res.json()) as {
          data?: Array<Pick<Profile, "id" | "full_name" | "role">>;
        };
        if (res.ok) {
          setTechs(json.data ?? []);
        } else {
          // eslint-disable-next-line no-console
          console.warn("Failed to load mechanics:", json);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Failed to load mechanics:", e);
      }
    })();
  }, [supabase]);

  const canAssign = currentRole ? ASSIGN_ROLES.has(currentRole) : false;

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel("work_orders:list")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => {
        setTimeout(() => void load(), 60);
      })
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase, load]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this work order? This cannot be undone.")) return;

      const prev = rows;
      setRows((r) => r.filter((x) => x.id !== id));

      const { error: lineErr } = await supabase
        .from("work_order_lines")
        .delete()
        .eq("work_order_id", id);

      if (lineErr) {
        alert("Failed to delete job lines: " + lineErr.message);
        setRows(prev);
        return;
      }

      const { error } = await supabase.from("work_orders").delete().eq("id", id);
      if (error) {
        alert("Failed to delete: " + error.message);
        setRows(prev);
      }
    },
    [rows, supabase],
  );

  const handleAssignAll = useCallback(
    async (woId: string) => {
      if (!selectedTechId) {
        alert("Choose a mechanic first.");
        return;
      }

      try {
        const res = await fetch("/api/work-orders/assign-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            work_order_id: woId,
            tech_id: selectedTechId,
            only_unassigned: true,
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          alert(json.error || "Failed to assign.");
          return;
        }
        setAssigningFor(null);
        await load();
        setAssignVersion((v) => v + 1);
        toast.success("Work order assigned to mechanic.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to assign.";
        alert(msg);
      }
    },
    [selectedTechId, load],
  );

  // -------------------------------------------------------------------
  // NEW: open invoice page (replaces modal)
  // -------------------------------------------------------------------
  const openInvoicePage = useCallback(
    (woId: string) => {
      if (!woId) return;
      router.push(`/work-orders/invoice/${woId}`);
    },
    [router],
  );

  const total = rows.length;
  const activeCount = useMemo(
    () =>
      rows.filter((r) =>
        NORMAL_FLOW_STATUSES.includes(
          (r.status ?? "awaiting").toLowerCase().replaceAll(" ", "_") as StatusKey,
        ),
      ).length,
    [rows],
  );
  const awaitingApprovalCount = useMemo(
    () => rows.filter((r) => (r.status ?? "").toLowerCase() === "awaiting_approval").length,
    [rows],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 bg-background px-4 py-6 text-foreground">
      {/* Header card */}
      <section className="metal-panel metal-panel--card rounded-2xl border border-white/10 px-4 py-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-blackops tracking-[0.18em] text-[var(--accent-copper-light)]">
              Work Orders
            </h1>
            <p className="mt-1 text-[0.75rem] text-neutral-300">
              Live view of active jobs, their status, and technician assignments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/work-orders/create"
              className="inline-flex items-center justify-center rounded-full bg-[var(--accent-copper)] px-3.5 py-1.5 text-sm font-semibold text-black shadow-[0_0_26px_rgba(0,0,0,0.9)] transition hover:opacity-90"
            >
              <span className="mr-1.5 text-base leading-none">+</span>
              New work order
            </Link>
          </div>
        </div>
      </section>

      {/* Filters + stats strip */}
      <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/35 p-3 text-xs shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-[220px] flex-1">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              placeholder="Search id, custom id, customer, plate, YMM…"
              className={INPUT_DARK}
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={SELECT_DARK + " min-w-[200px]"}
              aria-label="Filter by status"
            >
              <option value="">Active (normal flow)</option>
              <option value="awaiting_approval">Awaiting approval</option>
              <option value="awaiting">Awaiting</option>
              <option value="queued">Queued</option>
              <option value="in_progress">In progress</option>
              <option value="on_hold">On hold</option>
              <option value="planned">Planned</option>
              <option value="new">New</option>
              <option value="completed">Completed</option>
              <option value="ready_to_invoice">Ready to invoice</option>
              <option value="invoiced">Invoiced</option>
            </select>
            <button
              onClick={() => {
                void load();
                setAssignVersion((v) => v + 1);
              }}
              className={BUTTON_MUTED}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-[0.7rem] text-neutral-300">
          <div className="flex flex-col">
            <span className="uppercase tracking-[0.13em] text-neutral-500">Total</span>
            <span className="text-sm font-semibold text-white">{total}</span>
          </div>
          <div className="h-7 w-px bg-white/10" />
          <div className="flex flex-col">
            <span className="uppercase tracking-[0.13em] text-neutral-500">Active</span>
            <span className="text-sm font-semibold text-sky-200">{activeCount}</span>
          </div>
          <div className="h-7 w-px bg-white/10" />
          <div className="flex flex-col">
            <span className="uppercase tracking-[0.13em] text-neutral-500">
              Awaiting approval
            </span>
            <span className="text-sm font-semibold text-blue-200">{awaitingApprovalCount}</span>
          </div>
        </div>
      </section>

      {err && (
        <div className="rounded-xl border border-red-500/50 bg-red-950/60 px-3 py-2 text-xs text-red-100">
          {err}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-300 shadow-[0_0_40px_rgba(0,0,0,0.7)]">
          Loading work orders…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/20 bg-black/40 p-6 text-sm text-neutral-400 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
          No work orders match your current filters.
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/12 bg-black/30 shadow-[0_0_50px_rgba(0,0,0,0.9)] backdrop-blur">
          <div className="hidden border-b border-white/8 bg-black/45 px-4 py-2 text-[0.7rem] uppercase tracking-[0.12em] text-neutral-500 sm:grid sm:grid-cols-[110px,1.6fr,1.1fr,auto] sm:gap-3">
            <div>Date</div>
            <div>Work order / customer / vehicle</div>
            <div>Assigned to</div>
            <div className="text-right">Actions</div>
          </div>

          <div className="divide-y divide-white/8">
            {rows.map((r) => {
              const href = `/work-orders/${r.custom_id ?? r.id}?mode=view`;
              const isAssigning = assigningFor === r.id;

              const customerName = r.customers
                ? [r.customers.first_name ?? "", r.customers.last_name ?? ""]
                    .filter(Boolean)
                    .join(" ")
                : "";

              const vehicleLabel = r.vehicles
                ? `${r.vehicles.year ?? ""} ${r.vehicles.make ?? ""} ${r.vehicles.model ?? ""}`.trim()
                : "";

              const plate = r.vehicles?.license_plate ?? "";

              const statusLower = String(r.status ?? "").toLowerCase();
              const isReadyToInvoice =
                statusLower === "ready_to_invoice" || statusLower === "completed";

              const review = reviewByWo[r.id];
              const reviewedOk = Boolean(review?.ok);
              const issueCount = review?.issues?.length ?? 0;

              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 bg-gradient-to-br from-black/60 to-black/40 px-3 py-3 text-sm sm:grid sm:grid-cols-[110px,1.6fr,1.1fr,auto] sm:items-center sm:gap-3 hover:bg-black/70"
                >
                  {/* Date */}
                  <div className="text-[0.7rem] text-neutral-400">
                    {r.created_at ? format(new Date(r.created_at), "PP") : "—"}
                  </div>

                  {/* Main: id, status, customer + vehicle */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={href}
                        className="text-sm font-semibold text-white underline decoration-neutral-600/50 underline-offset-2 hover:decoration-[var(--accent-copper-light)]"
                      >
                        {r.custom_id ? r.custom_id : `#${r.id.slice(0, 8)}`}
                      </Link>

                      {r.custom_id && (
                        <span className="rounded-full border border-white/15 bg-black/60 px-1.5 py-0.5 text-[0.65rem] font-mono text-neutral-400">
                          #{r.id.slice(0, 6)}
                        </span>
                      )}

                      <span className={chip(r.status)}>
                        {(r.status ?? "awaiting").replaceAll("_", " ")}
                      </span>

                      {/* ✅ Review result pill */}
                      {review ? (
                        reviewedOk ? (
                          <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] text-emerald-200">
                            Reviewed ✓
                          </span>
                        ) : (
                          <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[0.65rem] text-amber-200">
                            Issues: {issueCount}
                          </span>
                        )
                      ) : null}
                    </div>

                    <div className="truncate text-[0.8rem] text-neutral-300">
                      {customerName || "No customer"}{" "}
                      <span className="mx-1 text-neutral-600">•</span>
                      {vehicleLabel || "No vehicle"}
                      {plate ? (
                        <span className="ml-1 text-neutral-400">({plate})</span>
                      ) : null}
                    </div>
                  </div>

                  {/* Assigned to */}
                  <div className="text-[0.75rem] text-neutral-300">
                    <WorkOrderAssignedSummary workOrderId={r.id} />
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Link
                      href={href}
                      className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-neutral-100 transition hover:border-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/20"
                    >
                      Open
                    </Link>

                    {/* ✅ Invoice review button (AI) */}
                    {isReadyToInvoice && (
                      <button
                        onClick={() => void runInvoiceReview(r.id)}
                        disabled={reviewLoadingId === r.id || reviewedOk}
                        className={
                          reviewedOk
                            ? "rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100 opacity-70"
                            : "rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-50"
                        }
                        title={
                          reviewedOk
                            ? "Already reviewed"
                            : "Check required fields before invoicing"
                        }
                      >
                        {reviewedOk
                          ? "Reviewed"
                          : reviewLoadingId === r.id
                            ? "Reviewing…"
                            : "Invoice review"}
                      </button>
                    )}

                    {/* ✅ Invoice (page) */}
                    {isReadyToInvoice && (
                      <button
                        onClick={() => openInvoicePage(r.id)}
                        disabled={!reviewedOk}
                        className={
                          reviewedOk
                            ? "rounded-full border border-[var(--accent-copper-light)] bg-[var(--accent-copper)]/15 px-2.5 py-1 text-xs text-[var(--accent-copper-light)] transition hover:bg-[var(--accent-copper)]/25"
                            : "rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-500 opacity-60"
                        }
                        title={
                          reviewedOk
                            ? "Open invoice page"
                            : "Run invoice review first"
                        }
                      >
                        Invoice
                      </button>
                    )}

                    <button
                      onClick={() => void handleDelete(r.id)}
                      className="rounded-full border border-red-500/60 bg-red-500/10 px-2.5 py-1 text-xs text-red-200 transition hover:bg-red-500/20"
                    >
                      Delete
                    </button>

                    {canAssign && (
                      <>
                        {!isAssigning ? (
                          <button
                            onClick={() => setAssigningFor(r.id)}
                            className="rounded-full border border-sky-500/60 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-100 transition hover:bg-sky-500/25"
                          >
                            Assign
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <select
                              value={selectedTechId}
                              onChange={(e) => setSelectedTechId(e.target.value)}
                              className={
                                SELECT_DARK +
                                " h-8 min-w-[150px] px-2 py-1 text-[0.7rem]"
                              }
                            >
                              <option value="">Pick mechanic…</option>
                              {techs.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.full_name ?? "(no name)"}{" "}
                                  {t.role ? `(${t.role})` : ""}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => void handleAssignAll(r.id)}
                              className="rounded-full bg-[var(--accent-copper)] px-2 py-1 text-[0.7rem] font-semibold text-black shadow-[0_0_18px_rgba(0,0,0,0.9)] hover:opacity-90"
                            >
                              Apply
                            </button>
                            <button
                              onClick={() => setAssigningFor(null)}
                              className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[0.7rem] text-neutral-200 hover:bg-white/10"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}