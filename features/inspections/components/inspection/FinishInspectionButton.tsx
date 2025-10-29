// features/inspections/components/inspection/FinishInspectionButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@shared/components/ui/Button";
import { saveInspectionSession } from "@inspections/lib/inspection/save";
import { generateInspectionSummary } from "@inspections/lib/inspection/generateInspectionSummary";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
  workOrderLineId: string; // NEW
};

export default function FinishInspectionButton({ session, workOrderLineId }: Props) {
  const router = useRouter();

  const handleFinish = async () => {
    try {
      const finished: InspectionSession = {
        ...session,
        completed: true,
        isPaused: false,
        status: "completed",
        lastUpdated: new Date().toISOString(),
      };

      void generateInspectionSummary(finished);

      if (!workOrderLineId) throw new Error("Missing workOrderLineId");
      await saveInspectionSession(finished, workOrderLineId);

      try {
        localStorage.setItem(`inspection-${finished.id}`, JSON.stringify(finished));
      } catch {}

      router.push("/app/inspection/summary");
    } catch (error: any) {
      console.error("Failed to finish inspection:", error);
      alert(error?.message || "Failed to finish inspection. Please try again.");
    }
  };

  return (
    <Button
      onClick={handleFinish}
      className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded"
    >
      Finish Inspection
    </Button>
  );
}