// /features/work-orders/components/workorders/PartsRequestModal.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import {
  getOfflineMutationScope,
  resolveOfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";
import {
  createOfflinePartsRequestDraft,
  getOfflinePartsRequestDraft,
  saveOfflinePartsRequestDraft,
  submitOfflinePartsRequestDraft,
} from "@/features/parts/offline/partsRequestDrafts";

type DB = Database;

type Item = { id: string; description: string; qty: string };

type Props = {
  isOpen: boolean;

  /** IDs used for API payload + lookups */
  workOrderId: string;
  jobId: string;

  /** optional prefilled note */
  requestNote?: string | null;

  closeEventName?: string;
  submittedEventName?: string;
};

type SubmittedDetail = {
  requestId: string;
  workOrderId: string;
  jobId: string;
};

type WorkOrderLite = Pick<
  DB["public"]["Tables"]["work_orders"]["Row"],
  "id" | "custom_id"
>;

type WorkOrderLineLite = Pick<
  DB["public"]["Tables"]["work_order_lines"]["Row"],
  "id" | "complaint" | "description"
>;

export default function PartsRequestModal({
  isOpen,
  workOrderId,
  jobId,
  requestNote = "",
  closeEventName = "parts-request:close",
  submittedEventName = "parts-request:submitted",
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [headerNotes, setHeaderNotes] = useState(requestNote ?? "");
  const [rows, setRows] = useState<Item[]>([
    { id: crypto.randomUUID(), description: "", qty: "1" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // ✅ header labels
  const [woLabel, setWoLabel] = useState<string>("");
  const [jobLabel, setJobLabel] = useState<string>("");

  useEffect(() => {
    if (!isOpen) return;

    setHeaderNotes(requestNote ?? "");
    setRows([{ id: crypto.randomUUID(), description: "", qty: "1" }]);

    setWoLabel("");
    setJobLabel("");

    (async () => {
      const scope = getOfflineMutationScope();
      const recovered = scope
        ? await getOfflinePartsRequestDraft({
            scope,
            workOrderId,
            workOrderLineId: jobId,
          })
        : null;
      if (recovered) {
        setHeaderNotes(recovered.notes);
        setRows(
          recovered.items.map((item) => ({
            id: item.tempId,
            description: item.description,
            qty: String(item.qty),
          })),
        );
      }
      // Work order custom id
      if (workOrderId) {
        const { data } = await supabase
          .from("work_orders")
          .select("id, custom_id")
          .eq("id", workOrderId)
          .maybeSingle();

        const wo = data as WorkOrderLite | null;
        setWoLabel(wo?.custom_id ?? workOrderId);
      }

      // Job line complaint/description
      if (jobId) {
        const { data } = await supabase
          .from("work_order_lines")
          .select("id, complaint, description")
          .eq("id", jobId)
          .maybeSingle();

        const line = data as WorkOrderLineLite | null;
        const label =
          (line?.complaint ?? "").trim() ||
          (line?.description ?? "").trim() ||
          jobId;

        setJobLabel(label);
      }
    })();
  }, [isOpen, requestNote, supabase, workOrderId, jobId]);

  const addRow = () =>
    setRows((r) => [
      ...r,
      { id: crypto.randomUUID(), description: "", qty: "1" },
    ]);

  const removeRow = (id: string) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r));

  const setCell = (id: string, patch: Partial<Item>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // ✅ parse qty safely (allows empty while editing)
  const validItems = rows
    .map((r) => {
      const description = r.description.trim();
      const n = Number.parseInt(r.qty, 10);
      const qty = Number.isFinite(n) ? n : 0;
      return { tempId: r.id, description, qty };
    })
    .filter((i) => i.description && i.qty > 0);

  const emit = (name: string, detail?: unknown) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(name, detail ? { detail } : undefined),
      );
    }
  };

  async function submit() {
    if (submitting) return;

    if (!workOrderId || !jobId) {
      toast.error("Missing work order or job id.");
      return;
    }

    if (validItems.length === 0) {
      toast.error("Add at least one line (description + qty).");
      return;
    }

    setSubmitting(true);

    try {
      const scope = await resolveOfflineMutationScope({
        workOrderId,
        workOrderLineId: jobId,
      });
      if (!scope)
        throw new Error("Offline user and shop scope is unavailable.");
      const existing = await getOfflinePartsRequestDraft({
        scope,
        workOrderId,
        workOrderLineId: jobId,
      });
      const base =
        existing ??
        createOfflinePartsRequestDraft({
          scope,
          workOrderId,
          workOrderLineId: jobId,
        });
      const draft = {
        ...base,
        notes: headerNotes,
        items: validItems.map((item) => ({
          tempId: item.tempId,
          description: item.description,
          qty: item.qty,
          partNumber: null,
          manufacturer: null,
        })),
        updatedAt: new Date().toISOString(),
      };
      await saveOfflinePartsRequestDraft(draft);
      const result = await submitOfflinePartsRequestDraft(draft);
      if (result.conflicted) {
        toast.error("Parts request needs review in Sync Center.");
        return;
      }
      if (result.queued) {
        toast.warning("Parts request saved on this device and queued.");
        emit(closeEventName);
        return;
      }

      toast.success("Parts request sent.");

      const detail: SubmittedDetail = {
        requestId: result.requestId ?? draft.operationKey,
        workOrderId,
        jobId,
      };

      emit(submittedEventName, detail);
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

  const woDisplay = woLabel || workOrderId;
  const jobDisplay = jobLabel || jobId;

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
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
            Parts request
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Send a clean request to parts without losing the work order and job
            context.
          </div>
        </div>

        {/* Header meta */}
        <div className="flex flex-col gap-2 text-[0.7rem] text-[color:var(--theme-text-secondary)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Work order
            </span>
            <span
              className="max-w-[60vw] truncate rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 font-mono text-[0.7rem] text-[color:var(--theme-text-primary)] sm:max-w-[340px]"
              title={woDisplay}
            >
              {woDisplay}
            </span>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Job
            </span>
            <span
              className="max-w-[60vw] truncate rounded-full border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-1 text-[0.75rem] font-medium text-[color:var(--theme-text-primary)] sm:max-w-[420px]"
              title={jobDisplay}
            >
              {jobDisplay}
            </span>
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
        <div className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] shadow-[var(--theme-shadow-medium)]">
          {/* Header row */}
          <div className="grid grid-cols-12 bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] px-3 py-2 text-[0.7rem] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            <div className="col-span-8">Description*</div>
            <div className="col-span-3 text-right">Qty*</div>
            <div className="col-span-1 text-center"> </div>
          </div>

          {/* Rows */}
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

                {/* ✅ FIX: allow clearing without snapping back to 1 */}
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="col-span-3 rounded-md border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-2 py-1 text-right text-sm text-[color:var(--theme-text-primary)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-1 focus:ring-[var(--accent-copper-soft)]/60"
                  value={r.qty}
                  onChange={(e) => {
                    // keep only digits, allow empty while editing
                    const next = e.target.value.replace(/[^\d]/g, "");
                    setCell(r.id, { qty: next });
                  }}
                  onBlur={() => {
                    // normalize on blur
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

          {/* Add row footer */}
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

        <p className="text-[0.7rem] text-[color:var(--theme-text-muted)]">
          Only lines with a description and quantity &gt; 0 will be sent.
        </p>
      </div>
    </ModalShell>
  );
}
