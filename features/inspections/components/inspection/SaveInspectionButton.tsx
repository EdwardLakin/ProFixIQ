// features/inspections/components/inspection/SaveInspectionButton.tsx
"use client";

import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
  workOrderLineId: string; // NEW
};

export function SaveInspectionButton({ session, workOrderLineId }: Props) {
  const handleSave = async () => {
    try {
      if (!workOrderLineId) throw new Error("Missing workOrderLineId");
      await saveInspectionSession(session, workOrderLineId);
      alert("Inspection saved");
    } catch (error: any) {
      console.error("Save error:", error);
      alert(error?.message || "Failed to save inspection.");
    }
  };

  return (
    <button
      onClick={handleSave}
      className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded"
    >
      Save Progress
    </button>
  );
}