"use client";

import { useMemo, useState } from "react";
import type { HistoryItem } from "../types";

type Props = { items: HistoryItem[] };

const STATUS_LABELS: Record<string, string> = {
  awaiting: "Awaiting",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<string, string> = {
  awaiting:
    "bg-amber-500/10 text-amber-200 border border-amber-500/40",
  scheduled:
    "bg-sky-500/10 text-sky-200 border border-sky-500/40",
  in_progress:
    "bg-orange-500/10 text-orange-200 border border-orange-500/50",
  completed:
    "bg-emerald-500/10 text-emerald-200 border border-emerald-500/40",
  on_hold:
    "bg-purple-500/10 text-purple-200 border border-purple-500/40",
  cancelled:
    "bg-red-500/10 text-red-200 border border-red-500/40",
};

export default function HistoryList({ items }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    // newest → oldest by service_date
    const sorted = [...items].sort((a, b) => {
      const ta = a.service_date ? Date.parse(a.service_date) : 0;
      const tb = b.service_date ? Date.parse(b.service_date) : 0;
      return tb - ta;
    });

    return sorted.filter((h) => {
      const statusOk = !status || h.work_order?.status === status;

      const hay = [
        h.description ?? "",
        h.notes ?? "",
        h.vehicle
          ? `${h.vehicle.year ?? ""} ${h.vehicle.make ?? ""} ${
              h.vehicle.model ?? ""
            } ${h.vehicle.vin ?? ""} ${h.vehicle.license_plate ?? ""}`
          : "",
        h.work_order
          ? `${h.work_order.id ?? ""} ${h.work_order.type ?? ""} ${
              h.work_order.status ?? ""
            }`
          : "",
      ]
        .join(" ")
        .toLowerCase();

      const qOk = !needle || hay.includes(needle);
      return statusOk && qOk;
    });
  }, [items, q, status]);

  if (!items.length) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
        No service history yet. Once this vehicle has been in for service,
        you’ll see it here.
      </div>
    );
  }

  const hasFilters = Boolean(q || status);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-neutral-400">
              Search
            </label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-500"
              placeholder="Search vehicle, work order, notes…"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-[0.12em] text-neutral-400">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="min-w-[150px] rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-500"
            >
              <option value="">All statuses</option>
              <option value="awaiting">Awaiting</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On hold</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {hasFilters && (
            <button
              className="ml-auto rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
              onClick={() => {
                setQ("");
                setStatus("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-2 text-xs text-neutral-500">
          Showing{" "}
          <span className="font-semibold text-orange-300">
            {filtered.length}
          </span>{" "}
          of {items.length} visits
        </div>
      </div>

      {/* Empty-after-filter */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
          No service visits match your filters. Try clearing the search or
          choosing a different status.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((h) => {
            const statusKey = h.work_order?.status ?? "";
            const statusLabel =
              STATUS_LABELS[statusKey] ?? (statusKey || "Unknown");
            const statusClass =
              STATUS_CLASSES[statusKey] ??
              "bg-neutral-700/40 text-neutral-100 border border-neutral-600/60";

            const title = h.vehicle
              ? `${h.vehicle.year ?? ""} ${h.vehicle.make ?? ""} ${
                  h.vehicle.model ?? ""
                }`.trim() || "Vehicle"
              : "Vehicle";

            return (
              <li
                key={h.id}
                className="rounded-xl border border-neutral-800 bg-neutral-950/90 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-neutral-400">
                    {formatDate(h.service_date)}
                  </div>

                  {h.work_order && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                  )}
                </div>

                <div className="mt-1 text-sm font-semibold text-neutral-50">
                  {title}
                  {h.work_order && (
                    <span className="ml-1 text-xs font-normal text-neutral-400">
                      · WO #{h.work_order.id}
                    </span>
                  )}
                </div>

                {h.vehicle && (
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {h.vehicle.vin && (
                      <span className="mr-3">
                        VIN:{" "}
                        <span className="font-mono">{h.vehicle.vin}</span>
                      </span>
                    )}
                    {h.vehicle.license_plate && (
                      <span>
                        Plate:{" "}
                        <span className="font-mono">
                          {h.vehicle.license_plate}
                        </span>
                      </span>
                    )}
                  </div>
                )}

                {h.description && (
                  <div className="mt-2 text-sm text-neutral-200">
                    {h.description}
                  </div>
                )}

                {h.notes && (
                  <div className="mt-1 text-xs text-neutral-400">
                    {h.notes}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}