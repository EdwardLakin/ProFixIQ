"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";
import PageShell from "@/features/shared/components/PageShell";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WO = DB["public"]["Tables"]["work_orders"]["Row"];

type RollupStatus = "awaiting" | "in_progress" | "on_hold" | "completed";

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
};

const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-neutral-800 bg-neutral-950/70 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  in_progress:
    "border-neutral-800 bg-neutral-950/70 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  on_hold:
    "border-neutral-800 bg-neutral-950/70 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  completed:
    "border-neutral-800 bg-neutral-950/70 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
};

function rollupStatus(lines: Line[]): RollupStatus {
  const s = new Set(
    (lines ?? []).map((l) => (l.status ?? "awaiting") as RollupStatus),
  );

  if (s.has("in_progress")) return "in_progress";
  if (s.has("on_hold")) return "on_hold";
  if (lines.length && lines.every((l) => (l.status ?? "") === "completed"))
    return "completed";
  return "awaiting";
}

function countLineStatuses(lines: Line[]) {
  let awaiting = 0;
  let in_progress = 0;
  let on_hold = 0;
  let completed = 0;

  for (const l of lines ?? []) {
    const s = (l.status ?? "awaiting") as RollupStatus;
    if (s === "awaiting") awaiting += 1;
    else if (s === "in_progress") in_progress += 1;
    else if (s === "on_hold") on_hold += 1;
    else if (s === "completed") completed += 1;
  }

  return { awaiting, in_progress, on_hold, completed };
}

// allow for legacy waiter flags on the work_orders row
type WorkOrderWaiterFlags = {
  is_waiter?: boolean | null;
  waiter?: boolean | null;
  customer_waiting?: boolean | null;
};

