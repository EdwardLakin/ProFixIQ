"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import ModalShell from "@/features/shared/components/ModalShell";

const COLLECTED_BY_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "authorized_representative", label: "Authorized representative" },
  { value: "fleet_driver", label: "Fleet driver / dispatcher" },
] as const;

type CollectedByType = (typeof COLLECTED_BY_OPTIONS)[number]["value"];

export type MarkAsPickedUpResult = {
  workOrderId: string;
  pickedUpAt: string | null;
};

type MarkAsPickedUpModalProps = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  /** Display-only: the signed-in advisor confirming pickup. */
  employeeName?: string | null;
  /** Outstanding balance on the active invoice, if any. Drives the unpaid-release path. */
  outstandingBalance?: number | null;
  /**
   * work_orders.payment_status. A work order can be ready for pickup before
   * any invoice balance has even been computed (payment_status stays
   * 'unpaid' with no outstanding_balance row yet), so this - not just a
   * positive balance - is what should surface the unpaid-release path.
   */
  paymentStatus?: string | null;
  onPickedUp?: (result: MarkAsPickedUpResult) => void;
};

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MarkAsPickedUpModal({
  isOpen,
  onClose,
  workOrderId,
  employeeName,
  outstandingBalance,
  paymentStatus,
  onPickedUp,
}: MarkAsPickedUpModalProps) {
  const [collectedByType, setCollectedByType] =
    useState<CollectedByType>("customer");
  const [collectedByName, setCollectedByName] = useState("");
  const [notes, setNotes] = useState("");
  const [pickedUpAt, setPickedUpAt] = useState("");
  const [overrideUnpaid, setOverrideUnpaid] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const [busy, setBusy] = useState(false);

  const hasOutstandingBalance =
    (outstandingBalance ?? 0) > 0.01 || (paymentStatus ?? "unpaid") !== "paid";

  useEffect(() => {
    if (!isOpen) return;
    setCollectedByType("customer");
    setCollectedByName("");
    setNotes("");
    setPickedUpAt(toLocalDatetime(new Date()));
    setOverrideUnpaid(false);
    setReleaseReason("");
  }, [isOpen]);

  const handleSubmit = async () => {
    if (collectedByType !== "customer" && !collectedByName.trim()) {
      toast.error("Enter the name of the person collecting the vehicle.");
      return;
    }
    if (hasOutstandingBalance && !overrideUnpaid) {
      toast.error(
        "This invoice has an outstanding balance. Confirm the unpaid release below to continue.",
      );
      return;
    }
    if (hasOutstandingBalance && overrideUnpaid && !releaseReason.trim()) {
      toast.error("A reason is required to release an unpaid vehicle.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(
        `/api/work-orders/${encodeURIComponent(workOrderId)}/mark-picked-up`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectedByType,
            collectedByName: collectedByName.trim() || null,
            notes: notes.trim() || null,
            overrideUnpaid: hasOutstandingBalance ? overrideUnpaid : false,
            releaseReason: hasOutstandingBalance ? releaseReason.trim() : null,
            pickedUpAt: pickedUpAt
              ? new Date(pickedUpAt).toISOString()
              : null,
          }),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        toast.error(result?.error ?? "Could not confirm vehicle pickup.");
        return;
      }
      toast.success("Vehicle marked as picked up.");
      onPickedUp?.({
        workOrderId: result.workOrderId ?? workOrderId,
        pickedUpAt: result.pickedUpAt ?? null,
      });
      onClose();
    } catch {
      toast.error("Could not reach the server. Vehicle was not marked picked up.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="CONFIRM VEHICLE PICKUP"
      size="sm"
      busy={busy}
      onSubmit={handleSubmit}
      submitText="Mark as picked up"
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-copper-light)]">
            Vehicle handover
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Confirming pickup only records the handover. It never changes the
            invoice, payment records, or accounting status.
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Pickup date/time
          </label>
          <input
            type="datetime-local"
            value={pickedUpAt}
            onChange={(e) => setPickedUpAt(e.target.value)}
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Confirmed by
          </label>
          <div className="text-sm text-[color:var(--theme-text-primary)]">
            {employeeName?.trim() || "You (signed-in user)"}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Collected by
          </label>
          <select
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            value={collectedByType}
            onChange={(e) => setCollectedByType(e.target.value as CollectedByType)}
          >
            {COLLECTED_BY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {collectedByType !== "customer" ? (
          <div className="space-y-1">
            <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Collector name
            </label>
            <input
              type="text"
              value={collectedByName}
              onChange={(e) => setCollectedByName(e.target.value)}
              placeholder="Name of the person collecting the vehicle"
              className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
            />
          </div>
        ) : null}

        <div className="space-y-1">
          <label className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Pickup notes (optional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this handover…"
            className="w-full rounded-lg border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-[var(--accent-copper-soft)] focus:ring-2 focus:ring-[var(--accent-copper-soft)]/60"
          />
        </div>

        {hasOutstandingBalance ? (
          <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-3">
            <div className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
              Outstanding balance:{" "}
              {(outstandingBalance ?? 0).toLocaleString(undefined, {
                style: "currency",
                currency: "USD",
              })}
            </div>
            <label className="inline-flex items-center gap-2 text-[0.75rem] text-[color:var(--theme-text-primary)]">
              <input
                type="checkbox"
                checked={overrideUnpaid}
                onChange={(e) => setOverrideUnpaid(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-page)] text-[var(--accent-copper-soft)] focus:ring-[var(--accent-copper-soft)]"
              />
              Release the vehicle with this balance still outstanding
            </label>
            {overrideUnpaid ? (
              <textarea
                rows={2}
                value={releaseReason}
                onChange={(e) => setReleaseReason(e.target.value)}
                placeholder="Reason for releasing an unpaid vehicle (required)…"
                className="w-full rounded-lg border border-amber-500/40 bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/60"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
