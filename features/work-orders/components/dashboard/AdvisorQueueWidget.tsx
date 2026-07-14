"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import WorkOrderAiIndicatorBadge from "@/features/work-orders/components/WorkOrderAiIndicatorBadge";
import type { WorkOrderRecommendationIndicatorMap } from "@/features/ai/server/domains/workOrders/getWorkOrderRecommendationIndicators";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type Bucket = "awaiting" | "in_progress" | "on_hold" | "ready_to_invoice";

const BUCKET_LABEL: Record<Bucket, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  ready_to_invoice: "Ready to invoice",
};

const BUCKET_HINT: Record<Bucket, string> = {
  awaiting: "No active work started yet",
  in_progress: "At least one job is active",
  on_hold: "At least one job is blocked/paused",
  ready_to_invoice: "All jobs complete (or WO marked ready)",
};

const CLOSED_LINE_STATUSES = new Set(["completed", "ready_to_invoice", "invoiced"]);

function isClosedLine(status: string | null | undefined): boolean {
  return CLOSED_LINE_STATUSES.has(String(status ?? "").toLowerCase());
}

function countLineStatuses(lines: Line[]) {
  let awaiting = 0;
  let in_progress = 0;
  let on_hold = 0;
  let completed = 0;

  for (const l of lines) {
    const s = String(l.status ?? "awaiting").toLowerCase();
    if (s === "in_progress") in_progress += 1;
    else if (s === "on_hold") on_hold += 1;
    else if (s === "completed") completed += 1;
    else awaiting += 1;
  }

  return { awaiting, in_progress, on_hold, completed, total: lines.length };
}

/**
 * Advisor rollup:
 * - If WO status is ready_to_invoice => ready_to_invoice
 * - Else look at "active" (non-closed) lines:
 *    - any in_progress => in_progress
 *    - else any on_hold => on_hold
 *    - else any active lines => awaiting
 * - If no active lines (all closed) => ready_to_invoice
 */
function rollupAdvisorBucket(wo: WorkOrder, lines: Line[]): Bucket {
  const woStatus = String(wo.status ?? "").toLowerCase().replaceAll(" ", "_");
  if (woStatus === "ready_to_invoice") return "ready_to_invoice";

  const active = (lines ?? []).filter((l) => !isClosedLine(l.status));

  const statuses = new Set(active.map((l) => String(l.status ?? "awaiting").toLowerCase()));

  if (statuses.has("in_progress")) return "in_progress";
  if (statuses.has("on_hold")) return "on_hold";
  if (active.length > 0) return "awaiting";

  return "ready_to_invoice";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function woLabel(wo: WorkOrder): string {
  if (wo.custom_id) return wo.custom_id;
  return `#${wo.id.slice(0, 8)}`;
}

function woHref(wo: WorkOrder): string {
  return `/work-orders/${wo.id}?mode=view`;
}

const PANEL =
  "var(--theme-gradient-panel)";

const CHIP_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]";

const CHIP: Record<Bucket, string> = {
  awaiting: "border-sky-400/40 bg-sky-500/10 text-sky-100",
  in_progress:
    "border-[color:var(--accent-copper-light,#fed7aa)]/55 bg-[color:var(--accent-copper,#f97316)]/15 text-[color:var(--accent-copper-light,#fed7aa)]",
  on_hold: "border-amber-400/55 bg-amber-500/10 text-amber-100",
  ready_to_invoice: "border-emerald-400/55 bg-emerald-500/10 text-emerald-100",
};

function BucketButton({
  bucket,
  active,
  count,
  onClick,
}: {
  bucket: Bucket;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-xl border px-3 py-3 text-left transition",
        "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] hover:border-[color:var(--accent-copper-soft,#fdba74)]/60",
        active
          ? "ring-1 ring-[color:var(--accent-copper-soft,#fdba74)]/70 shadow-[0_0_30px_rgba(249,115,22,0.35)]"
          : "",
      ].join(" ")}
    >
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
        {BUCKET_LABEL[bucket]}
      </div>
      <div className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]">{count}</div>
      <div className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">{BUCKET_HINT[bucket]}</div>
    </button>
  );
}

