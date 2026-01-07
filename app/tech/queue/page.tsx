"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderSlim = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  "id" | "custom_id"
>;
type PartRequest = DB["public"]["Tables"]["part_requests"]["Row"];

const PREFS_KEY = "profixiq.tech.prefs.v1";

type TechPrefs = {
  defaultBucket: "awaiting" | "in_progress" | "on_hold";
  showUnassigned: boolean;
  compactCards: boolean;
  autoRefresh: boolean;
};

type RollupStatus = "awaiting" | "in_progress" | "on_hold";

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
};

/**
 * Match JobCard vibes:
 * - awaiting: slate
 * - in_progress: copper/orange
 * - on_hold: amber
 */
const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-slate-600/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),rgba(15,23,42,0.98))] hover:border-slate-300/70",
  in_progress:
    "border-[color:var(--accent-copper-soft,#fdba74)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.28),rgba(15,23,42,0.98))] hover:border-[color:var(--accent-copper-soft,#fdba74)]/90",
  on_hold:
    "border-amber-400/80 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.24),rgba(15,23,42,0.97))] hover:border-amber-300/80",
};

const ACTIVE_RING =
  "ring-2 ring-[color:var(--accent-copper-soft,#fdba74)]/90 shadow-[0_0_35px_rgba(249,115,22,0.55)]";

const SAME_WO_RING =
  "ring-1 ring-white/10 shadow-[0_0_22px_rgba(255,255,255,0.06)]";

const PARTS_BADGE =
  "inline-flex items-center gap-1 rounded-full border border-sky-400/55 bg-sky-900/25 px-2 py-0.5 text-[10px] font-semibold text-sky-100";

const HOLD_BADGE =
  "inline-flex items-center gap-1 rounded-full border border-amber-400/55 bg-amber-900/25 px-2 py-0.5 text-[10px] font-semibold text-amber-100";

const CLOSED_PART_STATUSES = ["fulfilled", "rejected", "cancelled"] as const;

function isCompletedLike(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "completed" || s === "ready_to_invoice" || s === "invoiced";
}

function toBucket(status: string | null | undefined): RollupStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "in_progress") return "in_progress";
  if (s === "on_hold") return "on_hold";
  return "awaiting";
}

function readPrefs(): TechPrefs {
  const fallback: TechPrefs = {
    defaultBucket: "awaiting",
    showUnassigned: false,
    compactCards: false,
    autoRefresh: false,
  };

  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<TechPrefs>;
    const bucket = parsed.defaultBucket;
    return {
      ...fallback,
      ...parsed,
      defaultBucket:
        bucket === "awaiting" || bucket === "in_progress" || bucket === "on_hold"
          ? bucket
          : fallback.defaultBucket,
    };
  } catch {
    return fallback;
  }
}

