"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

type RollupStatus = "awaiting" | "in_progress" | "on_hold" | "completed";

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
};

// summary chip styles (unchanged)
const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-slate-700 bg-neutral-950/90 hover:border-orange-400 data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-500/15",
  in_progress:
    "border-amber-700 bg-neutral-950/90 hover:border-orange-400 data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-500/15",
  on_hold:
    "border-purple-700 bg-neutral-950/90 hover:border-orange-400 data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-500/15",
  completed:
    "border-emerald-700 bg-neutral-950/90 hover:border-orange-400 data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-500/15",
};

function toBucket(status: string | null | undefined): RollupStatus {
  const s = (status ?? "").toLowerCase();
  if (s === "in_progress") return "in_progress";
  if (s === "on_hold") return "on_hold";
  if (s === "completed") return "completed";
  return "awaiting";
}

// queue sort priority: in-progress first, then on-hold, awaiting, completed
const STATUS_RANK: Record<RollupStatus, number> = {
  in_progress: 0,
  on_hold: 1,
  awaiting: 2,
  completed: 3,
};

export default function MobileTechQueuePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [lines, setLines] = useState<Line[]>([]);
  const [workOrderMap, setWorkOrderMap] = useState<
    Record<string, { id: string; custom_id: string | null }>
  >({});

  // line.id -> 1-based “client view” line number
  const [lineNumberMap, setLineNumberMap] = useState<Record<string, number>>(
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

      // 2) profile (shop linkage)
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

      // 3) lines assigned to this tech
      const { data: techLines, error: linesErr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("assigned_to", user.id);

      if (linesErr) {
        setErr(linesErr.message);
        setLoading(false);
        return;
      }

      const assignedLines = techLines ?? [];
      setLines(assignedLines);

      // 4) fetch WOs + all lines for those WOs, to compute “client” line numbers
      const woIds = Array.from(
        new Set(
          assignedLines
            .map((l) => l.work_order_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (woIds.length > 0) {
        const [wosRes, allLinesRes] = await Promise.all([
          supabase
            .from("work_orders")
            .select("id, custom_id")
            .in("id", woIds),
          supabase
            .from("work_order_lines")
            .select(
              "id, work_order_id, created_at, job_type, approval_state",
            )
            .in("work_order_id", woIds),
        ]);

        const mapWO: Record<string, { id: string; custom_id: string | null }> =
          {};
        (wosRes.data ?? []).forEach((wo) => {
          mapWO[wo.id] = { id: wo.id, custom_id: wo.custom_id };
        });
        setWorkOrderMap(mapWO);

        // Build lineNumberMap using the SAME sort as MobileWorkOrderClient
        const lnMap: Record<string, number> = {};
        const allLines = allLinesRes.data ?? [];

        const grouped: Record<
          string,
          {
            id: string;
            work_order_id: string | null;
            created_at: string | null;
            job_type: string | null;
            approval_state: string | null;
          }[]
        > = {};

        allLines.forEach((ln) => {
          if (!ln.work_order_id) return;
          if ((ln.approval_state ?? "").toLowerCase() === "pending") return;
          if (!grouped[ln.work_order_id]) grouped[ln.work_order_id] = [];
          grouped[ln.work_order_id].push(ln);
        });

        const jobTypePriority: Record<string, number> = {
          diagnosis: 1,
          inspection: 2,
          maintenance: 3,
          repair: 4,
        };

        Object.values(grouped).forEach((arr) => {
          arr.sort((a, b) => {
            const pa =
              jobTypePriority[String(a.job_type ?? "repair")] ?? 999;
            const pb =
              jobTypePriority[String(b.job_type ?? "repair")] ?? 999;
            if (pa !== pb) return pa - pb;

            const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
            const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
            return ta - tb;
          });

          arr.forEach((ln, idx) => {
            lnMap[ln.id] = idx + 1; // 1-based line numbers
          });
        });

        setLineNumberMap(lnMap);
      } else {
        setWorkOrderMap({});
        setLineNumberMap({});
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

  // sort queue: in-progress first, then by line number, then newest
  const sortedLines = useMemo(() => {
    const copy = [...lines];
    copy.sort((a, b) => {
      const ba = toBucket(a.status);
      const bb = toBucket(b.status);

      const ra = STATUS_RANK[ba];
      const rb = STATUS_RANK[bb];
      if (ra !== rb) return ra - rb;

      const na = lineNumberMap[a.id] ?? 9999;
      const nb = lineNumberMap[b.id] ?? 9999;
      if (na !== nb) return na - nb;

      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });
    return copy;
  }, [lines, lineNumberMap]);

  // apply filter on top of that sort
  const filteredLines = useMemo(() => {
    if (activeFilter == null) return sortedLines;
    return sortedLines.filter((l) => toBucket(l.status) === activeFilter);
  }, [sortedLines, activeFilter]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-md px-4 py-8 text-sm text-neutral-300">
          Loading assigned jobs…
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-md px-4 py-8 text-sm text-red-200">
          {err}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-4">
        {/* Header / summary */}
        <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-black via-neutral-950 to-black px-4 py-4 shadow-card">
          <div className="space-y-1">
            <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
              ProFixIQ • Tech
            </div>
            <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-orange-400">
              My jobs
            </h1>
            <p className="text-[0.75rem] text-neutral-300">
              Jobs currently assigned to you. Tap a job to open the work order
              in tech mode.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3 text-[0.7rem] text-neutral-300">
            <div>
              <div className="uppercase tracking-[0.13em] text-neutral-500">
                Total lines
              </div>
              <div className="text-base font-semibold text-white">
                {lines.length}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.13em] text-neutral-500">
                In progress
              </div>
              <div className="text-base font-semibold text-emerald-200">
                {counts.in_progress}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-[0.13em] text-neutral-500">
                On hold
              </div>
              <div className="text-base font-semibold text-amber-200">
                {counts.on_hold}
              </div>
            </div>
          </div>
        </section>

        {/* Filter chips */}
        <section className="grid grid-cols-2 gap-3 text-xs">
          {(
            ["awaiting", "in_progress", "on_hold", "completed"] as RollupStatus[]
          ).map((s) => {
            const isActive = activeFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActiveFilter(isActive ? null : s)}
                className={`rounded-2xl border px-3 py-2 text-left transition ${STATUS_STYLES[s]}`}
                data-active={isActive ? "true" : "false"}
              >
                <div className="text-[0.6rem] uppercase tracking-[0.16em] text-neutral-400">
                  {STATUS_LABELS[s]}
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {counts[s]}
                </div>
                {isActive && (
                  <div className="mt-1 text-[0.6rem] text-orange-200">
                    Showing only {STATUS_LABELS[s].toLowerCase()}
                  </div>
                )}
              </button>
            );
          })}
        </section>

        {/* Jobs list */}
        <section className="space-y-2">
          {filteredLines.map((line) => {
            const bucket = toBucket(line.status);
            const wo = line.work_order_id
              ? workOrderMap[line.work_order_id]
              : null;
            const slug = wo?.custom_id ?? wo?.id ?? line.work_order_id ?? "";

            const lineNumber = lineNumberMap[line.id];

            return (
              <button
                key={line.id}
                type="button"
                onClick={() => {
                  if (!slug) return;
                  router.push(`/mobile/work-orders/${slug}?mode=tech`);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/90 px-3 py-3 text-left shadow-[0_0_0_1px_rgba(15,23,42,0.9)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[0.85rem] font-medium text-neutral-50">
                    {wo?.custom_id
                      ? wo.custom_id
                      : line.work_order_id
                      ? `WO #${line.work_order_id.slice(0, 8)}`
                      : "Work order line"}
                  </div>
                  <div className="mt-0.5 text-[0.7rem] text-neutral-400">
                    {lineNumber
                      ? `Line #${lineNumber}`
                      : `Line id ${line.id.slice(0, 8)}`}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-[0.7rem] text-neutral-200">
                  {STATUS_LABELS[bucket]}
                </span>
              </button>
            );
          })}

          {filteredLines.length === 0 && (
            <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950/80 px-3 py-4 text-sm text-neutral-400">
              No jobs in this bucket.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}