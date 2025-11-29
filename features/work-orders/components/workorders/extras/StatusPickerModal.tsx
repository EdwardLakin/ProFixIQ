"use client";

import { useEffect, useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

type WorkflowStatus =
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "assigned"
  | "unassigned";

type ApprovalPick =
  | "approval:pending"
  | "approval:approved"
  | "approval:declined";
type StatusPick = `status:${WorkflowStatus}`;
type PickerValue = StatusPick | ApprovalPick;

const WORKFLOW_OPTIONS: WorkflowStatus[] = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "completed",
  "assigned",
  "unassigned",
];

const APPROVAL_OPTIONS: ApprovalPick[] = [
  "approval:pending",
  "approval:approved",
  "approval:declined",
];

export default function StatusPickerModal(props: {
  isOpen: boolean;
  onClose: () => void;
  current?: WorkflowStatus;
  onChange: (next: PickerValue) => Promise<void> | void;
}) {
  const { isOpen, onClose, current = "awaiting", onChange } = props;

  const [value, setValue] = useState<PickerValue>(`status:${current}`);

  // Reset to current workflow status whenever the modal opens or current changes
  useEffect(() => {
    if (isOpen) {
      setValue(`status:${current}`);
    }
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
      <div className="flex flex-col gap-4">
        {/* Workflow */}
        <div className="space-y-2">
          <div className="text-center text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Workflow Status
          </div>
          <select
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            value={
              value.startsWith("status:")
                ? (value as StatusPick)
                : (`status:${current}` as StatusPick)
            }
            onChange={(e) => setValue(e.target.value as StatusPick)}
          >
            {WORKFLOW_OPTIONS.map((s) => {
              const v: StatusPick = `status:${s}`;
              return (
                <option key={v} value={v}>
                  {s.replaceAll("_", " ")}
                </option>
              );
            })}
          </select>
        </div>

        {/* Divider-ish helper */}
        <div className="text-center text-[10px] uppercase tracking-[0.18em] text-neutral-600">
          or adjust approval
        </div>

        {/* Approval */}
        <div className="space-y-2">
          <div className="text-center text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Approval State
          </div>
          <select
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            value={
              value.startsWith("approval:")
                ? (value as ApprovalPick)
                : ("approval:pending" as ApprovalPick)
            }
            onChange={(e) => setValue(e.target.value as ApprovalPick)}
          >
            {APPROVAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v.replace("approval:", "").replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
    </ModalShell>
  );
}