export default function TechQueuePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [prefs, setPrefs] = useState<TechPrefs>({
    defaultBucket: "awaiting",
    showUnassigned: false,
    compactCards: false,
    autoRefresh: false,
  });

  const [lines, setLines] = useState<Line[]>([]);
  const [workOrderMap, setWorkOrderMap] = useState<
    Record<string, { id: string; custom_id: string | null }>
  >({});

  // active job / work order highlighting
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [activeWorkOrderId, setActiveWorkOrderId] = useState<string | null>(
    null,
  );

  // parts requests (open) mapped by job_id and work_order_id
  const [partsByJobId, setPartsByJobId] = useState<Record<string, number>>({});
  const [partsByWorkOrderId, setPartsByWorkOrderId] = useState<
    Record<string, number>
  >({});

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RollupStatus | null>(null);

  // load prefs once + subscribe to changes (when settings page updates localStorage)
  useEffect(() => {
    const p = readPrefs();
    setPrefs(p);
    setActiveFilter(p.defaultBucket); // default tab from prefs

    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREFS_KEY) return;
      const next = readPrefs();
      setPrefs(next);
      // only auto-switch tab if user hasn't manually picked something different
      setActiveFilter((cur) => cur ?? next.defaultBucket);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setErr(null);

      // 1) auth
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setErr("You must be signed in.");
        setLoading(false);
        return;
      }

      // 2) profile (for shop_id)
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        setErr(profErr.message);
        setLoading(false);
        return;
      }
      if (!prof?.shop_id) {
        setErr("No shop linked to your profile yet.");
        setLoading(false);
        return;
      }

      // 3) fetch work-order lines
      const baseQuery = supabase
        .from("work_order_lines")
        .select("*")
        .order("created_at", { ascending: false });

      const { data: techLines, error: linesErr } = prefs.showUnassigned
        ? await baseQuery.or(`assigned_to.eq.${user.id},assigned_to.is.null`)
        : await baseQuery.eq("assigned_to", user.id);

      if (linesErr) {
        setErr(linesErr.message);
        setLoading(false);
        return;
      }

      const raw = (techLines ?? []) as Line[];
      const activeQueue = raw.filter((l) => !isCompletedLike(l.status));
      setLines(activeQueue);

      // 4) determine active punched-in line (strong highlight)
      const punched = activeQueue.find((l) => {
        const anyLine = l as unknown as {
          punched_in_at?: string | null;
          punched_out_at?: string | null;
        };
        return anyLine.punched_in_at != null && anyLine.punched_out_at == null;
      });

      setActiveLineId(punched?.id ?? null);
      setActiveWorkOrderId(punched?.work_order_id ?? null);

      // 5) fetch work orders for display labels
      const woIds = Array.from(
        new Set(
          activeQueue
            .map((l) => l.work_order_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (woIds.length > 0) {
        const { data: wos } = await supabase
          .from("work_orders")
          .select("id, custom_id")
          .in("id", woIds);

        const map: Record<string, { id: string; custom_id: string | null }> =
          {};
        (wos ?? []).forEach((wo) => {
          const row = wo as WorkOrderSlim;
          map[row.id] = { id: row.id, custom_id: row.custom_id ?? null };
        });
        setWorkOrderMap(map);
      } else {
        setWorkOrderMap({});
      }

      // 6) fetch open part requests for this tech in this shop (involved)
      const { data: prs, error: prErr } = await supabase
        .from("part_requests")
        .select(
          "id, shop_id, work_order_id, job_id, requested_by, assigned_to, status",
        )
        .eq("shop_id", prof.shop_id)
        .not("status", "in", `(${CLOSED_PART_STATUSES.join(",")})`)
        .or(`requested_by.eq.${user.id},assigned_to.eq.${user.id}`);

      if (prErr) {
        console.error("[TechQueue] part_requests load error:", prErr);
        setPartsByJobId({});
        setPartsByWorkOrderId({});
      } else {
        const jobMap: Record<string, number> = {};
        const woMap: Record<string, number> = {};

        (prs ?? []).forEach((p) => {
          const row = p as PartRequest;
          if (row.job_id) jobMap[row.job_id] = (jobMap[row.job_id] ?? 0) + 1;
          if (row.work_order_id)
            woMap[row.work_order_id] = (woMap[row.work_order_id] ?? 0) + 1;
        });

        setPartsByJobId(jobMap);
        setPartsByWorkOrderId(woMap);
      }

      setLoading(false);
    },
    [prefs.showUnassigned, supabase],
  );

  // initial load
  useEffect(() => {
    void load();
  }, [load]);

  // auto-refresh (local pref) — refresh just the data, keep UI stable
  useEffect(() => {
    if (!prefs.autoRefresh) return;

    const id = window.setInterval(() => {
      void load({ silent: true });
    }, 15_000);

    return () => window.clearInterval(id);
  }, [prefs.autoRefresh, load]);

  // counts per bucket
  const counts = useMemo(() => {
    const base: Record<RollupStatus, number> = {
      awaiting: 0,
      in_progress: 0,
      on_hold: 0,
    };
    for (const line of lines) {
      base[toBucket(line.status)] += 1;
    }
    return base;
  }, [lines]);

  // filtered list
  const filteredLines = useMemo(() => {
    if (activeFilter == null) return lines;
    return lines.filter((l) => toBucket(l.status) === activeFilter);
  }, [lines, activeFilter]);

  if (loading)
    return <div className="p-6 text-white">Loading assigned jobs…</div>;
  if (err) return <div className="p-6 text-red-200">{err}</div>;

  const compact = prefs.compactCards;

  return (
    <div className="p-6 text-white">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-blackops text-[color:var(--accent-copper,#f97316)]">
          Your Assigned Jobs
        </h1>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-300">
          {prefs.autoRefresh ? (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-900/20 px-2 py-0.5 text-emerald-100">
              Auto-refresh ON
            </span>
          ) : (
            <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-neutral-300">
              Auto-refresh OFF
            </span>
          )}
          {prefs.showUnassigned ? (
            <span className="rounded-full border border-sky-400/40 bg-sky-900/20 px-2 py-0.5 text-sky-100">
              Showing unassigned too
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-semibold text-white/90 hover:border-[color:var(--accent-copper-soft,#fdba74)]/70 hover:bg-white/5"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* FILTER BUTTONS */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {(["awaiting", "in_progress", "on_hold"] as RollupStatus[]).map((s) => {
          const isActive = activeFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActiveFilter(isActive ? null : s)}
              className={[
                "rounded-2xl border text-left transition",
                compact ? "p-3" : "p-4",
                STATUS_STYLES[s],
                isActive ? "ring-1 ring-white/20" : "",
              ].join(" ")}
            >
              <div className="text-xs uppercase tracking-wide text-neutral-300">
                {STATUS_LABELS[s]}
              </div>
              <div
                className={
                  compact
                    ? "mt-1 text-2xl font-semibold"
                    : "mt-1 text-3xl font-semibold"
                }
              >
                {counts[s]}
              </div>
              {isActive && (
                <div className="mt-1 text-[10px] text-neutral-200/90">
                  Showing {STATUS_LABELS[s].toLowerCase()}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* LIST */}
      <div className="space-y-2">
        {filteredLines.map((line) => {
          const bucket = toBucket(line.status);
          const wo = line.work_order_id
            ? workOrderMap[line.work_order_id]
            : null;

          const woLabel = wo?.custom_id
            ? wo.custom_id
            : line.work_order_id
              ? `WO #${line.work_order_id.slice(0, 8)}`
              : "Work order";

          const title = (line.description || line.complaint || "Untitled job").trim();

          const isActiveJob = Boolean(activeLineId && line.id === activeLineId);
          const isSameWorkOrder =
            Boolean(activeWorkOrderId) &&
            Boolean(line.work_order_id) &&
            line.work_order_id === activeWorkOrderId &&
            !isActiveJob;

          const partsCount =
            (line.id ? partsByJobId[line.id] : 0) ||
            (line.work_order_id ? partsByWorkOrderId[line.work_order_id] : 0) ||
            0;

          const focusHref = line.work_order_id
            ? `/work-orders/${line.work_order_id}?focus=${line.id}&mode=tech`
            : "";

          return (
            <div
              key={line.id}
              className={[
                "relative overflow-hidden rounded-2xl border shadow-[0_18px_45px_rgba(0,0,0,0.75)]",
                compact ? "p-3" : "p-4",
                bucket === "in_progress"
                  ? "border-[color:var(--accent-copper-soft,#fdba74)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.22),rgba(15,23,42,0.98))]"
                  : bucket === "on_hold"
                    ? "border-amber-400/70 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),rgba(15,23,42,0.98))]"
                    : "border-slate-600/60 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),rgba(15,23,42,0.98))]",
                isActiveJob ? ACTIVE_RING : "",
                isSameWorkOrder ? SAME_WO_RING : "",
              ].join(" ")}
            >
              <div className="pointer-events-none absolute inset-y-2 left-2 w-[3px] rounded-full bg-gradient-to-b from-transparent via-white/20 to-transparent opacity-70" />

              <div className="flex items-center justify-between gap-3 pl-3">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-300">
                    {woLabel}
                    {isSameWorkOrder ? (
                      <span className="ml-2 text-[10px] text-neutral-200/80">
                        • Same WO
                      </span>
                    ) : null}
                    {isActiveJob ? (
                      <span className="ml-2 text-[10px] text-[color:var(--accent-copper-light,#fed7aa)]">
                        • Active
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={
                      compact
                        ? "mt-1 truncate text-sm font-semibold text-white"
                        : "mt-1 truncate text-base font-semibold text-white"
                    }
                  >
                    {title}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[10px] font-semibold text-neutral-200">
                      {STATUS_LABELS[bucket]}
                    </span>

                    {partsCount > 0 ? (
                      <span className={PARTS_BADGE}>
                        🧾 Parts{" "}
                        <span className="text-sky-200/90">({partsCount})</span>
                      </span>
                    ) : null}

                    {bucket === "on_hold" ? (
                      <span className={HOLD_BADGE}>⏸ Hold</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {focusHref ? (
                    <button
                      type="button"
                      onClick={() => router.push(focusHref)}
                      className="rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs font-semibold text-white/90 hover:border-[color:var(--accent-copper-soft,#fdba74)]/70 hover:bg-white/5"
                    >
                      Open →
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {filteredLines.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-sm text-neutral-300">
            No jobs in this bucket.
          </div>
        )}
      </div>
    </div>
  );
}