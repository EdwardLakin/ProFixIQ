"use client";

import { useMemo, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

const HOLD_REASONS = [
  "Awaiting customer authorization",
  "Awaiting parts",
  "Waiting on vendor",
  "Need additional info",
  "Shop capacity",
] as const;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApply: (reason: string, notes?: string) => Promise<void> | void;
  onRelease?: () => Promise<void> | void;
  defaultReason?: (typeof HOLD_REASONS)[number];
  canRelease?: boolean;
}

export default function HoldModal(props: any) {
  const {
    isOpen,
    onClose,
    onApply,
    onRelease,
    defaultReason = "Awaiting parts",
    canRelease = true,
  } = props as Props;

  const [reason, setReason] = useState<string>(defaultReason);
  const [notes, setNotes] = useState<string>("");

  const footerLeft = useMemo(() => {
    if (!canRelease || !onRelease) return null;
    return (
      <button
        type="button"
        onClick={onRelease}
        className="rounded border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
      >
        Remove Hold
      </button>
    );
  }, [canRelease, onRelease]);

  const submit = async () => {
    await onApply(reason, notes || undefined);
    onClose();
    setNotes("");
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Place / Update Hold"
      subtitle="Choose a reason and add optional notes"
      submitText="Apply Hold"
      size="sm"
      footerLeft={footerLeft}
    >
      <label className="block text-sm">
        <span className="mb-1 block text-neutral-400">Reason</span>
        <select
          className="w-full rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {HOLD_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-4 block text-sm">
        <span className="mb-1 block text-neutral-400">Notes</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800"
          placeholder="Optional notes for the hold…"
        />
      </label>
    </ModalShell>
  );
}