export default function AdvisorQueueWidget({ embedded = false }: { embedded?: boolean }): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);


  const [role, setRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [linesByWo, setLinesByWo] = useState<Record<string, Line[]>>({});
  const [indicatorsByWo, setIndicatorsByWo] = useState<WorkOrderRecommendationIndicatorMap>({});

  const [activeBucket, setActiveBucket] = useState<Bucket>("ready_to_invoice");

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      setErr("You must be signed in.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("id, shop_id, role, user_id")
      .or(`id.eq.${user.id},user_id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    if (profErr) {
      setErr(profErr.message);
      setLoading(false);
      return;
    }

    const prof = (profile as Pick<Profile, "id" | "shop_id" | "role" | "user_id"> | null) ?? null;
    const sid = prof?.shop_id ?? null;
    const pid = prof?.id ?? null;

    setRole(prof?.role ?? null);

    if (!sid) {
      setErr("No shop linked to your profile yet.");
      setLoading(false);
      return;
    }

    if (!pid) {
      setErr("No profile found for this user.");
      setLoading(false);
      return;
    }

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: wos, error: woErr } = await supabase
      .from("work_orders")
      .select("id, custom_id, status, created_at, shop_id, advisor_id")
      .eq("shop_id", sid)
      .eq("advisor_id", pid)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(120);

    if (woErr) {
      setErr(woErr.message);
      setLoading(false);
      return;
    }

    const woRows = (wos ?? []) as WorkOrder[];
    if (woRows.length === 0) {
      setWorkOrders([]);
      setLinesByWo({});
      setLoading(false);
      return;
    }

    const ids = woRows.map((w) => w.id);

    const { data: lines, error: lnErr } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, status, created_at")
      .in("work_order_id", ids);

    if (lnErr) {
      setErr(lnErr.message);
      setLoading(false);
      return;
    }

    const map: Record<string, Line[]> = {};
    for (const l of (lines ?? []) as Line[]) {
      const wid = l.work_order_id;
      if (!wid) continue;
      if (!map[wid]) map[wid] = [];
      map[wid].push(l);
    }

    setWorkOrders(woRows);
    setLinesByWo(map);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);


  useEffect(() => {
    const workOrderIds = workOrders.map((workOrder) => workOrder.id);

    if (workOrderIds.length === 0) {
      setIndicatorsByWo({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/work-orders/ai/indicators", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workOrderIds }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        setIndicatorsByWo(json?.indicators && typeof json.indicators === "object" ? json.indicators as WorkOrderRecommendationIndicatorMap : {});
      } catch {
        if (cancelled) return;
        setIndicatorsByWo({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workOrders]);

  const isTech = useMemo(() => {
    const r = String(role ?? "").toLowerCase();
    return r === "tech" || r === "mechanic" || r === "technician";
  }, [role]);

  const enriched = useMemo(() => {
    return workOrders.map((wo) => {
      const lines = linesByWo[wo.id] ?? [];
      const bucket = rollupAdvisorBucket(wo, lines);
      const counts = countLineStatuses(lines);

      return { wo, lines, bucket, counts };
    });
  }, [workOrders, linesByWo]);

  const countsByBucket = useMemo(() => {
    const base: Record<Bucket, number> = {
      awaiting: 0,
      in_progress: 0,
      on_hold: 0,
      ready_to_invoice: 0,
    };
    for (const row of enriched) base[row.bucket] += 1;
    return base;
  }, [enriched]);

  const visibleRows = useMemo(() => {
    const filtered = enriched.filter((r) => r.bucket === activeBucket);
    return filtered.slice(0, 8);
  }, [enriched, activeBucket]);

  if (isTech) return <></>;

  return (
    <section className={embedded ? "space-y-4" : PANEL + " overflow-hidden"}>
      <div className={embedded ? "flex items-center justify-end gap-2" : "flex items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] px-4 py-3"}>
        <div className="min-w-0">
          {!embedded ? (
            <>
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                My advisor queue
              </div>
              <div className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Only work orders assigned to you (last 30 days)
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:border-[color:var(--accent-copper-soft,#fdba74)]/60 hover:bg-[color:var(--theme-surface-inset)]"
            title="Refresh widget"
          >
            Refresh
          </button>
          <Link
            href="/work-orders/view"
            className="rounded-full border border-[color:var(--accent-copper,#f97316)]/60 bg-[color:var(--accent-copper,#f97316)]/10 px-3 py-1 text-xs font-semibold text-[color:var(--accent-copper-light,#fed7aa)] hover:bg-[color:var(--accent-copper,#f97316)]/15"
          >
            Open list →
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="px-4 py-5 text-sm text-[color:var(--theme-text-secondary)]">Loading queue…</div>
      ) : err ? (
        <div className="px-4 py-5 text-sm text-red-200">{err}</div>
      ) : (
        <div className={embedded ? "space-y-4" : "space-y-4 px-4 py-4"}>
          <div className="grid gap-3 md:grid-cols-4">
            {(["awaiting", "in_progress", "on_hold", "ready_to_invoice"] as Bucket[]).map((b) => (
              <BucketButton
                key={b}
                bucket={b}
                active={activeBucket === b}
                count={countsByBucket[b] ?? 0}
                onClick={() => setActiveBucket(b)}
              />
            ))}
          </div>

          <div className="space-y-2">
            {visibleRows.map(({ wo, counts, bucket }) => {
              return (
                <Link
                  key={wo.id}
                  href={woHref(wo)}
                  className="block rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--accent-copper-soft,#fdba74)]/60 hover:bg-[color:var(--theme-surface-inset)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-[color:var(--theme-text-primary)]">
                          {woLabel(wo)}
                        </span>
                        <span className={CHIP_BASE + " " + CHIP[bucket]}>
                          {BUCKET_LABEL[bucket]}
                        </span>
                        <span className="text-[11px] text-[color:var(--theme-text-muted)]">
                          {formatDate(wo.created_at)}
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                        Lines:{" "}
                        <span className="text-[color:var(--theme-text-secondary)]">{counts.awaiting} awaiting</span> ·{" "}
                        <span className="text-[color:var(--theme-text-secondary)]">
                          {counts.in_progress} in progress
                        </span>{" "}
                        ·{" "}
                        <span className="text-[color:var(--theme-text-secondary)]">{counts.on_hold} on hold</span> ·{" "}
                        <span className="text-[color:var(--theme-text-secondary)]">
                          {counts.completed} completed
                        </span>
                      </div>
                      <WorkOrderAiIndicatorBadge indicator={indicatorsByWo[wo.id]} className="mt-2" />
                    </div>

                    <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2.5 py-1 text-[11px] text-[color:var(--theme-text-primary)]">
                      Open →
                    </span>
                  </div>
                </Link>
              );
            })}

            {visibleRows.length === 0 ? (
              <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-secondary)]">
                No work orders in this bucket.
              </div>
            ) : null}
          </div>

          <div className="text-[11px] text-[color:var(--theme-text-muted)]">
            This widget is read-only. Use <span className="text-[color:var(--theme-text-secondary)]">Work Orders → View</span> for status changes, invoice review, and assignments.
          </div>
        </div>
      )}
    </section>
  );
}
