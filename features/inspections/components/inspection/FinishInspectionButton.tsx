"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";

type Props = {
  session: any;
  workOrderLineId?: string | null;
};

export default function FinishInspectionButton({
  session,
  workOrderLineId,
}: Props) {
  const [busy, setBusy] = useState(false);

  function buildCorrectionFromSession(s: any): {
    cause: string;
    correction: string;
  } {
    const raw = s?.quote;
    const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const failed = items.filter(
      (i) => (i?.status ?? "").toLowerCase() === "fail",
    );
    const recommended = items.filter(
      (i) => (i?.status ?? "").toLowerCase() === "recommend",
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
          .join("; ")}.`,
      );
    }

    if (recommended.length) {
      parts.push(
        `Recommended items: ${recommended
          .map((r) => r?.description || r?.notes || "Item")
          .join("; ")}.`,
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
        },
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to finish inspection");
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:completed", {
            detail: {
              workOrderLineId,
              cause,
              correction,
            },
          }),
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
    <Button
      onClick={handleFinish}
      disabled={busy}
      variant="copper"
      size="sm"
      type="button"
      className="font-semibold tracking-[0.18em] uppercase text-[11px]"
      isLoading={busy}
    >
      {busy ? "Finishing…" : "Finish inspection"}
    </Button>
  );
}