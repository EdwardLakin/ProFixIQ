"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import type {
  InspectionSession,
  InspectionSection,
} from "@inspections/lib/inspection/types";

type Props = {
  session: InspectionSession;
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

type MinimalItem = {
  status?: unknown;
  item?: unknown;
  name?: unknown;
  notes?: unknown;
};

function summarizeFromSections(session: InspectionSession): {
  failed: string[];
  recommended: string[];
} {
  const sections: InspectionSection[] = Array.isArray(session.sections)
    ? session.sections
    : [];

  const failed: string[] = [];
  const recommended: string[] = [];

  for (const sec of sections) {
    const secTitle = cleanText(sec?.title);
    const items: unknown[] = Array.isArray(sec?.items) ? sec.items : [];

    for (const raw of items) {
      const it = (raw ?? {}) as MinimalItem;
      if (!isBadStatus(it.status)) continue;

      const label = cleanText(it.item ?? it.name ?? "Item");
      const note = cleanText(it.notes);
      const prefix = secTitle ? `${secTitle}: ` : "";
      const line = note ? `${prefix}${label} — ${note}` : `${prefix}${label}`;

      if (String(it.status).toLowerCase() === "fail") failed.push(line);
      if (String(it.status).toLowerCase() === "recommend") recommended.push(line);
    }
  }

  return { failed, recommended };
}

type MinimalQuoteItem = {
  status?: unknown;
  description?: unknown;
  item?: unknown;
  name?: unknown;
  notes?: unknown;
};

function summarizeFromQuote(session: InspectionSession): {
  failed: string[];
  recommended: string[];
} {
  const raw = (session as unknown as { quote?: unknown }).quote;
  const items: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const failed: string[] = [];
  const recommended: string[] = [];

  for (const qRaw of items) {
    const q = (qRaw ?? {}) as MinimalQuoteItem;
    if (!isBadStatus(q.status)) continue;

    const label = cleanText(q.description ?? q.item ?? q.name ?? "Item");
    const note = cleanText(q.notes);
    const line = note ? `${label} — ${note}` : label;

    if (String(q.status).toLowerCase() === "fail") failed.push(line);
    if (String(q.status).toLowerCase() === "recommend") recommended.push(line);
  }

  return { failed, recommended };
}

function buildCauseCorrection(session: InspectionSession): Corr {
  const fromSections = summarizeFromSections(session);
  const hasSectionsData =
    fromSections.failed.length > 0 || fromSections.recommended.length > 0;

  const fromQuote = hasSectionsData
    ? { failed: [], recommended: [] }
    : summarizeFromQuote(session);

  const failed = hasSectionsData ? fromSections.failed : fromQuote.failed;
  const recommended = hasSectionsData
    ? fromSections.recommended
    : fromQuote.recommended;

  if (failed.length === 0 && recommended.length === 0) {
    return {
      cause: "Inspection completed.",
      correction:
        "Inspection completed. No failed or recommended items were recorded.",
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
    const more =
      recommended.length > limit ? ` (+${recommended.length - limit} more)` : "";
    parts.push(`Recommended: ${slice.join("; ")}${more}.`);
  }

  return {
    cause: "Inspection found items requiring attention.",
    correction: parts.join(" "),
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    const msg = rec.error ?? rec.message;
    if (typeof msg === "string") return msg;
  }
  return "Unable to finish inspection";
}

export default function FinishInspectionButton({
  session,
  workOrderLineId,
}: Props): JSX.Element {
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

      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json && typeof json === "object"
            ? (json as Record<string, unknown>).error ??
              (json as Record<string, unknown>).message
            : null;
        throw new Error(typeof msg === "string" ? msg : "Failed to finish inspection");
      }

      // ✅ clear local draft so it doesn’t resurrect on refresh
      // NOTE: your screen uses `draftKey`, not `inspection-${id}`. This only clears legacy key.
      try {
        const inspectionId = String(session.id ?? "");
        if (inspectionId && typeof window !== "undefined") {
          localStorage.removeItem(`inspection-${inspectionId}`);
        }
      } catch {
        // ignore
      }

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
    } catch (err: unknown) {
      toast.error(errorMessage(err));
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