export default function QueuePage() {
  const supabase = createClientComponentClient<DB>();

  // auth / profile
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  // data
  const [workOrders, setWorkOrders] = useState<WO[]>([]);
  const [linesByWo, setLinesByWo] = useState<Record<string, Line[]>>({});

  // ui state
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RollupStatus | null>(null);
  const [showMineOnly, setShowMineOnly] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  /* -------------------------------------------------------------------------
   * Load auth + profile + recent work orders + lines
   * ---------------------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
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

      setUserId(user.id);

      // 2) profile → shop + role
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        setErr(profErr.message);
        setLoading(false);
        return;
      }

      if (!profile?.shop_id) {
        setErr("No shop linked to your profile yet.");
        setLoading(false);
        return;
      }

      setRole(profile.role ?? null);
      setShopId(profile.shop_id);

      // 3) recent work orders (last 30 days, excluding awaiting_approval)
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data: wos, error: woErr } = await supabase
        .from("work_orders")
        .select("*")
        .eq("shop_id", profile.shop_id)
        .neq("status", "awaiting_approval")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });

      if (woErr) {
        setErr(woErr.message);
        setLoading(false);
        return;
      }

      if (!wos?.length) {
        setWorkOrders([]);
        setLinesByWo({});
        setLoading(false);
        return;
      }

      // 4) lines for those WOs
      const ids = wos.map((w) => w.id);
      const { data: lines, error: lnErr } = await supabase
        .from("work_order_lines")
        .select("*")
        .in("work_order_id", ids);

      if (lnErr) {
        setErr(lnErr.message);
        setLoading(false);
        return;
      }

      const map: Record<string, Line[]> = {};
      (lines ?? []).forEach((l) => {
        if (!l.work_order_id) return;
        if (!map[l.work_order_id]) map[l.work_order_id] = [];
        map[l.work_order_id].push(l);
      });

      // 5) tech visibility
      const isTech =
        profile.role === "tech" ||
        profile.role === "mechanic" ||
        profile.role === "technician";

      const visibleWos: WO[] = isTech
        ? wos.filter((wo) =>
            (map[wo.id] ?? []).some((l) => l.assigned_to === user.id),
          )
        : wos;

      setWorkOrders(visibleWos);
      setLinesByWo(map);
      setLoading(false);
    })();
  }, [supabase]);

  const statuses: RollupStatus[] = [
    "awaiting",
    "in_progress",
    "on_hold",
    "completed",
  ];

  /* -------------------------------------------------------------------------
   * Overall counts per status
   * ---------------------------------------------------------------------- */
  const counts = useMemo(() => {
    const base = {
      awaiting: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
    } satisfies Record<RollupStatus, number>;

    for (const wo of workOrders) {
      const lines = linesByWo[wo.id] ?? [];
      const r = rollupStatus(lines);
      base[r] += 1;
    }
    return base;
  }, [workOrders, linesByWo]);

  /* -------------------------------------------------------------------------
   * Filtered work orders for the main list
   * ---------------------------------------------------------------------- */
  const filteredWos = useMemo(() => {
    let pool = workOrders;

    if (activeFilter != null) {
      pool = pool.filter(
        (wo) => rollupStatus(linesByWo[wo.id] ?? []) === activeFilter,
      );
    }

    if (showMineOnly && userId) {
      pool = pool.filter((wo) =>
        (linesByWo[wo.id] ?? []).some((l) => l.assigned_to === userId),
      );
    }

    return pool;
  }, [activeFilter, showMineOnly, userId, workOrders, linesByWo]);

  /* -------------------------------------------------------------------------
   * Render states
   * ---------------------------------------------------------------------- */
  if (loading) {
    return (
      <PageShell
        title="Job Queue"
        description="Live job queue for technicians, grouped by work order."
      >
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-4 py-6 text-sm text-neutral-300">
          Loading queue…
        </div>
      </PageShell>
    );
  }

  if (err) {
    return (
      <PageShell
        title="Job Queue"
        description="Live job queue for technicians, grouped by work order."
      >
        <div className="rounded-xl border border-red-500/40 bg-red-900/20 px-4 py-6 text-sm text-red-200">
          {err}
        </div>
      </PageShell>
    );
  }

  /* -------------------------------------------------------------------------
   * Main UI
   * ---------------------------------------------------------------------- */
  return (
    <PageShell
      title="Job Queue"
      description="Live view of active work orders for your shop. This is separate from the shop appointments calendar."
    >
      <div className="space-y-6">
        {/* Header row / top summary */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-300">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              Active work orders (last 30 days)
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              {workOrders.length}
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 text-xs text-neutral-300">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={showMineOnly}
                onChange={(e) => setShowMineOnly(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-orange-500"
              />
              <span>
                Show only jobs assigned to{" "}
                <span className="font-medium">me</span>
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            className="ml-auto rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-[11px] text-neutral-300 hover:border-orange-400 hover:text-orange-300"
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>

        {/* Optional debug block */}
        {showDebug && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-4 py-3 text-xs text-neutral-300">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-orange-400">
              Debug
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <div>
                  <span className="text-neutral-500">User:</span>{" "}
                  <span className="font-mono text-neutral-200">
                    {userId ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Role:</span>{" "}
                  {role ?? "—"}
                </div>
                <div>
                  <span className="text-neutral-500">Shop:</span>{" "}
                  {shopId ?? "—"}
                </div>
              </div>
              <div className="space-y-1">
                <div>
                  <span className="text-neutral-500">Visible WOs:</span>{" "}
                  {workOrders.length}
                </div>
                <div>
                  <span className="text-neutral-500">Active filter:</span>{" "}
                  {activeFilter ? STATUS_LABELS[activeFilter] : "All"}
                </div>
                <div>
                  <span className="text-neutral-500">Mine only:</span>{" "}
                  {showMineOnly ? "Yes" : "No"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status buckets */}
        <div className="grid gap-3 md:grid-cols-4">
          {statuses.map((s) => {
            const isActive = activeFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActiveFilter(isActive ? null : s)}
                className={`rounded-xl border px-3 py-3 text-left text-sm text-neutral-100 transition ${STATUS_STYLES[s]}`}
                data-active={isActive ? "true" : "false"}
              >
                <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                  {STATUS_LABELS[s]}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {counts[s] ?? 0}
                </div>
                {isActive && (
                  <div className="mt-1 text-[10px] text-orange-400">
                    Showing {STATUS_LABELS[s].toLowerCase()} work orders
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Work order list */}
        <div className="space-y-2">
          {filteredWos.map((wo) => {
            const lines = linesByWo[wo.id] ?? [];
            const status = rollupStatus(lines);
            const bucketCounts = countLineStatuses(lines);

            const slug = wo.custom_id ?? wo.id;
            const createdLabel = wo.created_at
              ? new Date(wo.created_at).toLocaleString()
              : "—";

            const waiterSource = wo as WO & WorkOrderWaiterFlags;
            const isWaiter =
              !!(
                waiterSource &&
                (waiterSource.is_waiter ||
                  waiterSource.waiter ||
                  waiterSource.customer_waiting)
              );

            return (
              <Link
                key={wo.id}
                href={`/work-orders/${slug}?mode=tech`}
                className="block rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-100 transition hover:border-orange-500 hover:bg-neutral-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-white">
                      {wo.custom_id ? wo.custom_id : `#${wo.id.slice(0, 8)}`}
                    </div>
                    {wo.custom_id && (
                      <div className="text-[10px] text-neutral-500">
                        #{wo.id.slice(0, 8)}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-neutral-400">
                      Created: {createdLabel}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-400">
                      {bucketCounts.awaiting} awaiting ·{" "}
                      {bucketCounts.in_progress} in progress ·{" "}
                      {bucketCounts.on_hold} on hold ·{" "}
                      {bucketCounts.completed} completed
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-[11px] capitalize text-neutral-300">
                      {status.replace("_", " ")}
                    </span>

                    {isWaiter && (
                      <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red-500 bg-red-500/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.9)]">
                        Waiter
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}

          {filteredWos.length === 0 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 text-sm text-neutral-400">
              No work orders in this bucket.
            </div>
          )}
        </div>

        {/* Tiny footer hint */}
        <div className="pt-2 text-[11px] text-neutral-500">
          Manage customer & vehicle details, inspections, labor, and parts from
          the individual work order page. This view is focused on{" "}
          <span className="font-medium text-neutral-300">
            technician job flow
          </span>
          , not the shop appointments calendar.
        </div>
      </div>
    </PageShell>
  );
}