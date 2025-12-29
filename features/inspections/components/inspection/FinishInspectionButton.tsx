//features/inspections/components/inspection/FinishInspectionButton.tsx

"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";

type Props = {
  session: any;
  workOrderLineId?: string | null;
};

type Corr = { cause: string; correction: string };

function cleanText(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function isBadStatus(s: unknown): s is "fail" | "recommend" {
  const v = String(s ?? "").toLowerCase();
  return v === "fail" || v === "recommend";
}

function summarizeFromSections(session: any): {
  failed: string[];
  recommended: string[];
} {
  const sections: any[] = Array.isArray(session?.sections) ? session.sections : [];
  const failed: string[] = [];
  const recommended: string[] = [];

  for (const sec of sections) {
    const secTitle = cleanText(sec?.title);
    const items: any[] = Array.isArray(sec?.items) ? sec.items : [];

    for (const it of items) {
      if (!isBadStatus(it?.status)) continue;

      const label = cleanText(it?.item || it?.name || "Item");
      const note = cleanText(it?.notes);
      const line = note
        ? `${secTitle ? `${secTitle}: ` : ""}${label} — ${note}`
        : `${secTitle ? `${secTitle}: ` : ""}${label}`;

      if (it.status === "fail") failed.push(line);
      if (it.status === "recommend") recommended.push(line);
    }
  }

  return { failed, recommended };
}

function summarizeFromQuote(session: any): { failed: string[]; recommended: string[] } {
  const raw = session?.quote;
  const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const failed: string[] = [];
  const recommended: string[] = [];

  for (const q of items) {
    if (!isBadStatus(q?.status)) continue;

    const label = cleanText(q?.description || q?.item || q?.name || "Item");
    const note = cleanText(q?.notes);
    const line = note ? `${label} — ${note}` : label;

    if (q.status === "fail") failed.push(line);
    if (q.status === "recommend") recommended.push(line);
  }

  return { failed, recommended };
}

function buildCauseCorrection(session: any): Corr {
  // 1) Prefer true inspection data (sections/items)
  const fromSections = summarizeFromSections(session);
  const hasSectionsData =
    fromSections.failed.length > 0 || fromSections.recommended.length > 0;

  // 2) Fallback to quote lines if needed
  const fromQuote = hasSectionsData
    ? { failed: [], recommended: [] }
    : summarizeFromQuote(session);

  const failed = hasSectionsData ? fromSections.failed : fromQuote.failed;
  const recommended = hasSectionsData ? fromSections.recommended : fromQuote.recommended;

  if (failed.length === 0 && recommended.length === 0) {
    return {
      cause: "Inspection completed.",
      correction: "Inspection completed. No failed or recommended items were recorded.",
    };
  }

  // Keep it readable in WO line fields (don’t dump a novel)
  const limit = 8; // tweak as desired
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

  const handleFinish = async () => {
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

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Failed to finish inspection");

      // ✅ clear local draft so it doesn’t resurrect on refresh
      try {
        const inspectionId = String(session?.id || "");
        if (inspectionId && typeof window !== "undefined") {
          localStorage.removeItem(`inspection-${inspectionId}`);
        }
      } catch {}

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