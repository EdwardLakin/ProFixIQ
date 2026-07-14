// /features/work-orders/components/StatusPickerModal.tsx
// ✅ FULL FILE REPLACEMENT
// - Removes "new"
// - Simplifies to WORK ORDER statuses (no approval picker in this modal)
// - Strict typing, no `any`

"use client";

import { useEffect, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

export type WorkOrderStatus =
  | "awaiting_approval"
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "planned"
  | "completed"
  | "ready_to_invoice"
  | "invoiced";

type StatusPick = `status:${WorkOrderStatus}`;

const WORK_ORDER_OPTIONS: WorkOrderStatus[] = [
  "awaiting_approval",
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "planned",
  "completed",
  "ready_to_invoice",
  "invoiced",
];

export default function StatusPickerModal(props: {
  isOpen: boolean;
  onClose: () => void;
  current?: WorkOrderStatus;
  onChange: (next: StatusPick) => Promise<void> | void;
}) {
  const { isOpen, onClose, current = "awaiting", onChange } = props;

  const [value, setValue] = useState<StatusPick>(`status:${current}`);

  useEffect(() => {
    if (isOpen) setValue(`status:${current}`);
  }, [isOpen, current]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Change Status"
      size="sm"
      onSubmit={async () => {
        await onChange(value);
        onClose();
      }}
      submitText="Apply"
    >
      <div className="flex flex-col gap-3">
        <div className="text-center text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
          Work order status
        </div>

        <select
          className="w-full rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
          value={value}
          onChange={(e) => setValue(e.target.value as StatusPick)}
        >
          {WORK_ORDER_OPTIONS.map((s) => {
            const v: StatusPick = `status:${s}`;
            return (
              <option key={v} value={v}>
                {s.replaceAll("_", " ")}
              </option>
            );
          })}
        </select>

        <p className="text-center text-[11px] text-[color:var(--theme-text-muted)]">
          This updates the <span className="font-semibold">work order</span> status
          (advisor/manager only).
        </p>
      </div>
    </ModalShell>
  );
}