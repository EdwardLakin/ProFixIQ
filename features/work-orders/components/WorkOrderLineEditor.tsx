"use client";

import { useState, useEffect } from "react";

export type WorkOrderLine = {
  id?: string;
  complaint: string;
  cause?: string;
  correction?: string;
  labor_time?: number;
  status?: "unassigned" | "assigned" | "in_progress" | "on_hold" | "completed" | "awaiting";
  hold_reason?: "parts" | "authorization" | "diagnosis_pending" | "other" | "";
  tools?: string;
};

export type WorkOrderLineEditorProps = {
  line: WorkOrderLine;
  /** Rename per Next.js serializable-props rule */
  onUpdate$?: (line: WorkOrderLine) => void;
  onDelete$?: () => void;
};

export default function WorkOrderLineEditor({
  line,
  onUpdate$,
  onDelete$,
}: WorkOrderLineEditorProps) {
  const [localLine, setLocalLine] = useState<WorkOrderLine>(line);

  useEffect(() => {
    onUpdate$?.(localLine);
  }, [localLine, onUpdate$]);

  return (
    <div className="bg-white dark:bg-surface border rounded-lg p-4 mb-4 shadow-card">
      <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-100">Complaint</label>
      <input
        value={localLine.complaint}
        onChange={(e) => setLocalLine({ ...localLine, complaint: e.target.value })}
        className="w-full border rounded px-2 py-1 mb-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />

      <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-100">Cause</label>
      <input
        value={localLine.cause || ""}
        onChange={(e) => setLocalLine({ ...localLine, cause: e.target.value })}
        className="w-full border rounded px-2 py-1 mb-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />

      <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-100">Correction</label>
      <input
        value={localLine.correction || ""}
        onChange={(e) => setLocalLine({ ...localLine, correction: e.target.value })}
        className="w-full border rounded px-2 py-1 mb-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />

      <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-100">Labor Time (hrs)</label>
      <input
        type="number"
        value={localLine.labor_time ?? ""}
        onChange={(e) => {
          const num = e.target.value === "" ? undefined : Number(e.target.value);
          setLocalLine({ ...localLine, labor_time: Number.isFinite(num as number) ? (num as number) : undefined });
        }}
        className="w-full border rounded px-2 py-1 mb-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />

      <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-100">Status</label>
      <select
        value={localLine.status || "unassigned"}
        onChange={(e) => setLocalLine({ ...localLine, status: e.target.value as WorkOrderLine["status"] })}
        className="w-full border rounded px-2 py-1 mb-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      >
        <option value="unassigned">Unassigned</option>
        <option value="assigned">Assigned</option>
        <option value="awaiting">Awaiting</option>
        <option value="in_progress">In Progress</option>
        <option value="on_hold">On Hold</option>
        <option value="completed">Completed</option>
      </select>

      {localLine.status === "on_hold" && (
        <>
          <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-gray-100">Hold Reason</label>
          <select
            value={localLine.hold_reason || ""}
            onChange={(e) =>
              setLocalLine({ ...localLine, hold_reason: e.target.value as WorkOrderLine["hold_reason"] })
            }
            className="w-full border rounded px-2 py-1 mb-3 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">Select Reason</option>
            <option value="parts">Parts Hold</option>
            <option value="authorization">Awaiting Authorization</option>
            <option value="diagnosis_pending">Waiting Diagnosis</option>
            <option value="other">Other</option>
          </select>
        </>
      )}

      {onDelete$ && (
        <button onClick={onDelete$} className="mt-2 text-sm text-red-600 hover:underline">
          Delete Line
        </button>
      )}
    </div>
  );
}