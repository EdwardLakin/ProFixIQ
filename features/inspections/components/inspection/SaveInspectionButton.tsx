// features/inspections/components/inspection/SaveInspectionButton.tsx
"use client";

import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";
import { Button } from "@shared/components/ui/Button";

type Props = {
  session: InspectionSession;
  workOrderLineId: string;
};

export function SaveInspectionButton({ session, workOrderLineId }: Props) {
  const handleSave = async () => {
    try {
      if (!workOrderLineId) throw new Error("Missing workOrderLineId");
      await saveInspectionSession(session, workOrderLineId);
      // you can swap this to a toast later if you prefer
      alert("Inspection saved");
    } catch (error: any) {
      console.error("Save error:", error);
      alert(error?.message || "Failed to save inspection.");
    }
  };

  return (
    <Button
      onClick={handleSave}
      type="button"
      variant="outline"
      size="md"
      className="font-medium"
    >
      Save progress
    </Button>
  );
}