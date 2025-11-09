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
        err instanceof Error ? err.message : "Unable to submit request"
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
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div className="relative z-[510] w-full max-w-2xl">
        <Dialog.Panel className="rounded-lg border border-border bg-background text-foreground shadow-xl dark:border-orange-400/90 dark:bg-neutral-950">
          <Dialog.Title className="border-b border-border/60 px-6 py-4 text-lg font-header font-semibold dark:border-neutral-800">
            Request Parts
          </Dialog.Title>

          <div className="px-6 py-5">
            <label className="mb-1 block text-sm text-foreground/80 dark:text-neutral-300">
              Note to Parts (optional)
            </label>
            <textarea
              rows={2}
              className="mb-4 w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              value={headerNotes}
              onChange={(e) => setHeaderNotes(e.target.value)}
            />

            <div className="overflow-hidden rounded border border-border/60 dark:border-neutral-800">
              <div className="grid grid-cols-12 bg-muted/50 px-3 py-2 text-xs text-muted-foreground dark:bg-neutral-900 dark:text-neutral-400">
                <div className="col-span-8">Description*</div>
                <div className="col-span-3 text-right">Qty*</div>
                <div className="col-span-1 text-center">—</div>
              </div>

              <div className="max-h-60 overflow-auto bg-background/40 dark:bg-neutral-950/20">
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-12 gap-2 border-t border-border/60 p-2 dark:border-neutral-800"
                  >
                    <input
                      className="col-span-8 rounded border border-border/60 bg-background px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                      value={r.description}
                      onChange={(e) => setCell(r.id, { description: e.target.value })}
                      placeholder="e.g. rear pads, serp belt…"
                    />
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="col-span-3 rounded border border-border/60 bg-background px-2 py-1 text-right text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                      value={r.qty}
                      onChange={(e) =>
                        setCell(r.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                    <div className="col-span-1 flex items-center justify-center">
                      <button
                        className="rounded border border-border/60 px-2 py-1 text-xs hover:bg-muted dark:border-neutral-700 dark:hover:bg-neutral-800 disabled:opacity-40"
                        onClick={() => removeRow(r.id)}
                        disabled={rows.length <= 1}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/60 bg-background/40 px-2 py-2 dark:border-neutral-800 dark:bg-neutral-950/40">
                <button
                  className="rounded border border-border/60 px-3 py-1 text-sm hover:bg-muted dark:border-neutral-700 dark:hover:bg-neutral-800"
                  onClick={addRow}
                >
                  + Add item
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border/60 px-6 py-4 dark:border-neutral-800">
            <button
              onClick={() => emit(closeEventName)}
              className="font-header rounded border border-border/70 bg-background px-4 py-2 text-sm hover:bg-muted dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || validItems.length === 0}
              className="font-header rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit to Parts"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}