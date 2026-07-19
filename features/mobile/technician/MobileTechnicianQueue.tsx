"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getOfflineMutationScope,
  getOfflineSyncSummary,
  setOfflineMutationScope,
  subscribeOfflineMutations,
} from "@/features/shared/lib/offline/mutations";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  downloadAssignedTechnicianWork,
  getCachedTechnicianWork,
} from "@/features/work-orders/mobile/technicianOfflineDownload";
import type { TechnicianOfflineBundle } from "@/features/work-orders/mobile/technicianOfflineTypes";
import type { Database } from "@shared/types/types/supabase";

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
type QueueFilter = "all" | RollupStatus;
type JobPriority = "low" | "normal" | "high" | "urgent";

type WorkOrderMapRow = {
  id: string;
  customId: string | null;
  vehicleLabel: string | null;
};

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

const FILTERS: Array<{ value: QueueFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "in_progress", label: "Active" },
  { value: "awaiting", label: "Awaiting" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
];

const STATUS_RANK: Record<RollupStatus, number> = {
  in_progress: 0,
  awaiting: 1,
  on_hold: 2,
  completed: 3,
};

const PRIORITY_RANK: Record<JobPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function cleanText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function toBucket(line: Line): RollupStatus {
  if (line.punched_in_at && !line.punched_out_at) return "in_progress";
  const status = cleanText(line.status).toLowerCase().replaceAll(" ", "_");
  if (status === "active" || status === "in_progress" || status === "in-progress") {
    return "in_progress";
  }
  if (status === "on_hold") return "on_hold";
  if (
    status === "completed" ||
    status === "ready_to_invoice" ||
    status === "invoiced"
  ) {
    return "completed";
  }
  return "awaiting";
}

function toPriority(line: Line): JobPriority {
  const raw = cleanText(
    (line as Line & { job_priority?: string | null }).job_priority,
  ).toLowerCase();
  if (raw === "urgent" || raw === "high" || raw === "normal" || raw === "low") {
    return raw;
  }
  return "normal";
}

function formatVehicle(vehicle: VehiclePick | null | undefined): string | null {
  if (!vehicle) return null;
  const base = [vehicle.year, vehicle.make, vehicle.model]
    .map(cleanText)
    .filter(Boolean)
    .join(" ")
    .trim();
  const plate = cleanText(vehicle.license_plate);
  if (base && plate) return `${base} • ${plate}`;
  return base || plate || null;
}

function buildLineNumbers(
  lines: Array<
    Pick<
      Line,
      "id" | "work_order_id" | "created_at" | "job_type" | "approval_state"
    >
  >,
): Record<string, number> {
  const grouped = new Map<string, typeof lines>();
  const jobTypeRank: Record<string, number> = {
    diagnosis: 1,
    inspection: 2,
    maintenance: 3,
    repair: 4,
  };

  for (const line of lines) {
    if (!line.work_order_id) continue;
    if (cleanText(line.approval_state).toLowerCase() === "pending") continue;
    const current = grouped.get(line.work_order_id) ?? [];
    current.push(line);
    grouped.set(line.work_order_id, current);
  }

  const result: Record<string, number> = {};
  for (const workOrderLines of grouped.values()) {
    workOrderLines
      .sort((left, right) => {
        const typeDifference =
          (jobTypeRank[cleanText(left.job_type).toLowerCase()] ?? 999) -
          (jobTypeRank[cleanText(right.job_type).toLowerCase()] ?? 999);
        if (typeDifference !== 0) return typeDifference;
        return (
          new Date(left.created_at ?? 0).getTime() -
          new Date(right.created_at ?? 0).getTime()
        );
      })
      .forEach((line, index) => {
        result[line.id] = index + 1;
      });
  }
  return result;
}

function queueViewFromBundle(bundle: TechnicianOfflineBundle): {
  lines: Line[];
  workOrderMap: Record<string, WorkOrderMapRow>;
  lineNumberMap: Record<string, number>;
} {
  const assignedIds = new Set(
    bundle.workOrders.flatMap((workOrder) => workOrder.assignedLineIds),
  );
  const lines = bundle.workOrders
    .flatMap((workOrder) => workOrder.lines)
    .filter(
      (line) =>
        assignedIds.has(line.id) && (line.line_type ?? "job") === "job",
    );
  const workOrderMap: Record<string, WorkOrderMapRow> = {};
  const allLines: Array<
    Pick<
      Line,
      "id" | "work_order_id" | "created_at" | "job_type" | "approval_state"
    >
  > = [];

  for (const entry of bundle.workOrders) {
    workOrderMap[entry.workOrder.id] = {
      id: entry.workOrder.id,
      customId: entry.workOrder.custom_id,
      vehicleLabel: formatVehicle(entry.vehicle),
    };
    allLines.push(...entry.lines);
  }

  return {
    lines,
    workOrderMap,
    lineNumberMap: buildLineNumbers(allLines),
  };
}

