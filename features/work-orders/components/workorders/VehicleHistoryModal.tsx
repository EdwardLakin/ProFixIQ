"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";

import ModalShell from "@/features/shared/components/ModalShell";

type HistoryLine = {
  id: string;
  lineNumber: number | null;
  description: string | null;
  complaint: string | null;
  cause: string | null;
  correction: string | null;
  notes: string | null;
  status: string | null;
  completedAt: string | null;
};

type HistoryRecord = {
  id: string;
  workOrderNumber: string | null;
  status: string | null;
  completedAt: string | null;
  odometerKm: number | null;
  customerName: string | null;
  notes: string | null;
  lines: HistoryLine[];
};

type VehicleHistoryPayload = {
  ok?: boolean;
  history?: HistoryRecord[];
  error?: string;
};

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "Date unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return format(date, "PP");
}

function statusLabel(status: string | null | undefined): string {
  const normalized = (status ?? "").trim();
  if (!normalized) return "Completed";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function workOrderLabel(row: HistoryRecord): string {
  return row.workOrderNumber?.trim() || `WO ${row.id.slice(0, 8)}`;
}

function lineLabel(line: HistoryLine, index: number): string {
  return (
    line.description?.trim() ||
    line.complaint?.trim() ||
    `Service line ${line.lineNumber ?? index + 1}`
  );
}

function searchText(row: HistoryRecord): string {
  return [
    row.id,
    row.workOrderNumber,
    row.status,
    row.customerName,
    row.notes,
    row.odometerKm,
    fmtDateShort(row.completedAt),
    ...row.lines.flatMap((line) => [
      line.description,
      line.complaint,
      line.cause,
      line.correction,
      line.notes,
      line.status,
      fmtDateShort(line.completedAt),
    ]),
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

export default function VehicleHistoryModal(props: {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  workOrderLineId: string;
}): JSX.Element {
  const { isOpen, onClose, workOrderId, workOrderLineId } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRecord[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!workOrderId) return;

    setLoading(true);
    setErr(null);

    try {
      const response = await fetch(
        `/api/work-orders/${encodeURIComponent(workOrderId)}/vehicle-history?lineId=${encodeURIComponent(workOrderLineId)}`,
        { cache: "no-store" },
      );
      const payload = (await response
        .json()
        .catch(() => null)) as VehicleHistoryPayload | null;

      if (!response.ok || !payload?.ok || !Array.isArray(payload.history)) {
        throw new Error(payload?.error || "Failed to load vehicle history.");
      }

      setRows(payload.history);
    } catch (error) {
      setErr(
        error instanceof Error
          ? error.message
          : "Failed to load vehicle history.",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workOrderId, workOrderLineId]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    void load();
  }, [isOpen, load]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) => searchText(row).includes(normalized));
  }, [query, rows]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="VEHICLE HISTORY"
      size="xl"
      hideFooter
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
            Prior service
          </div>
          <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            Completed work orders and service lines for this vehicle, including
            work performed by other technicians in this shop.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Search history
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Work order, repair, cause, correction…"
              className="mt-1.5 w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            />
          </label>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-full border border-[var(--accent-copper-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-copper-light)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div aria-live="polite">
          {err ? (
            <div className="rounded-xl border border-red-500/40 bg-red-950/35 px-4 py-3 text-sm text-red-100">
              {err}
            </div>
          ) : loading && rows.length === 0 ? (
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
              Loading vehicle history…
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
              {query.trim()
                ? "No prior service matches this search."
                : "No completed prior work orders were found for this vehicle."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map((row) => (
                <article
                  key={row.id}
                  className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)]"
                >
                  <div className="flex flex-col gap-3 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
                        Work order
                      </div>
                      <h3 className="mt-1 truncate text-base font-semibold text-[color:var(--theme-text-primary)]">
                        {workOrderLabel(row)}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                        <span>{fmtDateShort(row.completedAt)}</span>
                        {row.customerName ? (
                          <span>{row.customerName}</span>
                        ) : null}
                        {typeof row.odometerKm === "number" ? (
                          <span>
                            {Math.round(row.odometerKm).toLocaleString()} km
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <span className="w-fit shrink-0 rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
                      {statusLabel(row.status)}
                    </span>
                  </div>

                  <div className="space-y-3 px-4 py-4">
                    {row.notes?.trim() ? (
                      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                        {row.notes}
                      </div>
                    ) : null}

                    {row.lines.length === 0 ? (
                      <div className="text-sm text-[color:var(--theme-text-muted)]">
                        No completed service-line details are available for this
                        work order.
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {row.lines.map((line, index) => (
                          <div
                            key={line.id}
                            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                                  Line {line.lineNumber ?? index + 1}
                                </div>
                                <div className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
                                  {lineLabel(line, index)}
                                </div>
                              </div>
                              <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                                {statusLabel(line.status)}
                              </span>
                            </div>

                            <dl className="mt-3 space-y-2 text-xs">
                              {line.complaint?.trim() ? (
                                <div>
                                  <dt className="font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                                    Complaint
                                  </dt>
                                  <dd className="mt-0.5 leading-5 text-[color:var(--theme-text-secondary)]">
                                    {line.complaint}
                                  </dd>
                                </div>
                              ) : null}
                              {line.cause?.trim() ? (
                                <div>
                                  <dt className="font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                                    Cause
                                  </dt>
                                  <dd className="mt-0.5 leading-5 text-[color:var(--theme-text-secondary)]">
                                    {line.cause}
                                  </dd>
                                </div>
                              ) : null}
                              {line.correction?.trim() ? (
                                <div>
                                  <dt className="font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                                    Correction
                                  </dt>
                                  <dd className="mt-0.5 leading-5 text-[color:var(--theme-text-secondary)]">
                                    {line.correction}
                                  </dd>
                                </div>
                              ) : null}
                              {line.notes?.trim() &&
                              line.notes.trim() !== line.description?.trim() ? (
                                <div>
                                  <dt className="font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
                                    Notes
                                  </dt>
                                  <dd className="mt-0.5 leading-5 text-[color:var(--theme-text-secondary)]">
                                    {line.notes}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
