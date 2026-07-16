// /app/mobile/tech/queue/page.tsx (FULL FILE REPLACEMENT)
// Mobile Tech Queue — themed to match MobileTechHome
// - Hero uses metal-panel vibe
// - Filter cards styled like desktop TechQueue “vibes”
// - Job list shows: WO label + Line # + ACTUAL job title (description/complaint) + vehicle label
// - Uses UUID WO route: /mobile/work-orders/{workOrder.id}?mode=tech

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import {
  getOfflineMutationScope,
  getOfflineSyncSummary,
  setOfflineMutationScope,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import {
  downloadAssignedTechnicianWork,
  getCachedTechnicianWork,
} from "@/features/work-orders/mobile/technicianOfflineDownload";
import type { TechnicianOfflineBundle } from "@/features/work-orders/mobile/technicianOfflineTypes";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];

type WorkOrderPick = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  "id" | "custom_id" | "vehicle_id" | "type"
>;

type VehiclePick = Pick<
  DB["public"]["Tables"]["vehicles"]["Row"],
  "id" | "year" | "make" | "model" | "license_plate"
>;

type RollupStatus = "awaiting" | "in_progress" | "on_hold" | "completed";
type JobPriority = "low" | "normal" | "high" | "urgent";

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "Active Job",
  on_hold: "On hold",
  completed: "Completed",
};

const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] hover:border-[color:var(--theme-border-soft)]",
  in_progress:
    "border-[color:var(--accent-copper-soft,#fdba74)] bg-[var(--theme-gradient-panel)] hover:border-[color:var(--accent-copper-soft,#fdba74)]/90",
  on_hold:
    "border-amber-400/80 bg-[var(--theme-gradient-panel)] hover:border-amber-300/80",
  completed:
    "border-emerald-500/60 bg-[var(--theme-gradient-panel)] hover:border-emerald-400/70",
};

const PRIORITY_RANK: Record<JobPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const PRIORITY_LABELS: Record<JobPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

function toBucket(line: Line): RollupStatus {
  const punchedIn = !!line.punched_in_at && !line.punched_out_at;
  if (punchedIn) return "in_progress";

  const s = (line.status ?? "").toLowerCase().replaceAll(" ", "_");
  if (s === "in_progress" || s === "in-progress" || s === "active")
    return "in_progress";
  if (s === "on_hold") return "on_hold";
  if (s === "completed") return "completed";
  return "awaiting";
}

// queue sort priority: in-progress first, then on-hold, awaiting, completed
const STATUS_RANK: Record<RollupStatus, number> = {
  in_progress: 0,
  awaiting: 1,
  on_hold: 2,
  completed: 3,
};

function toPriority(line: Line): JobPriority {
  const raw = String(
    (line as Line & { job_priority?: string | null }).job_priority ?? "normal",
  )
    .toLowerCase()
    .trim();
  if (raw === "urgent" || raw === "high" || raw === "normal" || raw === "low")
    return raw;
  return "normal";
}

