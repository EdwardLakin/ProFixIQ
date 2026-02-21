// /app/mobile/tech/queue/page.tsx (FULL FILE REPLACEMENT)
// Mobile Tech Queue — themed to match MobileTechHome
// - Hero uses metal-panel vibe
// - Filter cards styled like desktop TechQueue “vibes”
// - Job list shows: WO label + Line # + ACTUAL job title (description/complaint) + vehicle label
// - Uses UUID WO route: /mobile/work-orders/{workOrder.id}?mode=tech

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

type WorkOrderPick = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  "id" | "custom_id" | "vehicle_id"
>;

type VehiclePick = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "license_plate"
>;

type RollupStatus = "awaiting" | "in_progress" | "on_hold" | "completed";

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
};

const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-slate-600/70 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),rgba(15,23,42,0.98))] hover:border-slate-300/70",
  in_progress:
    "border-[color:var(--accent-copper-soft,#fdba74)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.28),rgba(15,23,42,0.98))] hover:border-[color:var(--accent-copper-soft,#fdba74)]/90",
  on_hold:
    "border-amber-400/80 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.24),rgba(15,23,42,0.97))] hover:border-amber-300/80",
  completed:
    "border-emerald-500/60 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.20),rgba(15,23,42,0.98))] hover:border-emerald-400/70",
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

