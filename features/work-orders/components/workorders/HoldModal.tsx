"use client";

import { useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

const HOLD_REASONS = [
  "Awaiting customer authorization",
  "Awaiting parts",
  "Waiting on vendor",
  "Need additional info",
  "Shop capacity",
];

export default function HoldModal(props: any) {
  const {
    isOpen,
    onClose,
    onApply,
    onRelease,
    canRelease = false,
    defaultReason = "Awaiting parts",
  } = props as {
    isOpen: boolean;
    onClose: () => void;
    onApply: (reason: string, notes?: string) => Promise<void> | void;
    onRelease?: () => Promise<void> | void;
    canRelease?: boolean;
    defaultReason?: string;
  };

  const [reason, setReason] = useState(defaultReason);
  const [notes, setNotes] = useState("");

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Place / Update Hold"
      size="sm"
      footerLeft={
        canRelease ? (
          <button
            className="font-blackops rounded border border-red-500 px-3 py-2 text-sm hover:border-orange-400"
            onClick={() => Promise.resolve(onRelease?.()).then(onClose)}
          >
            Release Hold
          </button>
        ) : null
      }
      onSubmit={async () => {
        await onApply(reason, notes);
        onClose();
      }}
      submitText="Apply Hold"
    >
      <p className="mb-3 text-sm text-neutral-400">Choose a reason and add optional notes</p>

      <label className="mb-1 block text-xs text-neutral-400">Reason</label>
      <select
        className="mb-3 w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      >
        {HOLD_REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs text-neutral-400">Notes</label>
      <textarea
        rows={3}
        className="w-full rounded border border-neutral-700 bg-neutral-800 p-2 text-sm"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes for the hold…"
      />
    </ModalShell>
  );
}