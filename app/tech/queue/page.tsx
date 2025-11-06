// app/tech/queue/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type RollupStatus = "awaiting" | "in_progress" | "on_hold" | "completed";

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
};

// match the styling from your working queue page
const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-slate-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-green-500 data-[active=true]:bg-green-500/10",
  in_progress:
    "border-amber-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-green-500 data-[active=true]:bg-green-500/10",
  on_hold:
    "border-purple-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-green-500 data-[active=true]:bg-green-500/10",
  completed:
    "border-emerald-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-green-500 data-[active=true]:bg-green-500/10",
};

function toBucket(status: string | null | undefined): RollupStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "in_progress") return "in_progress";
  if (s === "on_hold") return "on_hold";
  if (s === "completed") return "completed";
  return "awaiting";
}

export default function TechQueuePage() {
  const supabase = createClientComponentClient<DB>();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // just the lines assigned to this tech
  const [lines, setLines] = useState<Line[]>([]);
  // we also want the WOs so we can link to them nicely
  const [workOrderMap, setWorkOrderMap] = useState<Record<string, { id: string; custom_id: string | null }>>(
    {},
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RollupStatus | null>(null);

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
      setProfile(prof);

      // 3) fetch work-order lines for this shop AND assigned to me
      //    (we could also filter by last 30 days, but for tech lines this is probably ok)
      const { data: techLines, error: linesErr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("assigned_to", user.id)
        .order("created_at", { ascending: false });

      if (linesErr) {
        setErr(linesErr.message);
        setLoading(false);
        return;
      }

      const assignedLines = techLines ?? [];
      setLines(assignedLines);

      // 4) fetch the work_order rows for those line IDs (to show custom_id)
      const woIds = Array.from(
        new Set(
          assignedLines
            .map((l) => l.work_order_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (woIds.length > 0) {
        const { data: wos } = await supabase
          .from("work_orders")
          .select("id, custom_id")
          .in("id", woIds);

        const map: Record<string, { id: string; custom_id: string | null }> = {};
        (wos ?? []).forEach((wo) => {
          map[wo.id] = { id: wo.id, custom_id: wo.custom_id };
        });
        setWorkOrderMap(map);
      } else {
        setWorkOrderMap({});
      }

      setLoading(false);
    })();
  }, [supabase]);

  // counts per bucket
  const counts = useMemo(() => {
    const base: Record<RollupStatus, number> = {
      awaiting: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
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

  if (loading) {
    return <div className="p-6 text-white">Loading assigned jobs…</div>;
  }

  if (err) {
    return <div className="p-6 text-red-200">{err}</div>;
  }

  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-blackops text-orange-400">
        Your Assigned Jobs
      </h1>

      {/* DEBUG header like other page */}
      <div className="mb-4 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
        <div className="mb-1 font-semibold text-orange-400">Debug</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <div>
              <span className="text-neutral-400">User:</span> {userId}
            </div>
            <div>
              <span className="text-neutral-400">Role:</span>{" "}
              {profile?.role ?? "—"}
            </div>
            <div>
              <span className="text-neutral-400">Shop:</span>{" "}
              {profile?.shop_id ?? "—"}
            </div>
          </div>
          <div className="space-y-1">
            <div>
              <span className="text-neutral-400">Assigned lines:</span>{" "}
              {lines.length}
            </div>
          </div>
        </div>
      </div>

      {/* FILTER BUTTONS (no routing) */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        {(["awaiting", "in_progress", "on_hold", "completed"] as RollupStatus[]).map(
          (s) => {
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
          },
        )}
      </div>

      {/* LIST OF LINES */}
      <div className="space-y-2">
        {filteredLines.map((line) => {
          const bucket = toBucket(line.status);
          const wo = line.work_order_id
            ? workOrderMap[line.work_order_id]
            : null;
          const slug = wo?.custom_id ?? wo?.id ?? line.work_order_id ?? "";

          return (
            <div
              key={line.id}
              className="rounded border border-neutral-800 bg-neutral-900 p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {wo?.custom_id
                    ? wo.custom_id
                    : line.work_order_id
                    ? `WO #${line.work_order_id.slice(0, 8)}`
                    : "Work order line"}
                </div>
                <div className="text-[10px] text-neutral-400">
                  Line #{line.id.slice(0, 8)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {slug && (
                  <button
                    onClick={() =>
                      router.push(`/work-orders/${slug}?mode=tech`)
                    }
                    className="rounded bg-neutral-800 px-3 py-1 text-xs hover:border-orange-500 border border-transparent"
                  >
                    View
                  </button>
                )}
                <span className="rounded border border-neutral-700 px-2 py-1 text-xs capitalize">
                  {STATUS_LABELS[bucket]}
                </span>
              </div>
            </div>
          );
        })}

        {filteredLines.length === 0 && (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
            No jobs in this bucket.
          </div>
        )}
      </div>

      {/* optional: show one line so we can see missing fields */}
      {lines.length > 0 && (
        <div className="mt-6 rounded border border-neutral-900 bg-neutral-950 p-3 text-xs text-neutral-400 overflow-auto">
          <div className="mb-1 text-neutral-200 font-semibold">
            Debug: first line object
          </div>
          <pre className="whitespace-pre-wrap break-all">
            {JSON.stringify(lines[0], null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}