"use client";

import { useMemo, useState } from "react";
import WorkOrderBoardCard from "./WorkOrderBoardCard";
import { useWorkOrderBoard } from "../../hooks/useWorkOrderBoard";
import type { WorkOrderBoardRow, WorkOrderBoardVariant } from "../../lib/workboard/types";

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
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesStage = stageFilter === "all" ? true : row.overall_stage === stageFilter;
      const q = query.trim().toLowerCase();
      const matchesQuery =
        q.length === 0
          ? true
          : [row.custom_id, row.display_name, row.unit_label, row.vehicle_label]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(q);

      return matchesStage && matchesQuery;
    });
  }, [query, rows, stageFilter]);

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
          {props.subtitle ? <p className="mt-2 text-sm text-neutral-300">{props.subtitle}</p> : null}
        </div>

        <div className="flex flex-col gap-2 md:min-w-[380px]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work order, customer, unit, vehicle"
            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500"
          />

          <div className="flex flex-wrap gap-2">
            {["all", "awaiting", "in_progress", "awaiting_approval", "waiting_parts", "on_hold", "completed"].map(
              (key) => (
                <button
                  key={key}
                  onClick={() => setStageFilter(key)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    stageFilter === key
                      ? "border-[color:var(--pfq-copper)] bg-[color:var(--pfq-copper)]/15 text-[color:var(--accent-copper-light)]"
                      : "border-white/10 bg-black/20 text-neutral-300 hover:bg-black/30",
                  ].join(" ")}
                >
                  {key === "all" ? "All" : key.replaceAll("_", " ")}
                </button>
              ),
            )}

            <button
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
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-6 text-sm text-neutral-300">
          No work orders found for this filter.
        </div>
      ) : (
        <div
          className={[
            "mt-6 grid gap-3",
            props.compact ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3",
          ].join(" ")}
        >
          {filtered.map((row) => (
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
    </section>
  );
}