function cleanText(v: string | null | undefined): string {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function formatVehicle(v: VehiclePick | null | undefined): string | null {
  if (!v) return null;

  const y = v.year ? String(v.year) : "";
  const make = cleanText(v.make);
  const model = cleanText(v.model);
  const base = [y, make, model].filter(Boolean).join(" ").trim();

  const plate = cleanText(v.license_plate);
  if (base && plate) return `${base} • ${plate}`;
  if (base) return base;
  if (plate) return plate;

  return null;
}

type WorkOrderMapRow = {
  id: string;
  custom_id: string | null;
  vehicle_id: string | null;
  vehicleLabel: string | null;
};

export default function MobileTechQueuePage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [lines, setLines] = useState<Line[]>([]);

  const [workOrderMap, setWorkOrderMap] = useState<Record<string, WorkOrderMapRow>>(
    {},
  );

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

      const assignedLines = (techLines ?? []) as Line[];
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
            .select("id, custom_id, vehicle_id")
            .in("id", woIds),
          supabase
            .from("work_order_lines")
            .select("id, work_order_id, created_at, job_type, approval_state")
            .in("work_order_id", woIds),
        ]);

        const wos = (wosRes.data ?? []) as WorkOrderPick[];

        // vehicles lookup (batch)
        const vehicleIds = Array.from(
          new Set(
            wos
              .map((w) => w.vehicle_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        let vehicleMap: Record<string, VehiclePick> = {};
        if (vehicleIds.length > 0) {
          const { data: vehs } = await supabase
            .from("vehicles")
            .select("id, year, make, model, license_plate")
            .in("id", vehicleIds);

          vehicleMap = {};
          (vehs ?? []).forEach((v) => {
            const row = v as VehiclePick;
            vehicleMap[row.id] = row;
          });
        }

        // workOrderMap with vehicleLabel baked in
        const mapWO: Record<string, WorkOrderMapRow> = {};
        wos.forEach((wo) => {
          const veh = wo.vehicle_id ? vehicleMap[wo.vehicle_id] : undefined;
          mapWO[wo.id] = {
            id: wo.id,
            custom_id: wo.custom_id ?? null,
            vehicle_id: wo.vehicle_id ?? null,
            vehicleLabel: formatVehicle(veh),
          };
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
            const pa = jobTypePriority[String(a.job_type ?? "repair")] ?? 999;
            const pb = jobTypePriority[String(b.job_type ?? "repair")] ?? 999;
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
    for (const line of lines) base[toBucket(line.status)] += 1;
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
        {/* HERO (match MobileTechHome vibe) */}
        <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          <div className="space-y-1">
            <div className="text-[0.7rem] uppercase tracking-[0.25em] text-neutral-500">
              ProFixIQ • Tech
            </div>
            <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-[var(--accent-copper)]">
              My jobs
            </h1>
            <p className="text-[0.75rem] text-neutral-300">
              Tap a line to open the work order in tech mode.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <MiniStat label="Total lines" value={lines.length} />
            <MiniStat label="In progress" value={counts.in_progress} accent />
            <MiniStat label="On hold" value={counts.on_hold} />
          </div>
        </section>

        {/* FILTER CARDS (desktop-style vibes) */}
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
                className={[
                  "rounded-2xl border p-3 text-left transition",
                  STATUS_STYLES[s],
                  isActive
                    ? "ring-2 ring-[color:var(--accent-copper-soft,#fdba74)]/80 shadow-[0_0_28px_rgba(249,115,22,0.45)]"
                    : "shadow-[0_16px_32px_rgba(0,0,0,0.65)]",
                ].join(" ")}
              >
                <div className="text-[0.6rem] uppercase tracking-[0.16em] text-neutral-300">
                  {STATUS_LABELS[s]}
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {counts[s]}
                </div>
                {isActive ? (
                  <div className="mt-1 text-[0.6rem] text-[var(--accent-copper-soft)]">
                    Showing only {STATUS_LABELS[s].toLowerCase()}
                  </div>
                ) : null}
              </button>
            );
          })}
        </section>

        {/* JOB LIST (WO + line# + real title + vehicle) */}
        <section className="space-y-2">
          {filteredLines.map((line) => {
            const bucket = toBucket(line.status);

            const wo = line.work_order_id ? workOrderMap[line.work_order_id] : null;

            const woLabel = wo?.custom_id
              ? wo.custom_id
              : wo?.id
                ? `WO ${wo.id.slice(0, 8)}`
                : line.work_order_id
                  ? `WO ${line.work_order_id.slice(0, 8)}`
                  : "Work order";

            const lineNumber = lineNumberMap[line.id];

            // ✅ app-like title logic
            const jobLabel = cleanText(
              line.description || line.complaint || "Untitled job",
            );

            const vehicleLabel = wo?.vehicleLabel ?? null;

            // ✅ always use UUID route (mobile expects UUID)
            const woId = wo?.id ?? line.work_order_id ?? "";
            const href = woId ? `/mobile/work-orders/${woId}?mode=tech` : "";

            return (
              <button
                key={line.id}
                type="button"
                onClick={() => {
                  if (!href) return;
                  router.push(href);
                }}
                className={[
                  "metal-card w-full rounded-2xl border px-3 py-3 text-left shadow-[0_18px_40px_rgba(0,0,0,0.75)] active:scale-[0.99]",
                  bucket === "in_progress"
                    ? "border-[var(--accent-copper-soft)]/80"
                    : bucket === "on_hold"
                      ? "border-amber-400/50"
                      : bucket === "completed"
                        ? "border-emerald-500/35"
                        : "border-[var(--metal-border-soft)]",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-400">
                      {woLabel}
                      {lineNumber ? (
                        <span className="ml-2 text-neutral-500">
                          • Line #{lineNumber}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 truncate text-[0.95rem] font-semibold text-white">
                      {jobLabel}
                    </div>

                    <div className="mt-1 truncate text-[0.75rem] text-neutral-400">
                      {vehicleLabel ? vehicleLabel : "—"}
                    </div>
                  </div>

                  <span className="accent-chip shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-[var(--accent-copper-soft)]">
                    {STATUS_LABELS[bucket]}
                  </span>
                </div>
              </button>
            );
          })}

          {filteredLines.length === 0 && (
            <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-3 py-4 text-sm text-neutral-400">
              No jobs in this bucket.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "metal-card rounded-2xl border px-3 py-3 text-center shadow-[0_16px_32px_rgba(0,0,0,0.65)]",
        accent
          ? "border border-[var(--accent-copper-soft)]/75 shadow-[0_16px_32px_rgba(0,0,0,0.65),0_0_20px_rgba(212,118,49,0.45)]"
          : "border border-[var(--metal-border-soft)]",
      ].join(" ")}
    >
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}