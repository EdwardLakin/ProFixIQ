"use client";

import { useState } from "react";
import ModalShell from "@/features/shared/components/ModalShell";

const OPTIONS = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "completed",
  "awaiting_approval",
  "planned",
];

export default function StatusPickerModal(props: any) {
  const { isOpen, onClose, current = "awaiting", onChange } = props as {
    isOpen: boolean;
    onClose: () => void;
    current?: string;
    onChange: (next: string) => Promise<void> | void;
  };

  const [value, setValue] = useState(current);

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
      <select
        className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm text-white"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        {OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </ModalShell>
  );
}