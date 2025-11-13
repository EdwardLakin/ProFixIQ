"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import { toast } from "sonner";

type Item = { id: string; description: string; qty: number };

type Props = {
  isOpen: boolean;
  workOrderId: string;
  jobId: string;
  requestNote?: string | null;
  closeEventName?: string;
  submittedEventName?: string;
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

  const emit = (name: string) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(name));
    }
  };

  async function submit() {
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
        json = raw ? (JSON.parse(raw) as any) : null;
      } catch {
        /* ignore */
      }

      if (!res.ok || !json?.requestId) {
        const msg = json?.error || raw || `Request failed with status ${res.status}`;
        toast.error(`Parts request failed: ${msg}`);
        return;
      }

      toast.success("Parts request sent.");
      emit(submittedEventName);
      emit(closeEventName);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to submit request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={() => emit(closeEventName)}
      className="fixed inset-0 z-[500] flex items-center justify-center px-3 py-6 sm:px-4"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[500] bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-[510] w-full max-w-3xl">
        <Dialog.Panel className="overflow-hidden rounded-lg border border-orange-400 bg-neutral-950 text-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-5 py-3">
            <div>
              <Dialog.Title className="text-sm font-blackops tracking-wide text-orange-400 sm:text-base">
                Request Parts
              </Dialog.Title>
              <p className="mt-0.5 text-[11px] text-neutral-400">
                WO:{" "}
                <span className="font-mono text-neutral-200">
                  {workOrderId}
                </span>{" "}
                · Job:{" "}
                <span className="font-mono text-neutral-200">
                  {jobId}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => emit(closeEventName)}
              className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-300">
                Note to Parts (optional)
              </label>
              <textarea
                rows={2}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                value={headerNotes}
                onChange={(e) => setHeaderNotes(e.target.value)}
                placeholder="Anything they should know before filling this request…"
              />
            </div>

            <div className="overflow-hidden rounded border border-neutral-800 bg-neutral-950/60">
              {/* Header row */}
              <div className="grid grid-cols-12 bg-neutral-900/80 px-3 py-2 text-xs text-neutral-400">
                <div className="col-span-8">Description*</div>
                <div className="col-span-3 text-right">Qty*</div>
                <div className="col-span-1 text-center">—</div>
              </div>

              {/* Rows */}
              <div className="max-h-64 overflow-auto bg-neutral-950">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-12 gap-2 border-t border-neutral-800 px-2 py-2"
                  >
                    <input
                      className="col-span-8 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
                      value={r.description}
                      onChange={(e) =>
                        setCell(r.id, { description: e.target.value })
                      }
                      placeholder="e.g. rear pads, serp belt…"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="col-span-3 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right text-sm text-white focus:border-orange-500 focus:outline-none"
                      value={r.qty}
                      onChange={(e) =>
                        setCell(r.id, {
                          qty: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                    <div className="col-span-1 flex items-center justify-center">
                      <button
                        className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                        onClick={() => removeRow(r.id)}
                        disabled={rows.length <= 1}
                        title={
                          rows.length <= 1
                            ? "At least one row is required"
                            : "Remove row"
                        }
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add row footer */}
              <div className="border-t border-neutral-800 bg-neutral-950/80 px-3 py-2">
                <button
                  className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-100 hover:bg-neutral-900"
                  onClick={addRow}
                  type="button"
                >
                  + Add item
                </button>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500">
              Only lines with a description and quantity &gt; 0 will be sent.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
            <button
              onClick={() => emit(closeEventName)}
              className="rounded border border-neutral-700 bg-neutral-900 px-4 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || validItems.length === 0}
              className="rounded bg-orange-500 px-4 py-1.5 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
              type="button"
            >
              {submitting ? "Submitting…" : "Submit to Parts"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}