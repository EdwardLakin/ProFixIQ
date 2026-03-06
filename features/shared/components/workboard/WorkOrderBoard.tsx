"use client";

import { useMemo, useState } from "react";
import WorkOrderBoardCard from "./WorkOrderBoardCard";
import { useWorkOrderBoard } from "../../hooks/useWorkOrderBoard";
import type {
  WorkOrderBoardRow,
  WorkOrderBoardVariant,
} from "../../lib/workboard/types";

const FILTER_KEYS = [
  "all",
  "awaiting",
  "in_progress",
  "awaiting_approval",
  "waiting_parts",
  "on_hold",
  "completed",
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

function labelForFilter(key: FilterKey): string {
  if (key === "all") return "All";
  return key.replaceAll("_", " ");
}

function isCompletedStage(row: WorkOrderBoardRow): boolean {
  return row.overall_stage === "completed";
}

export default function WorkOrderBoard(props: {
  variant: WorkOrderBoardVariant;
  title: string;
  subtitle?: string;
  limit?: number;
  fleetId?: string | null;
  compact?: boolean;
  hrefBuilder?: (row: WorkOrderBoardRow) => string | null;
}) {
  const { rows, loading, error, refetch } = useWorkOrderBoard(props.variant, {
    limit: props.limit,
    fleetId: props.fleetId,
  });

  const [stageFilter, setStageFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  const searchedRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesStage =
        stageFilter === "all" ? true : row.overall_stage === stageFilter;

      const matchesQuery =
        q.length === 0
          ? true
          : [
              row.custom_id,
              row.display_name,
              row.unit_label,
              row.vehicle_label,
              row.assigned_summary,
              row.advisor_name,
              row.first_tech_name,
              ...(row.tech_names ?? []),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q);

      return matchesStage && matchesQuery;
    });
  }, [query, rows, stageFilter]);

  const counts = useMemo(() => {
    const base: Record<FilterKey, number> = {
      all: rows.length,
      awaiting: 0,
      in_progress: 0,
      awaiting_approval: 0,
      waiting_parts: 0,
      on_hold: 0,
      completed: 0,
    };

    for (const row of rows) {
      const key = row.overall_stage as FilterKey;
      if (key in base) base[key] += 1;
    }

    return base;
  }, [rows]);

  const activeRows = useMemo(
    () => searchedRows.filter((row) => !isCompletedStage(row)),
    [searchedRows],
  );

  const completedRows = useMemo(
    () => searchedRows.filter((row) => isCompletedStage(row)),
    [searchedRows],
  );

  const showCompletedSection =
    !props.compact && (stageFilter === "all" || stageFilter === "completed");

  const activeCount = useMemo(
    () => rows.filter((row) => !isCompletedStage(row)).length,
    [rows],
  );

  const stalledCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.overall_stage === "on_hold" ||
          row.overall_stage === "awaiting_approval" ||
          row.overall_stage === "waiting_parts",
      ).length,
    [rows],
  );

  const waiterCount = useMemo(
    () => rows.filter((row) => !!row.is_waiter).length,
    [rows],
  );

  const urgentCount = useMemo(
    () => rows.filter((row) => row.priority === 1).length,
    [rows],
  );

  const completedCount = counts.completed;

  return (
    <section className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Board
          </div>
          <h2
            className="mt-1 text-2xl text-white md:text-3xl"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            {props.title}
          </h2>

          {props.subtitle ? (
            <p className="mt-2 text-sm text-neutral-300">{props.subtitle}</p>
          ) : null}

          {!loading && !error ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold text-neutral-200">
                Active: <span className="text-white">{activeCount}</span>
              </div>
              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold text-neutral-200">
                Stalled: <span className="text-white">{stalledCount}</span>
              </div>
              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold text-neutral-200">
                Waiters: <span className="text-white">{waiterCount}</span>
              </div>
              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold text-neutral-200">
                Urgent: <span className="text-white">{urgentCount}</span>
              </div>
              <div className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] font-semibold text-neutral-200">
                Completed: <span className="text-white">{completedCount}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 md:min-w-[380px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work order, customer, unit, vehicle, advisor, tech"
            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500"
          />

          <div className="flex flex-wrap gap-2">
            {FILTER_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStageFilter(key)}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition",
                  stageFilter === key
                    ? "border-[color:var(--pfq-copper)] bg-[color:var(--pfq-copper)]/15 text-[color:var(--accent-copper-light)]"
                    : "border-white/10 bg-black/20 text-neutral-300 hover:bg-black/30",
                ].join(" ")}
              >
                {labelForFilter(key)}{" "}
                <span className="ml-1 text-[10px] opacity-80">{counts[key]}</span>
              </button>
            ))}

            <button
              type="button"
              onClick={refetch}
              className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-black/30"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: props.compact ? 5 : 9 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : searchedRows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-neutral-300">
          No work orders found for this filter.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            {!props.compact ? (
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Active work
                </div>
                <div className="text-[11px] text-neutral-500">
                  {activeRows.length} visible
                </div>
              </div>
            ) : null}

            {activeRows.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-neutral-300">
                No active work orders found for this filter.
              </div>
            ) : (
              <div
                className={[
                  "grid gap-3",
                  props.compact ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3",
                ].join(" ")}
              >
                {activeRows.map((row) => (
                  <WorkOrderBoardCard
                    key={row.work_order_id}
                    row={row}
                    variant={props.variant}
                    compact={props.compact}
                    href={props.hrefBuilder ? props.hrefBuilder(row) : null}
                  />
                ))}
              </div>
            )}
          </div>

          {showCompletedSection ? (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  Completed / history
                </div>
                <div className="text-[11px] text-neutral-500">
                  {completedRows.length} visible
                </div>
              </div>

              {completedRows.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-neutral-400">
                  No completed work orders found for this filter.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {completedRows.map((row) => (
                    <WorkOrderBoardCard
                      key={row.work_order_id}
                      row={row}
                      variant={props.variant}
                      compact={false}
                      href={props.hrefBuilder ? props.hrefBuilder(row) : null}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}