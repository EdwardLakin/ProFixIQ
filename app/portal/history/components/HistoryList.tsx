"use client";

import { useMemo, useState } from "react";
import type { HistoryItem } from "../types";

type Props = { items: HistoryItem[] };

export default function HistoryList({ items }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((h) => {
      const statusOk = !status || h.work_order?.status === status;
      const hay = [
        h.description ?? "",
        h.notes ?? "",
        h.vehicle ? `${h.vehicle.year} ${h.vehicle.make} ${h.vehicle.model} ${h.vehicle.vin ?? ""}` : "",
        h.work_order ? `${h.work_order.id} ${h.work_order.type ?? ""} ${h.work_order.status ?? ""}` : "",
      ]
        .join(" ")
        .toLowerCase();

      const qOk = !needle || hay.includes(needle);
      return statusOk && qOk;
    });
  }, [items, q, status]);

  if (!items.length) {
    return <div className="text-neutral-400">No service history yet.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-white"
          placeholder="Search vehicle, WO#, notes…"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded bg-neutral-900 border border-neutral-800 text-white"
        >
          <option value="">All statuses</option>
          <option value="awaiting">awaiting</option>
          <option value="scheduled">scheduled</option>
          <option value="in_progress">in_progress</option>
          <option value="completed">completed</option>
          <option value="on_hold">on_hold</option>
          <option value="cancelled">cancelled</option>
        </select>
        {(q || status) && (
          <button
            className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700"
            onClick={() => {
              setQ("");
              setStatus("");
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* List */}
      <ul className="space-y-3">
        {filtered.map((h) => (
          <li key={h.id} className="border border-neutral-800 rounded p-3 bg-neutral-900">
            <div className="text-sm text-neutral-400">{formatDate(h.service_date)}</div>

            <div className="font-medium">
              {h.vehicle ? `${h.vehicle.year} ${h.vehicle.make} ${h.vehicle.model}` : "Vehicle"}
              {h.work_order ? (
                <span className="text-neutral-400"> · WO #{h.work_order.id} · {h.work_order.status}</span>
              ) : null}
            </div>

            {h.description ? <div className="text-neutral-300">{h.description}</div> : null}
            {h.notes ? <div className="text-neutral-400 text-sm mt-1">{h.notes}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}