// features/inspections/components/inspection/FinishInspectionButton.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@shared/components/ui/Button";
import { saveInspectionSession } from "@inspections/lib/inspection/save";
import type { InspectionSession } from "@inspections/lib/inspection/types";

/**
 * Build a concise "correction" summary from the session.
 * - Lists failed + recommended items grouped by section
 * - Appends freeform transcript if present
 */
function buildCorrection(session: InspectionSession): string {
  const lines: string[] = [];

  if (session.sections?.length) {
    for (const sec of session.sections) {
      const bad = (sec.items ?? []).filter(
        (i) => i.status === "fail" || i.status === "recommend"
      );
      if (bad.length === 0) continue;

      lines.push(`• ${sec.title}`);
      for (const it of bad) {
        const label = it.item ?? (it as any).name ?? "Item";
        const parts: string[] = [label];
        if (it.value) parts.push(`value: ${String(it.value)}`);
        if (it.unit) parts.push(`${String(it.unit)}`);
        if (it.notes) parts.push(`notes: ${it.notes}`);
        if (Array.isArray(it.recommend) && it.recommend.length > 0) {
          parts.push(`recommend: ${it.recommend.join(", ")}`);
        }
        const prefix = it.status === "fail" ? "  - FAIL:" : "  - RECOMMEND:";
        lines.push(`${prefix} ${parts.join(" • ")}`);
      }
    }
  }

  const transcript = (session.transcript || "").trim();
  if (transcript) {
    lines.push("");
    lines.push("Technician notes (transcript):");
    lines.push(transcript);
  }

  if (lines.length === 0) {
    return "Inspection completed. No failed or recommended items were recorded.";
  }
  return `Inspection summary:\n${lines.join("\n")}`;
}

/**
 * Optional "cause" text based on the first failed item encountered.
 */
function deriveCause(session: InspectionSession): string | undefined {
  for (const sec of session.sections ?? []) {
    for (const it of sec.items ?? []) {
      if (it.status === "fail") {
        const label = it.item ?? (it as any).name ?? "Item";
        const causeBits: string[] = [label];
        if (it.notes) causeBits.push(it.notes);
        return causeBits.join(" — ");
      }
    }
  }
  return undefined;
}

type Props = {
  session: InspectionSession;
  workOrderLineId: string; // REQUIRED
};

export default function FinishInspectionButton({ session, workOrderLineId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workOrderId = searchParams.get("workOrderId") || null; // optional, for redirect UX

  const handleFinish = async () => {
    try {
      if (!workOrderLineId) throw new Error("Missing workOrderLineId");

      // 1) Mark session finished locally
      const finished: InspectionSession = {
        ...session,
        completed: true,
        isPaused: false,
        status: "completed",
        lastUpdated: new Date().toISOString(),
      };

      // 2) Persist the final session blob (so you can reopen/resume later)
      await saveInspectionSession(finished, workOrderLineId);

      // 3) Build correction/cause payloads for the WO line
      const correction = buildCorrection(finished);
      const cause = deriveCause(finished);

      // 4) Call your existing finish route for the work order line
      const res = await fetch(`/api/work-orders/lines/${workOrderLineId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cause, correction }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Failed to finish line (${res.status})`);
      }

      // 5) Cache locally for offline reopen
      try {
        localStorage.setItem(`inspection-${finished.id}`, JSON.stringify(finished));
      } catch {}

      // 6) Navigate—prefer going back to WO if we know it
      if (workOrderId) {
        router.push(`/app/work-orders/${workOrderId}`);
      } else {
        // Fallback to your prior summary view
        router.push("/inspection/summary");
      }
    } catch (error: any) {
      // eslint-disable-next-line no-console
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