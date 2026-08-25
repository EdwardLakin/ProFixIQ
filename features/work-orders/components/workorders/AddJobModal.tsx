// /features/work-orders/components/AddJobModal.tsx (FULL FILE REPLACEMENT)
"use client";

import { useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import ModalShell from "@/features/shared/components/ModalShell";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  onJobAdded?: () => void;
};

type Urgency = "low" | "medium" | "high";

/* ----------------------------- helpers ----------------------------- */

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

function safeTrim(x: unknown): string {
  return typeof x === "string" ? x.trim() : "";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type ItemRow = { id: string; description: string; qty: string };

type PartRequestCreateBody = {
  workOrderId: string;
  jobId?: string | null;
  items: { description: string; qty: number }[];
  notes?: string | null;
};

type LineCreationIntent = {
  fingerprint: string;
  lineId: string;
};

type ManualLineCreateBody = {
  lineId: string;
  jobName: string;
  notes: string;
  laborHours: number;
  parts: { description: string; qty: number }[];
  urgency: Urgency;
};

function parsePartsPaste(raw: string): { description: string; qty: number }[] {
  const s = safeTrim(raw);
  if (!s) return [];
  const tokens = s
    .split(/[\n,]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: { description: string; qty: number }[] = [];
  for (const t of tokens) {
    // supports: "2x oil filter", "2 x oil filter", "2 oil filter"
    const m = /^(\d+(?:\.\d+)?)\s*(?:x|×)?\s+(.*)$/i.exec(t);
    if (m) {
      const qtyNum = Number(m[1]);
      const desc = (m[2] ?? "").trim();
      if (!desc) continue;
      out.push({
        description: desc,
        qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 1,
      });
    } else {
      out.push({ description: t, qty: 1 });
    }
  }
  return out;
}

export default function AddJobModal(props: Props) {
  const { isOpen, onClose, workOrderId, onJobAdded } = props;
  const submissionInFlightRef = useRef(false);
  const lineIntentRef = useRef<LineCreationIntent | null>(null);

  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [labor, setLabor] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");

  // ✅ parts request style rows
  const [rows, setRows] = useState<ItemRow[]>([
    { id: uuidv4(), description: "", qty: "1" },
  ]);
  const [headerNotes, setHeaderNotes] = useState("");

  // quick paste
  const [partsPaste, setPartsPaste] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addRow = () =>
    setRows((r) => [...r, { id: uuidv4(), description: "", qty: "1" }]);

  const removeRow = (id: string) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r));

  const setCell = (id: string, patch: Partial<ItemRow>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const validItems = rows
    .map((r) => {
      const description = r.description.trim();
      const n = Number.parseInt(r.qty, 10);
      const qty = Number.isFinite(n) ? n : 0;
      return { description, qty };
    })
    .filter((i) => i.description && i.qty > 0);

  function importPaste() {
    const parsed = parsePartsPaste(partsPaste);
    if (parsed.length === 0) {
      setErr("Nothing to import. Paste like: 2x oil filter, serpentine belt");
      return;
    }

    setErr(null);
    setRows((prev) => [
      ...prev,
      ...parsed.map((p) => ({
        id: uuidv4(),
        description: p.description,
        qty: String(Math.max(1, Math.floor(p.qty))),
      })),
    ]);
    setPartsPaste("");
  }

  function resetForm() {
    setJobName("");
    setNotes("");
    setLabor("");
    setUrgency("medium");
    setHeaderNotes("");
    setRows([{ id: uuidv4(), description: "", qty: "1" }]);
    setPartsPaste("");
    setErr(null);
    lineIntentRef.current = null;
  }

  async function createManualLine(body: ManualLineCreateBody): Promise<string> {
    const response = await fetch(
      `/api/work-orders/${encodeURIComponent(workOrderId)}/lines`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": body.lineId,
        },
        body: JSON.stringify(body),
      },
    );

    const raw = await response.text();
    const result = (() => {
      try {
        return raw
          ? (JSON.parse(raw) as {
              lineId?: string;
              error?: string;
              correlationId?: string;
            })
          : null;
      } catch {
        return null;
      }
    })();

    if (!response.ok || result?.lineId !== body.lineId) {
      const reference = result?.correlationId
        ? ` Reference: ${result.correlationId}.`
        : "";
      throw new Error(
        `${result?.error || "Unable to add the work-order line."}${reference}`,
      );
    }

    return body.lineId;
  }

  async function createPartsRequest(
    body: PartRequestCreateBody,
  ): Promise<string> {
    const res = await fetch("/api/parts/requests/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    let json: { requestId?: string; error?: string } | null = null;
    try {
      json = raw
        ? (JSON.parse(raw) as { requestId?: string; error?: string })
        : null;
    } catch {
      /* ignore */
    }

    if (!res.ok || !json?.requestId) {
      const msg =
        json?.error || raw || `Request failed with status ${res.status}`;
      throw new Error(msg);
    }

    return json.requestId;
  }

  const handleSubmit = async () => {
    if (submissionInFlightRef.current) return;
    if (!jobName.trim()) {
      setErr("Job name is required.");
      return;
    }

    submissionInFlightRef.current = true;
    setSubmitting(true);
    setErr(null);

    try {
      const laborNum = asNumber(labor);
      const laborHours = laborNum ?? 0;
      const hasParts = validItems.length > 0;
      const fingerprint = JSON.stringify({
        jobName: jobName.trim(),
        notes: notes.trim(),
        laborHours,
        parts: validItems,
        urgency,
      });
      if (lineIntentRef.current?.fingerprint !== fingerprint) {
        lineIntentRef.current = { fingerprint, lineId: uuidv4() };
      }
      const lineId = lineIntentRef.current.lineId;

      await createManualLine({
        lineId,
        jobName,
        notes,
        laborHours,
        parts: validItems,
        urgency,
      });

      // This intentionally remains a separate follow-up. Preserve the existing
      // partial-success behavior; line idempotency does not make it atomic and
      // a failed parts request is not retried automatically here.
      if (hasParts) {
        try {
          await createPartsRequest({
            workOrderId,
            jobId: lineId,
            items: validItems,
            notes: safeTrim(headerNotes) || safeTrim(notes) || null,
          });

          toast.success("Job added + parts request sent.");
        } catch (e: unknown) {
          toast.error(
            `Job added, but parts request failed: ${
              e instanceof Error ? e.message : "Unknown error"
            }`,
          );
        }
      } else {
        toast.success("Job added.");
      }

      onJobAdded?.();
      onClose();
      resetForm();
    } catch (e: unknown) {
      setErr(errorMessage(e) || "Failed to add job.");
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={() => {
        onClose();
        setErr(null);
      }}
      title="Add New Job Line"
      onSubmit={handleSubmit}
      submitText={submitting ? "Adding…" : "Add Job"}
      busy={submitting}
      size="lg"
    >
      <div className="space-y-4">
        {/* Job fields */}
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Job name
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="e.g. Replace tie rod end RH"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Notes / correction
          </label>
          <textarea
            rows={3}
            className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="Optional notes, concerns, or correction details…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Labor hours
            </label>
            <input
              type="number"
              step="0.1"
              className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              placeholder="e.g. 1.5"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
              Urgency
            </label>
            <select
              className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as Urgency)}
            >
              <option value="low">Low urgency</option>
              <option value="medium">Medium urgency</option>
              <option value="high">High urgency</option>
            </select>
          </div>
        </div>

        {/* Note to parts */}
        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Note to parts (optional)
          </label>
          <textarea
            rows={2}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={headerNotes}
            onChange={(e) => setHeaderNotes(e.target.value)}
            placeholder="Anything they should know before filling this request…"
          />
        </div>

        {/* Items grid */}
        <div className="overflow-hidden rounded-2xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] shadow-[var(--theme-shadow-medium)]">
          <div className="grid grid-cols-12 bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] px-3 py-2 text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            <div className="col-span-8">Parts description</div>
            <div className="col-span-3 text-right">Qty</div>
            <div className="col-span-1 text-center"> </div>
          </div>

          <div className="max-h-64 overflow-auto bg-[color:var(--theme-surface-overlay)]">
            {rows.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-12 gap-2 border-t border-[color:var(--theme-border-soft)] px-3 py-2"
              >
                <input
                  className="col-span-8 rounded-md border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
                  value={r.description}
                  onChange={(e) =>
                    setCell(r.id, { description: e.target.value })
                  }
                  placeholder="e.g. rear pads, serp belt…"
                />

                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="col-span-3 rounded-md border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1 text-right text-sm text-[color:var(--theme-text-primary)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
                  value={r.qty}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^\d]/g, "");
                    setCell(r.id, { qty: next });
                  }}
                  onBlur={() => {
                    const n = Number.parseInt(r.qty, 10);
                    const normalized =
                      Number.isFinite(n) && n > 0 ? String(n) : "1";
                    setCell(r.id, { qty: normalized });
                  }}
                  aria-label="Quantity"
                />

                <div className="col-span-1 flex items-center justify-center">
                  <button
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] text-[0.7rem] text-[color:var(--theme-text-secondary)] transition hover:bg-red-500/20 hover:text-red-200 disabled:opacity-40 disabled:hover:bg-[color:var(--theme-surface-overlay)] disabled:hover:text-[color:var(--theme-text-secondary)]"
                    onClick={() => removeRow(r.id)}
                    disabled={rows.length <= 1}
                    title={
                      rows.length <= 1
                        ? "At least one row is required"
                        : "Remove row"
                    }
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2">
            <button
              className="inline-flex items-center gap-1 rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[0.7rem] font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)] transition hover:border-[var(--accent-copper-soft)] hover:bg-[var(--accent-copper-faint)] hover:text-[var(--accent-copper-soft)]"
              onClick={addRow}
              type="button"
            >
              <span>+</span>
              <span>Add item</span>
            </button>
          </div>
        </div>

        {/* Quick paste */}
        <div className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Quick paste
          </label>
          <textarea
            rows={2}
            className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="Paste: 2x tie rod end RH, cotter pin"
            value={partsPaste}
            onChange={(e) => setPartsPaste(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={importPaste}
              className="rounded-md border border-[var(--accent-copper-light)]/40 bg-[var(--accent-copper-light)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper-light)]/15"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => setPartsPaste("")}
              className="rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-inset)]"
            >
              Clear
            </button>
          </div>

          <p className="mt-2 text-[0.7rem] text-[color:var(--theme-text-muted)]">
            Only lines with a description and quantity &gt; 0 will be sent.
          </p>
        </div>

        {err && (
          <div className="rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-100">
            {err}
          </div>
        )}
      </div>
    </ModalShell>
  );
}
