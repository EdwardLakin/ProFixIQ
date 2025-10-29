"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@headlessui/react";
import { toast } from "sonner";

type Item = { id: string; description: string; qty: number; notes?: string };

type Props = {
  isOpen: boolean;
  workOrderId: string;
  jobId: string;
  requestNote?: string | null;
  closeEventName?: string;      // default: "parts-request:close"
  submittedEventName?: string;  // default: "parts-request:submitted"
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
    { id: crypto.randomUUID(), description: "", qty: 1, notes: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setHeaderNotes(requestNote ?? "");
    setRows([{ id: crypto.randomUUID(), description: "", qty: 1, notes: "" }]);
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
      qty: Number(r.qty) || 0,
      notes: (r.notes || "").trim() || undefined,
    }))
    .filter((i) => i.description && i.qty > 0);

  const emit = (name: string) => window.dispatchEvent(new CustomEvent(name));

  async function submit() {
    if (validItems.length === 0) {
      toast.error("Add at least one line with a description and a positive quantity.");
      return;
    }
    setSubmitting(true);
    try {
      // 🔧 align with your new route: /api/parts/create/request
      const res = await fetch("/api/parts/create/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          workOrderLineId: jobId,
          items: validItems,
          notes: headerNotes || undefined,
        }),
      });

      const j = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !j?.id) throw new Error(j?.error || "Failed to create parts request");

      toast.success("Parts request sent to Parts.");
      emit(submittedEventName);
      emit(closeEventName);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={() => emit(closeEventName)} className="fixed inset-0 z-[330] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative mx-4 my-6 w-full max-w-2xl">
        <Dialog.Panel className="rounded border border-orange-400 bg-neutral-950 p-5 text-white shadow-xl">
          <Dialog.Title className="mb-3 font-header text-lg font-semibold">Request Parts</Dialog.Title>

          <div className="mb-4">
            <label className="mb-1 block text-sm text-neutral-300">Note to Parts (optional)</label>
            <textarea
              rows={2}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              value={headerNotes}
              onChange={(e) => setHeaderNotes(e.target.value)}
              placeholder="Any context, vendor prefs, deadlines…"
            />
          </div>

          <div className="overflow-hidden rounded border border-neutral-800">
            <div className="grid grid-cols-12 bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
              <div className="col-span-7">Description*</div>
              <div className="col-span-2 text-right">Qty*</div>
              <div className="col-span-2">Notes</div>
              <div className="col-span-1 text-center">—</div>
            </div>

            <div className="max-h-64 overflow-auto">
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 border-t border-neutral-800 p-2">
                  <input
                    className="col-span-7 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                    placeholder="e.g., 5W30 oil filter, rear pads, serpentine belt…"
                    value={r.description}
                    onChange={(e) => setCell(r.id, { description: e.target.value })}
                  />
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    className="col-span-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right text-sm"
                    value={r.qty}
                    onChange={(e) => setCell(r.id, { qty: Math.max(0.01, Number(e.target.value || 0)) })}
                  />
                  <input
                    className="col-span-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                    placeholder="optional"
                    value={r.notes ?? ""}
                    onChange={(e) => setCell(r.id, { notes: e.target.value })}
                  />
                  <div className="col-span-1 flex items-center justify-center">
                    <button
                      className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                      onClick={() => removeRow(r.id)}
                      disabled={rows.length <= 1}
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-neutral-800 px-2 py-2">
              <button
                className="rounded border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
                onClick={addRow}
              >
                + Add item
              </button>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => emit(closeEventName)}
              className="font-header rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || validItems.length === 0}
              className="font-header rounded border border-orange-500 px-4 py-2 text-sm hover:bg-orange-500/10 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit to Parts"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}