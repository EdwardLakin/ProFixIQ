"use client";

import useInspectionSession from "@inspections/hooks/useInspectionSession";
import { saveInspectionSession } from "@inspections/lib/inspection/save";

export function SaveInspectionButton() {
  const { session } = useInspectionSession();

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
