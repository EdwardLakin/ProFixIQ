"use client";

import { useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

type WorkflowStatus =
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "assigned"
  | "unassigned";

type ApprovalPick = "approval:pending" | "approval:approved" | "approval:declined";
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

  // default to current workflow status
  const [value, setValue] = useState<PickerValue>(`status:${current}`);

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
      {/* Center the selector content */}
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="w-full text-center text-xs uppercase tracking-wide text-neutral-400">
          Workflow Status
        </div>
        <select
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white"
          value={value.startsWith("status:") ? (value as StatusPick) : `status:${current}`}
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

        <div className="mt-3 w-full text-center text-xs uppercase tracking-wide text-neutral-400">
          Approval State
        </div>
        <select
          className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white"
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
    </ModalShell>
  );
}