function cleanText(v: string | null | undefined): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function nextActionLabel(status: RollupStatus): string {
  if (status === "in_progress") return "Return to active job";
  if (status === "on_hold") return "Review hold reason + resume";
  if (status === "awaiting") return "Start line when bay is free";
  return "Review completion notes";
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

function queueViewFromBundle(bundle: TechnicianOfflineBundle): {
  lines: Line[];
  workOrderMap: Record<string, WorkOrderMapRow>;
  lineNumberMap: Record<string, number>;
} {
  const assignedIds = new Set(
    bundle.workOrders.flatMap((item) => item.assignedLineIds),
  );
  const lines = bundle.workOrders
    .flatMap((item) => item.lines)
    .filter((line) => assignedIds.has(line.id));
  const workOrderMap: Record<string, WorkOrderMapRow> = {};
  const lineNumberMap: Record<string, number> = {};
  const jobTypePriority: Record<string, number> = {
    diagnosis: 1,
    inspection: 2,
    maintenance: 3,
    repair: 4,
  };

  for (const item of bundle.workOrders) {
    workOrderMap[item.workOrder.id] = {
      id: item.workOrder.id,
      custom_id: item.workOrder.custom_id,
      vehicle_id: item.workOrder.vehicle_id,
      vehicleLabel: formatVehicle(item.vehicle),
    };
    item.lines
      .filter(
        (line) =>
          (line.line_type ?? "job") === "job" &&
          (line.approval_state ?? "").toLowerCase() !== "pending",
      )
      .sort((a, b) => {
        const priority =
          (jobTypePriority[String(a.job_type ?? "repair")] ?? 999) -
          (jobTypePriority[String(b.job_type ?? "repair")] ?? 999);
        if (priority) return priority;
        return (
          new Date(a.created_at ?? 0).getTime() -
          new Date(b.created_at ?? 0).getTime()
        );
      })
      .forEach((line, index) => {
        lineNumberMap[line.id] = index + 1;
      });
  }

  return { lines, workOrderMap, lineNumberMap };
}

export default function MobileTechQueuePage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const router = useRouter();

  const [lines, setLines] = useState<Line[]>([]);

  const [workOrderMap, setWorkOrderMap] = useState<
    Record<string, WorkOrderMapRow>
  >({});

  // line.id -> 1-based “client view” line number
  const [lineNumberMap, setLineNumberMap] = useState<Record<string, number>>(
    {},
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<RollupStatus | null>(null);
  const [syncSummary, setSyncSummary] = useState(() => getOfflineSyncSummary());
  const [scope, setScope] = useState<{ userId: string; shopId: string } | null>(
    null,
  );
  const [downloading, setDownloading] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [offlineUpdatedAt, setOfflineUpdatedAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const applyOfflineBundle = useCallback((bundle: TechnicianOfflineBundle) => {
    const view = queueViewFromBundle(bundle);
    setLines(view.lines);
    setWorkOrderMap(view.workOrderMap);
    setLineNumberMap(view.lineNumberMap);
  }, []);

  useEffect(() => {
    const refresh = () => setSyncSummary(getOfflineSyncSummary());
    refresh();
    return subscribeOfflineMutations(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);

      if (!navigator.onLine) {
        const cachedScope = getOfflineMutationScope();
        if (!cachedScope) {
          setErr("No offline user and shop scope is available on this device.");
          setLoading(false);
          return;
        }
        setScope(cachedScope);
        const cached = await getCachedTechnicianWork({ scope: cachedScope });
        if (!cached) {
          setErr("No assigned work has been downloaded to this device yet.");
          setLoading(false);
          return;
        }
        applyOfflineBundle(cached.data);
        setOfflineUpdatedAt(cached.updatedAt);
        setOfflineMessage("Showing the assigned work saved on this device.");
        setLoading(false);
        return;
      }

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
      const activeScope = { userId: user.id, shopId: prof.shop_id };
      setScope(activeScope);
      setOfflineMutationScope(activeScope);
      const cached = await getCachedTechnicianWork({ scope: activeScope });
      setOfflineUpdatedAt(cached?.updatedAt ?? null);

      // 3) lines assigned to this tech
      const { data: techLines, error: linesErr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("assigned_tech_id", user.id)
        .eq("line_type", "job");

      if (linesErr) {
        setErr(linesErr.message);
        setLoading(false);
        return;
      }

      const assignedLines = (techLines ?? []) as Line[];

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
            .select("id, custom_id, vehicle_id, type")
            .in("id", woIds)
            .neq("type", "historical_import"),
          supabase
            .from("work_order_lines")
            .select(
              "id, work_order_id, created_at, job_type, approval_state, line_type",
            )
            .eq("line_type", "job")
            .in("work_order_id", woIds),
        ]);

        const wos = (wosRes.data ?? []) as WorkOrderPick[];
        const allowedWorkOrderIds = new Set(wos.map((wo) => wo.id));
        setLines(
          assignedLines.filter(
            (line) =>
              line.work_order_id && allowedWorkOrderIds.has(line.work_order_id),
          ),
        );

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
        setLines([]);
        setWorkOrderMap({});
        setLineNumberMap({});
      }

      setLoading(false);
    })();
  }, [supabase, applyOfflineBundle]);

  const downloadForOffline = useCallback(async () => {
    if (!scope || !navigator.onLine) return;
    setDownloading(true);
    setOfflineMessage(null);
    try {
      const bundle = await downloadAssignedTechnicianWork({ scope });
      applyOfflineBundle(bundle);
      setOfflineUpdatedAt(bundle.downloadedAt);
      await navigator.storage?.persist?.();
      setOfflineMessage(
        `${bundle.workOrders.length} assigned work order${bundle.workOrders.length === 1 ? " is" : "s are"} available offline.`,
      );
    } catch (error) {
      setOfflineMessage(
        error instanceof Error
          ? error.message
          : "Assigned work could not be downloaded.",
      );
    } finally {
      setDownloading(false);
    }
  }, [scope, applyOfflineBundle]);

  // counts per bucket
  const counts = useMemo(() => {
    const base: Record<RollupStatus, number> = {
      awaiting: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
    };
    for (const line of lines) base[toBucket(line)] += 1;
    return base;
  }, [lines]);

  // sort queue: active first, then priority, then readiness bucket + line number + newest
  const sortedLines = useMemo(() => {
    const copy = [...lines];
    copy.sort((a, b) => {
      const aActive = !!a.punched_in_at && !a.punched_out_at;
      const bActive = !!b.punched_in_at && !b.punched_out_at;
      if (aActive !== bActive) return aActive ? -1 : 1;

      const pa = PRIORITY_RANK[toPriority(a)];
      const pb = PRIORITY_RANK[toPriority(b)];
      if (pa !== pb) return pa - pb;

      const ba = toBucket(a);
      const bb = toBucket(b);

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
    return sortedLines.filter((l) => toBucket(l) === activeFilter);
  }, [sortedLines, activeFilter]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-[color:var(--theme-text-secondary)]">
          Loading assigned jobs…
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
        <div className="mx-auto max-w-5xl px-4 py-8 text-sm text-red-200">
          {err}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pb-8 pt-4">
        {(syncSummary.queued > 0 ||
          syncSummary.syncing > 0 ||
          syncSummary.failed > 0 ||
          syncSummary.conflicted > 0) && (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            Sync status: pending {syncSummary.queued + syncSummary.syncing} •
            failed {syncSummary.failed} • conflicted {syncSummary.conflicted}
          </div>
        )}
        <section className="metal-card rounded-2xl border border-[var(--metal-border-soft)] p-4 shadow-[var(--theme-shadow-medium)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                Offline availability
              </h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                {offlineUpdatedAt
                  ? `Saved ${new Date(offlineUpdatedAt).toLocaleString()}`
                  : "Assigned work has not been downloaded on this device."}
              </p>
            </div>
            <button
              type="button"
              disabled={downloading || !scope || !online}
              onClick={() => void downloadForOffline()}
              className="rounded-xl border border-[var(--accent-copper-soft)]/70 bg-[rgba(212,118,49,0.18)] px-4 py-2 text-xs font-semibold text-[var(--accent-copper-soft)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {downloading ? "Downloading…" : "Download assigned work"}
            </button>
          </div>
          {offlineMessage ? (
            <p className="mt-3 text-xs text-[color:var(--theme-text-secondary)]">
              {offlineMessage}
            </p>
          ) : null}
        </section>
        {/* HERO (match MobileTechHome vibe) */}
        <section className="metal-panel metal-panel--hero rounded-2xl border border-[var(--metal-border-soft)] px-4 py-4 shadow-[var(--theme-shadow-medium)]">
          <div className="space-y-1">
            <div className="text-[0.7rem] uppercase tracking-[0.25em] text-[color:var(--theme-text-muted)]">
              ProFixIQ • Tech
            </div>
            <h1 className="font-blackops text-xl uppercase tracking-[0.18em] text-[var(--accent-copper)]">
              My jobs
            </h1>
            <p className="text-[0.75rem] text-[color:var(--theme-text-secondary)]">
              Tap a line to open the work order in tech mode.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <MiniStat label="Total lines" value={lines.length} />
            <MiniStat label="Active job" value={counts.in_progress} accent />
            <MiniStat label="On hold" value={counts.on_hold} />
          </div>
        </section>

        {/* FILTER CARDS (desktop-style vibes) */}
        <section className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          {(
            [
              "awaiting",
              "in_progress",
              "on_hold",
              "completed",
            ] as RollupStatus[]
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
                    : "shadow-[var(--theme-shadow-medium)]",
                ].join(" ")}
              >
                <div className="text-[0.6rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                  {STATUS_LABELS[s]}
                </div>
                <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
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
        <section className="grid gap-2 md:grid-cols-2">
          {filteredLines.map((line) => {
            const bucket = toBucket(line);

            const wo = line.work_order_id
              ? workOrderMap[line.work_order_id]
              : null;

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
            const approvalState = (
              line.approval_state ?? "approved"
            ).replaceAll("_", " ");
            const isAwaitingApproval =
              (line.approval_state ?? "").toLowerCase() === "pending";
            const isPunchedIn = !!line.punched_in_at && !line.punched_out_at;
            const priority = toPriority(line);

            // ✅ always use UUID route (mobile expects UUID)
            const woId = wo?.id ?? line.work_order_id ?? "";
            const href = woId
              ? `/mobile/work-orders/${woId}?mode=tech&focus=${line.id}`
              : "";

            return (
              <button
                key={line.id}
                type="button"
                onClick={() => {
                  if (!href) return;
                  router.push(href);
                }}
                className={[
                  "metal-card w-full rounded-2xl border px-3 py-3 text-left shadow-[var(--theme-shadow-medium)] active:scale-[0.99]",
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
                    <div className="text-[0.65rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                      {woLabel}
                      {lineNumber ? (
                        <span className="ml-2 text-[color:var(--theme-text-muted)]">
                          • Line #{lineNumber}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 truncate text-[0.95rem] font-semibold text-[color:var(--theme-text-primary)]">
                      {jobLabel}
                    </div>

                    <div className="mt-1 truncate text-[0.75rem] text-[color:var(--theme-text-secondary)]">
                      {vehicleLabel ? vehicleLabel : "—"}
                    </div>

                    <div className="mt-2 text-[0.65rem] uppercase tracking-[0.12em] text-amber-200/90">
                      Next action: {nextActionLabel(bucket)}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                        Priority: {PRIORITY_LABELS[priority]}
                      </span>
                      <span className="rounded-full border border-[color:var(--theme-border-soft)] px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                        Approval: {approvalState}
                      </span>
                      {isAwaitingApproval && (
                        <span className="rounded-full border border-sky-400/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-sky-200">
                          Waiting decision
                        </span>
                      )}
                      {isPunchedIn && (
                        <span className="rounded-full border border-emerald-400/60 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-emerald-200">
                          Active timer
                        </span>
                      )}
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
            <div className="metal-card rounded-2xl border border-[var(--metal-border-soft)] px-3 py-4 text-sm text-[color:var(--theme-text-secondary)]">
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
        "metal-card rounded-2xl border px-3 py-3 text-center shadow-[var(--theme-shadow-medium)]",
        accent
          ? "border border-[var(--accent-copper-soft)]/75 shadow-[var(--theme-shadow-medium)]"
          : "border border-[var(--metal-border-soft)]",
      ].join(" ")}
    >
      <div className="text-[0.6rem] uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}
