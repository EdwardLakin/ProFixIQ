// features/inspections/components/inspection/FinishInspectionButton.tsx
"use client";

import React, { useState } from "react";
import { toast } from "sonner";

type Props = {
  // <- make it completely loose so pages can pass their InspectionSession
  session: any;
  workOrderLineId?: string | null;
};

export default function FinishInspectionButton({
  session,
  workOrderLineId,
}: Props) {
  const [busy, setBusy] = useState(false);

  // build a reasonable correction text from the session
  function buildCorrectionFromSession(s: any): {
    cause: string;
    correction: string;
  } {
    // your session sometimes has quote as a single object or an array,
    // so normalize to an array here.
    const raw = s?.quote;
    const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const failed = items.filter(
      (i) => (i?.status ?? "").toLowerCase() === "fail"
    );
    const recommended = items.filter(
      (i) => (i?.status ?? "").toLowerCase() === "recommend"
    );

    if (failed.length === 0 && recommended.length === 0) {
      return {
        cause: "Inspection completed.",
        correction:
          "Inspection completed. No failed or recommended items were recorded.",
      };
    }

    const parts: string[] = [];

    if (failed.length) {
      parts.push(
        `Failed items: ${failed
          .map((f) => f?.description || f?.notes || "Item")
          .join("; ")}.`
      );
    }

    if (recommended.length) {
      parts.push(
        `Recommended items: ${recommended
          .map((r) => r?.description || r?.notes || "Item")
          .join("; ")}.`
      );
    }

    return {
      cause: "Inspection found items requiring attention.",
      correction: parts.join(" "),
    };
  }

  const handleFinish = async () => {
    if (!workOrderLineId) {
      toast.error("Missing work order line id — can’t finish.");
      return;
    }
    if (busy) return;
    setBusy(true);

    const { cause, correction } = buildCorrectionFromSession(session);

    try {
      const res = await fetch(
        `/api/work-orders/lines/${workOrderLineId}/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cause, correction }),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to finish inspection");
      }

      // tell the WO page / focused-job modal to open & prefill
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:completed", {
            detail: {
              workOrderLineId,
              cause,
              correction,
            },
          })
        );
      }

      toast.success("Inspection finished.");
    } catch (e: any) {
      toast.error(e?.message ?? "Unable to finish inspection");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleFinish}
      disabled={busy}
      className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
      type="button"
    >
      {busy ? "Finishing…" : "Finish inspection"}
    </button>
  );
}