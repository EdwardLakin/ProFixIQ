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

  // what we actually send
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
      // 👇 this MUST match your route: app/api/parts/requests/create/route.ts
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

      // read raw text first so we can show *anything* the API returns
      const raw = await res.text();
      let json: { requestId?: string; error?: string } | null = null;
      try {
        json = raw ? (JSON.parse(raw) as any) : null;
      } catch {
        // not JSON, we'll surface raw below
      }

      if (!res.ok || !json?.requestId) {
        // show the *actual* problem
        const msg =
          json?.error ||
          raw ||
          `Request failed with status ${res.status}`;
        toast.error(`Parts request failed: ${msg}`);
        return;
      }

      // success
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
      className="fixed inset-0 z-[600] flex items-center justify-center"
    >
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative mx-4 my-6 w-full max-w-2xl">
        <Dialog.Panel
          className="relative z-[610] rounded border border-orange-400 bg-neutral-950 p-5 text-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Dialog.Title className="mb-3 font-header text-lg font-semibold">
            Request Parts
          </Dialog.Title>

          <div className="mb-4">
            <label className="mb-1 block text-sm text-neutral-300">
              Note to Parts (optional)
            </label>
            <textarea
              rows={2}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              value={headerNotes}
              onChange={(e) => setHeaderNotes(e.target.value)}
            />
          </div>

          <div className="overflow-hidden rounded border border-neutral-800">
            <div className="grid grid-cols-12 bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
              <div className="col-span-8">Description*</div>
              <div className="col-span-3 text-right">Qty*</div>
              <div className="col-span-1 text-center">—</div>
            </div>

            <div className="max-h-64 overflow-auto">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-12 gap-2 border-t border-neutral-800 p-2"
                >
                  <input
                    className="col-span-8 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                    value={r.description}
                    onChange={(e) => setCell(r.id, { description: e.target.value })}
                    placeholder="e.g. rear pads, serp belt…"
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className="col-span-3 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-right text-sm"
                    value={r.qty}
                    onChange={(e) =>
                      setCell(r.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                  <div className="col-span-1 flex items-center justify-center">
                    <button
                      className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-40"
                      onClick={() => removeRow(r.id)}
                      disabled={rows.length <= 1}
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