function statusTone(status: RollupStatus): string {
  if (status === "in_progress") {
    return "border-emerald-400/45 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "on_hold") {
    return "border-amber-400/45 bg-amber-500/10 text-amber-100";
  }
  if (status === "completed") {
    return "border-sky-400/35 bg-sky-500/10 text-sky-100";
  }
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]";
}

export default function MobileTechnicianQueue() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [lines, setLines] = useState<Line[]>([]);
  const [workOrderMap, setWorkOrderMap] = useState<
    Record<string, WorkOrderMapRow>
  >({});
  const [lineNumberMap, setLineNumberMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [syncSummary, setSyncSummary] = useState(() => getOfflineSyncSummary());
  const [scope, setScope] = useState<{ userId: string; shopId: string } | null>(
    null,
  );
  const [online, setOnline] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [offlineUpdatedAt, setOfflineUpdatedAt] = useState<string | null>(null);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);

  const applyOfflineBundle = useCallback((bundle: TechnicianOfflineBundle) => {
    const view = queueViewFromBundle(bundle);
    setLines(view.lines);
    setWorkOrderMap(view.workOrderMap);
    setLineNumberMap(view.lineNumberMap);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!navigator.onLine) {
        const cachedScope = getOfflineMutationScope();
        if (!cachedScope) {
          throw new Error(
            "No assigned work has been saved for offline use on this device.",
          );
        }
        setScope(cachedScope);
        const cached = await getCachedTechnicianWork({ scope: cachedScope });
        if (!cached) {
          throw new Error(
            "No assigned work has been downloaded to this device yet.",
          );
        }
        applyOfflineBundle(cached.data);
        setOfflineUpdatedAt(cached.updatedAt);
        setOfflineMessage("Showing the assigned work saved on this device.");
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("You must be signed in.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<{ shop_id: string | null }>();
      if (profileError) throw profileError;
      if (!profile?.shop_id) throw new Error("No shop is linked to your profile.");

      const activeScope = { userId: user.id, shopId: profile.shop_id };
      setScope(activeScope);
      setOfflineMutationScope(activeScope);
      const cached = await getCachedTechnicianWork({ scope: activeScope });
      setOfflineUpdatedAt(cached?.updatedAt ?? null);

      const { data: assignedData, error: assignedError } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("assigned_tech_id", user.id)
        .eq("line_type", "job");
      if (assignedError) throw assignedError;

      const assignedLines = (assignedData ?? []) as Line[];
      const workOrderIds = Array.from(
        new Set(
          assignedLines
            .map((line) => line.work_order_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      if (workOrderIds.length === 0) {
        setLines([]);
        setWorkOrderMap({});
        setLineNumberMap({});
        return;
      }

      const [workOrdersResult, allLinesResult] = await Promise.all([
        supabase
          .from("work_orders")
          .select("id, custom_id, vehicle_id, type")
          .in("id", workOrderIds)
          .neq("type", "historical_import"),
        supabase
          .from("work_order_lines")
          .select(
            "id, work_order_id, created_at, job_type, approval_state",
          )
          .eq("line_type", "job")
          .in("work_order_id", workOrderIds),
      ]);
      if (workOrdersResult.error) throw workOrdersResult.error;
      if (allLinesResult.error) throw allLinesResult.error;

      const workOrders = (workOrdersResult.data ?? []) as WorkOrderPick[];
      const allowedWorkOrderIds = new Set(workOrders.map((workOrder) => workOrder.id));
      setLines(
        assignedLines.filter(
          (line) =>
            Boolean(line.work_order_id) &&
            allowedWorkOrderIds.has(String(line.work_order_id)),
        ),
      );

      const vehicleIds = Array.from(
        new Set(
          workOrders
            .map((workOrder) => workOrder.vehicle_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const vehicleMap: Record<string, VehiclePick> = {};
      if (vehicleIds.length > 0) {
        const { data: vehicles, error: vehicleError } = await supabase
          .from("vehicles")
          .select("id, year, make, model, license_plate")
          .in("id", vehicleIds);
        if (vehicleError) throw vehicleError;
        for (const vehicle of (vehicles ?? []) as VehiclePick[]) {
          vehicleMap[vehicle.id] = vehicle;
        }
      }

      const nextWorkOrderMap: Record<string, WorkOrderMapRow> = {};
      for (const workOrder of workOrders) {
        nextWorkOrderMap[workOrder.id] = {
          id: workOrder.id,
          customId: workOrder.custom_id,
          vehicleLabel: workOrder.vehicle_id
            ? formatVehicle(vehicleMap[workOrder.vehicle_id])
            : null,
        };
      }
      setWorkOrderMap(nextWorkOrderMap);
      setLineNumberMap(
        buildLineNumbers(
          (allLinesResult.data ?? []) as Array<
            Pick<
              Line,
              | "id"
              | "work_order_id"
              | "created_at"
              | "job_type"
              | "approval_state"
            >
          >,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assigned jobs could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [applyOfflineBundle, supabase]);

  useEffect(() => {
    const refresh = () => setSyncSummary(getOfflineSyncSummary());
    refresh();
    return subscribeOfflineMutations(refresh);
  }, []);

  useEffect(() => {
    const refreshConnection = () => setOnline(navigator.onLine);
    refreshConnection();
    window.addEventListener("online", refreshConnection);
    window.addEventListener("offline", refreshConnection);
    return () => {
      window.removeEventListener("online", refreshConnection);
      window.removeEventListener("offline", refreshConnection);
    };
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadForOffline = useCallback(async () => {
    if (!scope || !navigator.onLine || downloading) return;
    setDownloading(true);
    setOfflineMessage(null);
    try {
      const bundle = await downloadAssignedTechnicianWork({ scope });
      applyOfflineBundle(bundle);
      setOfflineUpdatedAt(bundle.downloadedAt);
      await navigator.storage?.persist?.();
      setOfflineMessage(
        `${bundle.workOrders.length} assigned work order${
          bundle.workOrders.length === 1 ? " is" : "s are"
        } available offline.`,
      );
    } catch (caught) {
      setOfflineMessage(
        caught instanceof Error
          ? caught.message
          : "Assigned work could not be downloaded.",
      );
    } finally {
      setDownloading(false);
    }
  }, [applyOfflineBundle, downloading, scope]);

  const counts = useMemo(() => {
    const result: Record<RollupStatus, number> = {
      awaiting: 0,
      in_progress: 0,
      on_hold: 0,
      completed: 0,
    };
    for (const line of lines) result[toBucket(line)] += 1;
    return result;
  }, [lines]);

  const visibleLines = useMemo(() => {
    return [...lines]
      .sort((left, right) => {
        const statusDifference =
          STATUS_RANK[toBucket(left)] - STATUS_RANK[toBucket(right)];
        if (statusDifference !== 0) return statusDifference;

        const priorityDifference =
          PRIORITY_RANK[toPriority(left)] - PRIORITY_RANK[toPriority(right)];
        if (priorityDifference !== 0) return priorityDifference;

        const lineNumberDifference =
          (lineNumberMap[left.id] ?? 9999) -
          (lineNumberMap[right.id] ?? 9999);
        if (lineNumberDifference !== 0) return lineNumberDifference;

        return (
          new Date(right.created_at ?? 0).getTime() -
          new Date(left.created_at ?? 0).getTime()
        );
      })
      .filter((line) => filter === "all" || toBucket(line) === filter);
  }, [filter, lineNumberMap, lines]);

  const pendingSync =
    syncSummary.queued +
    syncSummary.syncing +
    syncSummary.failed +
    syncSummary.conflicted;

  return (
    <div className="mobile-tech-page mx-auto w-full max-w-3xl space-y-4 px-3 py-3 sm:px-4">
      <section className="mobile-tech-panel p-4">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Technician
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          My jobs
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          Tap a job to open its timer, photos, parts, notes, history, and assistant.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <QueueMetric label="Assigned" value={lines.length} />
          <QueueMetric label="Active" value={counts.in_progress} accent />
          <QueueMetric label="On hold" value={counts.on_hold} />
        </div>
      </section>

      {pendingSync > 0 ? (
        <Link
          href="/offline/sync"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100"
        >
          <span>
            Sync: {syncSummary.queued + syncSummary.syncing} pending • {syncSummary.failed} failed • {syncSummary.conflicted} conflicted
          </span>
          <span className="shrink-0 font-semibold">Open →</span>
        </Link>
      ) : null}

      <section className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter jobs">
        {FILTERS.map((item) => {
          const active = filter === item.value;
          const count =
            item.value === "all" ? lines.length : counts[item.value];
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                active
                  ? "border-[var(--accent-copper)] bg-[color:var(--accent-copper)] text-white"
                  : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] text-[color:var(--theme-text-primary)]"
              }`}
            >
              {item.label} {count}
            </button>
          );
        })}
      </section>

      {loading ? (
        <section className="space-y-2">
          {[0, 1, 2].map((value) => (
            <div
              key={value}
              className="mobile-tech-subpanel h-28 animate-pulse"
            />
          ))}
        </section>
      ) : error ? (
        <section className="mobile-tech-panel border border-red-500/35 p-4">
          <div className="text-sm font-semibold text-red-200">
            Assigned jobs could not be loaded
          </div>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 min-h-10 rounded-xl border border-[color:var(--theme-border-soft)] px-4 text-xs font-semibold"
          >
            Try again
          </button>
        </section>
      ) : visibleLines.length === 0 ? (
        <section className="mobile-tech-panel p-4 text-sm text-[color:var(--theme-text-secondary)]">
          {lines.length === 0
            ? "No jobs are assigned to you right now."
            : "No jobs match this filter."}
        </section>
      ) : (
        <section className="space-y-2">
          {visibleLines.map((line) => {
            const bucket = toBucket(line);
            const priority = toPriority(line);
            const workOrder = line.work_order_id
              ? workOrderMap[line.work_order_id]
              : null;
            const workOrderLabel =
              workOrder?.customId ||
              (workOrder?.id ? workOrder.id.slice(0, 8) : "Work order");
            const lineNumber = lineNumberMap[line.id];
            const jobLabel = cleanText(
              line.description || line.complaint || "Untitled job",
            );
            const approval = cleanText(line.approval_state || "approved");

            return (
              <Link
                key={line.id}
                href={`/mobile/jobs/${line.id}`}
                className="mobile-tech-subpanel block border border-[color:var(--theme-border-soft)] p-3 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.65rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                      WO {workOrderLabel}
                      {lineNumber ? ` • Line ${lineNumber}` : ""}
                    </div>
                    <div className="mt-1 truncate text-base font-semibold text-[color:var(--theme-text-primary)]">
                      {jobLabel}
                    </div>
                    <div className="mt-1 truncate text-xs text-[color:var(--theme-text-secondary)]">
                      {workOrder?.vehicleLabel || "Vehicle not listed"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {priority !== "normal" ? (
                        <span className="rounded-full border border-red-400/35 bg-red-500/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-red-100">
                          {priority}
                        </span>
                      ) : null}
                      {approval && approval.toLowerCase() !== "approved" ? (
                        <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-amber-100">
                          Approval {approval.replaceAll("_", " ")}
                        </span>
                      ) : null}
                      {line.punched_in_at && !line.punched_out_at ? (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-emerald-100">
                          Timer active
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold ${statusTone(bucket)}`}
                  >
                    {STATUS_LABELS[bucket]}
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      )}

      <details className="mobile-tech-panel group overflow-hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
          <span>Offline &amp; sync</span>
          <span className="text-xs text-[color:var(--theme-text-secondary)] group-open:rotate-180">
            ▼
          </span>
        </summary>
        <div className="space-y-3 border-t border-[color:var(--theme-border-soft)] px-4 py-4">
          <p className="text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            {offlineUpdatedAt
              ? `Assigned work saved ${new Date(offlineUpdatedAt).toLocaleString()}.`
              : "Assigned work has not been downloaded on this device."}
          </p>
          <button
            type="button"
            disabled={downloading || !scope || !online}
            onClick={() => void downloadForOffline()}
            className="min-h-11 w-full rounded-xl border border-[var(--accent-copper-soft)]/60 bg-[color:var(--theme-surface-inset)] px-4 text-sm font-semibold text-[color:var(--theme-text-primary)] disabled:opacity-45"
          >
            {downloading ? "Downloading…" : "Download assigned work"}
          </button>
          {!online ? (
            <p className="text-xs text-amber-200">This device is offline.</p>
          ) : null}
          {offlineMessage ? (
            <p className="text-xs text-[color:var(--theme-text-secondary)]">
              {offlineMessage}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function QueueMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-2 py-2 text-center ${
        accent
          ? "border-[var(--accent-copper-soft)]/60 bg-[color:var(--theme-surface-overlay)]"
          : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)]"
      }`}
    >
      <div className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
      <div className="mt-0.5 text-[0.58rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
    </div>
  );
}
