"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Credit = {
  id: string;
  work_order_line_id: string;
  technician_id: string;
  credit_hours: number;
  credit_source: string;
  actual_job_seconds: number;
  credited_at: string;
  adjustment_reason: string | null;
  technician?: { full_name?: string | null } | null;
  line?: {
    description?: string | null;
    labor_time?: number | null;
    status?: string | null;
    work_order_id?: string | null;
  } | null;
};

type Props = {
  periodStart: string;
  periodEnd: string;
  locked: boolean;
  onSaved: () => void;
};

export function FlatRateCreditReview({
  periodStart,
  periodEnd,
  locked,
  onSaved,
}: Props) {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Array<{ technician_id: string; credit_hours: string }>>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ from: periodStart, to: periodEnd });
    const response = await fetch(
      `/api/workforce/flat-rate/credits?${params.toString()}`,
      { cache: "no-store" },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok) setError(body?.error ?? "Unable to load flat-rate credits.");
    else {
      setCredits((body?.credits ?? []) as Credit[]);
      setError(null);
    }
    setLoading(false);
  }, [periodEnd, periodStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const lines = useMemo(() => {
    const grouped = new Map<
      string,
      { lineId: string; line: Credit["line"]; credits: Credit[] }
    >();
    for (const credit of credits) {
      const group = grouped.get(credit.work_order_line_id) ?? {
        lineId: credit.work_order_line_id,
        line: credit.line,
        credits: [],
      };
      group.credits.push(credit);
      grouped.set(credit.work_order_line_id, group);
    }
    return [...grouped.values()];
  }, [credits]);

  const selected = lines.find((line) => line.lineId === selectedLineId) ?? null;

  function beginAdjust(lineId: string) {
    const line = lines.find((candidate) => candidate.lineId === lineId);
    if (!line) return;
    setSelectedLineId(lineId);
    setDraft(
      line.credits.map((credit) => ({
        technician_id: credit.technician_id,
        credit_hours: Number(credit.credit_hours).toFixed(2),
      })),
    );
    setReason("");
    setError(null);
  }

  async function save() {
    if (!selectedLineId || !reason.trim()) {
      setError("An adjustment reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const response = await fetch("/api/workforce/flat-rate/credits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        line_id: selectedLineId,
        credits: draft.map((credit) => ({
          technician_id: credit.technician_id,
          credit_hours: Number(credit.credit_hours),
        })),
        reason,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.error ?? "Unable to save the flat-rate split.");
      setSaving(false);
      return;
    }
    setSelectedLineId(null);
    setReason("");
    await load();
    onSaved();
    setSaving(false);
  }

  return (
    <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
            Flat-rate credit review
          </p>
          <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
            Flagged hours are durable evidence. Automatic multi-tech splits follow
            actual job time and must always total the approved line hours.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {loading ? (
        <p className="mt-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading credits…
        </p>
      ) : lines.length === 0 ? (
        <p className="mt-4 text-sm text-[color:var(--theme-text-secondary)]">
          No completed labor has flagged-hour credit in this period yet.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {lines.map((line) => (
            <div
              key={line.lineId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--theme-border-soft)] p-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {line.line?.description || `Line ${line.lineId.slice(0, 8)}`}
                </p>
                <p className="text-xs text-[color:var(--theme-text-muted)]">
                  {line.credits
                    .map(
                      (credit) =>
                        `${credit.technician?.full_name || credit.technician_id.slice(0, 8)} ${Number(credit.credit_hours).toFixed(2)}h`,
                    )
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={() => beginAdjust(line.lineId)}
                className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {locked ? "Period locked" : "Adjust split"}
              </button>
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <div className="mt-4 space-y-3 rounded-xl border border-orange-400/30 bg-orange-500/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              Adjust {selected.line?.description || "flat-rate split"}
            </p>
            <p className="text-xs text-[color:var(--theme-text-muted)]">
              Required total: {Number(selected.line?.labor_time ?? 0).toFixed(2)}h
            </p>
          </div>
          {draft.map((credit, index) => {
            const source = selected.credits.find(
              (item) => item.technician_id === credit.technician_id,
            );
            return (
              <label
                key={credit.technician_id}
                className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]"
              >
                {source?.technician?.full_name || credit.technician_id}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={credit.credit_hours}
                  onChange={(event) =>
                    setDraft((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, credit_hours: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
                />
              </label>
            );
          })}
          <label className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
            Adjustment reason
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this split changing?"
              className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save audited split"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedLineId(null)}
              className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
