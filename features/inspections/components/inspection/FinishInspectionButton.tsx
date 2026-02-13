"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import type { InspectionSession, InspectionItemStatus } from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
  workOrderLineId?: string | null;
};

type Corr = { cause: string; correction: string };

type ItemLike = {
  item?: string | null;
  name?: string | null;
  status?: InspectionItemStatus | string | null;
  notes?: string | null;
};

type SectionLike = {
  title?: string | null;
  items?: ItemLike[] | null;
};

function cleanText(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function isBadStatus(s: unknown): s is "fail" | "recommend" {
  const v = String(s ?? "").toLowerCase();
  return v === "fail" || v === "recommend";
}

function summarizeFromSections(session: InspectionSession): {
  failed: string[];
  recommended: string[];
} {
  const sections: SectionLike[] = Array.isArray((session as unknown as { sections?: unknown }).sections)
    ? ((session as unknown as { sections: SectionLike[] }).sections ?? [])
    : [];

  const failed: string[] = [];
  const recommended: string[] = [];

  for (const sec of sections) {
    const secTitle = cleanText(sec?.title);
    const items: ItemLike[] = Array.isArray(sec?.items) ? (sec.items ?? []) : [];

    for (const it of items) {
      if (!isBadStatus(it?.status)) continue;

      const label = cleanText(it?.item || it?.name || "Item");
      const note = cleanText(it?.notes);
      const line = note
        ? `${secTitle ? `${secTitle}: ` : ""}${label} — ${note}`
        : `${secTitle ? `${secTitle}: ` : ""}${label}`;

      if (String(it.status).toLowerCase() === "fail") failed.push(line);
      if (String(it.status).toLowerCase() === "recommend") recommended.push(line);
    }
  }

  return { failed, recommended };
}

function buildCauseCorrection(session: InspectionSession): Corr {
  const fromSections = summarizeFromSections(session);
  const failed = fromSections.failed;
  const recommended = fromSections.recommended;

  if (failed.length === 0 && recommended.length === 0) {
    return {
      cause: "Inspection completed.",
      correction: "Inspection completed. No failed or recommended items were recorded.",
    };
  }

  const limit = 8;
  const parts: string[] = [];

  if (failed.length) {
    const slice = failed.slice(0, limit);
    const more = failed.length > limit ? ` (+${failed.length - limit} more)` : "";
    parts.push(`Failed: ${slice.join("; ")}${more}.`);
  }

  if (recommended.length) {
    const slice = recommended.slice(0, limit);
    const more = recommended.length > limit ? ` (+${recommended.length - limit} more)` : "";
    parts.push(`Recommended: ${slice.join("; ")}${more}.`);
  }

  return {
    cause: "Inspection found items requiring attention.",
    correction: parts.join(" "),
  };
}

export default function FinishInspectionButton({ session, workOrderLineId }: Props) {
  const [busy, setBusy] = useState(false);

  const payload = useMemo(() => buildCauseCorrection(session), [session]);

  const handleFinish = async (): Promise<void> => {
    if (!workOrderLineId) {
      toast.error("Missing work order line id — can’t finish.");
      return;
    }
    if (busy) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/work-orders/lines/${workOrderLineId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error || "Failed to finish inspection");

      // NOTE: finalize/pdf is separate (DB + storage). You can call it after finish.
      // (We keep finish route focused on completing the WO line.)

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:completed", {
            detail: {
              workOrderLineId,
              cause: payload.cause,
              correction: payload.correction,
            },
          }),
        );
      }

      toast.success("Inspection finished.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unable to finish inspection";
      toast.error(msg);
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
