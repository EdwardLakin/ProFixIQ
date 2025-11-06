"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

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

// slightly different accents so you can tell they’re clickable
const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-slate-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  in_progress:
    "border-amber-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  on_hold:
    "border-purple-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  completed:
    "border-emerald-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
};

function rollupStatus(lines: Line[]): RollupStatus {
  const s = new Set(
    (lines ?? []).map((l) => (l.status ?? "awaiting") as RollupStatus)
  );
  // priority
  if (s.has("in_progress")) return "in_progress";
  if (s.has("on_hold")) return "on_hold";
  if (lines.length && lines.every((l) => (l.status ?? "") === "completed"))
    return "completed";
  return "awaiting";
}

export default function QueuePage() {
  const supabase = createClientComponentClient<DB>();

  // server-ish data
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<WO[]>([]);
  const [linesByWo, setLinesByWo] = useState<Record<string, Line[]>>({});

  // ui state
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RollupStatus | null>(null);

  // load everything once in the browser
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

      // 2) profile
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

      // 3) work orders (last 30 days)
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

      // 5) apply tech visibility on client
      const isTech = profile.role === "tech" || profile.role === "mechanic";
      const visibleWos: WO[] = isTech
        ? wos.filter((wo) =>
            (map[wo.id] ?? []).some((l) => l.assigned_to === user.id)
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

  // counts per bucket
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

  // filtered list
  const filteredWos = useMemo(() => {
    if (activeFilter == null) return workOrders;
    return workOrders.filter(
      (wo) => rollupStatus(linesByWo[wo.id] ?? []) === activeFilter
    );
  }, [activeFilter, workOrders, linesByWo]);

  if (loading) {
    return <div className="p-6 text-white">Loading queue…</div>;
  }

  if (err) {
    return <div className="p-6 text-red-200">{err}</div>;
  }

  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-blackops text-orange-400">Job Queue</h1>

      {/* DEBUG (you can remove) */}
      <div className="mb-4 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
        <div className="mb-1 font-semibold text-orange-400">Debug</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <div>
              <span className="text-neutral-400">User:</span> {userId}
            </div>
            <div>
              <span className="text-neutral-400">Role:</span> {role ?? "—"}
            </div>
            <div>
              <span className="text-neutral-400">Shop:</span> {shopId ?? "—"}
            </div>
          </div>
          <div className="space-y-1">
            <div>
              <span className="text-neutral-400">Visible WOs:</span>{" "}
              {workOrders.length}
            </div>
          </div>
        </div>
      </div>

      {/* FILTER BUTTONS (no routing) */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        {statuses.map((s) => {
          const isActive = activeFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActiveFilter(isActive ? null : s)}
              className={`rounded p-3 text-left transition ${STATUS_STYLES[s]}`}
              data-active={isActive ? "true" : "false"}
            >
              <div className="text-xs uppercase tracking-wide text-neutral-400">
                {STATUS_LABELS[s]}
              </div>
              <div className="mt-1 text-2xl font-semibold">{counts[s]}</div>
              {isActive && (
                <div className="mt-1 text-[10px] text-orange-200">
                  Showing {STATUS_LABELS[s].toLowerCase()}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* LIST */}
      <div className="space-y-2">
        {filteredWos.map((wo) => {
          const lns = linesByWo[wo.id] ?? [];
          const status = rollupStatus(lns);
          const awaiting = lns.filter((l) => (l.status ?? "") === "awaiting")
            .length;
          const inProg = lns.filter((l) => (l.status ?? "") === "in_progress")
            .length;
          const onHold = lns.filter((l) => (l.status ?? "") === "on_hold")
            .length;
          const done = lns.filter((l) => (l.status ?? "") === "completed")
            .length;

          const slug = wo.custom_id ?? wo.id;

          return (
            <Link
              key={wo.id}
              href={`/work-orders/${slug}?mode=tech`}
              className="block rounded border border-neutral-800 bg-neutral-900 p-3 transition hover:border-orange-500"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {wo.custom_id ? wo.custom_id : `#${wo.id.slice(0, 8)}`}
                  </div>
                  {wo.custom_id && (
                    <div className="text-[10px] text-neutral-400">
                      #{wo.id.slice(0, 8)}
                    </div>
                  )}
                  <div className="text-xs text-neutral-400">
                    {awaiting} awaiting · {inProg} in progress · {onHold} on hold
                    · {done} completed
                  </div>
                </div>
                <span className="rounded border border-neutral-700 px-2 py-1 text-xs capitalize">
                  {status.replace("_", " ")}
                </span>
              </div>
            </Link>
          );
        })}

        {filteredWos.length === 0 && (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
            No work orders in this bucket.
          </div>
        )}
      </div>
    </div>
  );
}