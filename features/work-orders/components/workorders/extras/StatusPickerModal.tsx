"use client";

import ModalShell from "@/features/shared/components/ModalShell";
import { useState } from "react";

type Status =
  | "awaiting"
  | "queued"
  | "in_progress"
  | "on_hold"
  | "awaiting_approval"
  | "completed"
  | "planned";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  current: Status;
  onChange: (next: Status) => void | Promise<void>;
}

const OPTIONS: Status[] = [
  "awaiting",
  "queued",
  "in_progress",
  "on_hold",
  "awaiting_approval",
  "completed",
  "planned",
];

export default function StatusPickerModal(props: any) {
  const { isOpen, onClose, current, onChange } = props as Props;
  const [value, setValue] = useState<Status>(current);

  const submit = async () => {
    // simple guard rails: don't jump completed -> in_progress without confirmation
    if (current === "completed" && value !== "completed") {
      const ok = confirm("Re-open this job?");
      if (!ok) return;
    }
    await onChange(value);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={submit}
      title="Change Status"
      submitText="Apply"
      size="sm"
    >
      <select
        className="w-full rounded border border-neutral-300 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800"
        value={value}
        onChange={(e) => setValue(e.target.value as Status)}
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