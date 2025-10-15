"use client";

import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession; // ✅ serializable
};

export function SaveInspectionButton({ session }: Props) {
  const handleSave = async () => {
    try {
      await saveInspectionSession(session);
      alert("Inspection saved");
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save inspection.");
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