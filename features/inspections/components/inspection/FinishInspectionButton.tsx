"use client";

import { useRouter } from "next/navigation";
import { Button } from "@shared/components/ui/Button";
import { saveInspectionSession } from "@inspections/lib/inspection/save";
import { generateInspectionSummary } from "@inspections/lib/inspection/generateInspectionSummary";
import type { InspectionSession } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession; // ✅ serializable
};

export default function FinishInspectionButton({ session }: Props) {
  const router = useRouter();

  const handleFinish = async () => {
    try {
      // Mark complete locally (no function prop needed)
      const finished: InspectionSession = {
        ...session,
        completed: true,
        isPaused: false,
        status: "completed",
        lastUpdated: new Date().toISOString(),
      };

      // Optional: still handy for preview/logs
      void generateInspectionSummary(finished);

      await saveInspectionSession(finished);

      // Persist local copy too (keeps summary page in sync if it reads local)
      try {
        localStorage.setItem(`inspection-${finished.id}`, JSON.stringify(finished));
      } catch {}

      router.push("/app/inspection/summary");
    } catch (error) {
      console.error("Failed to finish inspection:", error);
      alert("Failed to finish inspection. Please try again.");
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