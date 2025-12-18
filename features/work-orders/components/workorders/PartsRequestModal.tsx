"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";

type Item = { id: string; description: string; qty: number };

type Props = {
  isOpen: boolean;
  workOrderId: string;
  jobId: string;
  requestNote?: string | null;
  closeEventName?: string;
  submittedEventName?: string;
};

type SubmittedDetail = {
  requestId: string;
  workOrderId: string;
  jobId: string;
};

export default function PartsRequestModal({
  isOpen,
  workOrderId,
  jobId,
  requestNote = "",
  closeEventName = "parts-request:close",
  submittedEventName = "parts-request:submitted",
}: Props) {
  const [headerNotes, setHeaderNotes] = useState(requestNote ?? "");
  const [rows, setRows] = useState<Item[]>([
    { id: crypto.randomUUID(), description: "", qty: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setHeaderNotes(requestNote ?? "");
    setRows([{ id: crypto.randomUUID(), description: "", qty: 1 }]);
  }, [isOpen, requestNote]);

  const addRow = () =>
    setRows((r) => [...r, { id: crypto.randomUUID(), description: "", qty: 1 }]);

  const removeRow = (id: string) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r));

  const setCell = (id: string, patch: Partial<Item>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const validItems = rows
    .map((r) => ({
      description: r.description.trim(),
      qty: Number(r.qty) || 1,
    }))
    .filter((i) => i.description && i.qty > 0);

  const emit = (name: string, detail?: unknown) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
    }
  };

  async function submit() {
    if (submitting) return;

    if (!workOrderId || !jobId) {
      toast.error("Missing work order or job id.");
      return;
    }

    if (validItems.length === 0) {
      toast.error("Add at least one line.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/parts/requests/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          jobId,
          notes: headerNotes || undefined,
          items: validItems,
        }),
      });

      const raw = await res.text();
      let json: { requestId?: string; error?: string } | null = null;
      try {
        json = raw ? (JSON.parse(raw) as { requestId?: string; error?: string }) : null;
      } catch {
        /* ignore */
      }

      if (!res.ok || !json?.requestId) {
        const msg = json?.error || raw || `Request failed with status ${res.status}`;
        toast.error(`Parts request failed: ${msg}`);
        return;
      }

      toast.success("Parts request sent.");

      const detail: SubmittedDetail = {
        requestId: json.requestId,
        workOrderId,
        jobId,
      };

      emit(submittedEventName, detail);
      emit(closeEventName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => emit(closeEventName)}
      title="REQUEST PARTS"
      size="lg"
      onSubmit={submit}
      submitText={submitting ? "Submitting…" : "Submit to Parts"}
    >
      <div className="space-y-4">
        {/* Header meta */}
        <div className="flex flex-col gap-1 text-[0.7rem] text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Work order
            </span>
            <span className="rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1 font-mono text-[0.7rem] text-neutral-100">
              {workOrderId}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.18em] text-neutral-300">
              Job
            </span>
            <span className="rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1 font-mono text-[0.7rem] text-neutral-100">
              {jobId}
            </span>
          </div>
        </div>

        {/* Note to parts */}
        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Note to parts (optional)
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-black/75 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={headerNotes}
            onChange={(e) => setHeaderNotes(e.target.value)}
            placeholder="Anything they should know before filling this request…"
          />
        </div>

        {/* Items grid */}
        <div className="overflow-hidden rounded-2xl border border-[var(--metal-border-soft)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.85)]">
          {/* Header row */}
          <div className="grid grid-cols-12 bg-gradient-to-r from-slate-900/90 via-slate-950 to-black px-3 py-2 text-[0.7rem] uppercase tracking-[0.16em] text-neutral-400">
            <div className="col-span-8">Description*</div>
            <div className="col-span-3 text-right">Qty*</div>
            <div className="col-span-1 text-center"> </div>
          </div>

          {/* Rows */}
          <div className="max-h-64 overflow-auto bg-black/70">
            {rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-12 gap-2 border-t border-white/5 px-3 py-2"
              >
                <input
                  className="col-span-8 rounded-md border border-[var(--metal-border-soft)] bg-black/80 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
                  value={r.description}
                  onChange={(e) => setCell(r.id, { description: e.target.value })}
                  placeholder="e.g. rear pads, serp belt…"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="col-span-3 rounded-md border border-[var(--metal-border-soft)] bg-black/80 px-2 py-1 text-right text-sm text-neutral-100 outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
                  value={r.qty}
                  onChange={(e) =>
                    setCell(r.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
                <div className="col-span-1 flex items-center justify-center">
                  <button
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--metal-border-soft)] bg-black/70 text-[0.7rem] text-neutral-300 transition hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40 disabled:hover:bg-black/70 disabled:hover:text-neutral-300"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length <= 1}
                    title={rows.length <= 1 ? "At least one row is required" : "Remove row"}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add row footer */}
          <div className="border-t border-white/5 bg-black/80 px-3 py-2">
            <button
              className="inline-flex items-center gap-1 rounded-full border border-[var(--metal-border-soft)] bg-black/70 px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-neutral-100 transition hover:border-[var(--accent-copper-soft)] hover:bg-[var(--accent-copper-faint)] hover:text-[var(--accent-copper-soft)]"
              onClick={addRow}
              type="button"
            >
              <span>+</span>
              <span>Add item</span>
            </button>
          </div>
        </div>

        <p className="text-[0.7rem] text-neutral-500">
          Only lines with a description and quantity &gt; 0 will be sent.
        </p>
      </div>
    </ModalShell>
  );
}