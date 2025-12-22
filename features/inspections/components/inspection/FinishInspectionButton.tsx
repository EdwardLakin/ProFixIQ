// features/inspections/components/inspection/FinishInspectionButton.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";

type Props = {
  session: any;
  workOrderLineId?: string | null;
};

type ExtractedItem = {
  sectionTitle: string;
  label: string;
  status: "fail" | "recommend";
  notes?: string;
};

function cleanText(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function isFailStatus(v: unknown): boolean {
  const s = cleanText(v).toLowerCase();
  return s === "fail" || s === "failed";
}

function isRecommendStatus(v: unknown): boolean {
  const s = cleanText(v).toLowerCase();
  return s === "recommend" || s === "recommended" || s === "rec";
}

function extractFromSections(session: any): ExtractedItem[] {
  const sections: any[] = Array.isArray(session?.sections) ? session.sections : [];
  const out: ExtractedItem[] = [];

  for (const sec of sections) {
    const sectionTitle = cleanText(sec?.title) || "Section";
    const items: any[] = Array.isArray(sec?.items) ? sec.items : [];

    for (const it of items) {
      const statusRaw = it?.status;
      const label =
        cleanText(it?.item) ||
        cleanText(it?.name) ||
        cleanText(it?.description) ||
        "Item";
      const notes = cleanText(it?.notes);

      if (isFailStatus(statusRaw)) {
        out.push({ sectionTitle, label, status: "fail", notes: notes || undefined });
      } else if (isRecommendStatus(statusRaw)) {
        out.push({
          sectionTitle,
          label,
          status: "recommend",
          notes: notes || undefined,
        });
      }
    }
  }

  return out;
}

function extractFromQuote(session: any): ExtractedItem[] {
  const raw = session?.quote;
  const items: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: ExtractedItem[] = [];

  for (const q of items) {
    const status = cleanText(q?.status).toLowerCase();
    const label =
      cleanText(q?.description) || cleanText(q?.item) || cleanText(q?.name) || "Item";
    const notes = cleanText(q?.notes);
    const sectionTitle = cleanText(q?.section) || "Inspection";

    if (status === "fail" || status === "failed") {
      out.push({ sectionTitle, label, status: "fail", notes: notes || undefined });
    } else if (status === "recommend" || status === "recommended" || status === "rec") {
      out.push({
        sectionTitle,
        label,
        status: "recommend",
        notes: notes || undefined,
      });
    }
  }

  return out;
}

function buildCorrectionFromSession(session: any): { cause: string; correction: string } {
  // Prefer sections (ground truth). Fall back to quote if needed.
  const fromSections = extractFromSections(session);
  const fromQuote = extractFromQuote(session);

  // Merge + dedupe (section|label|status)
  const merged = [...fromSections, ...fromQuote];
  const seen = new Set<string>();
  const items: ExtractedItem[] = [];
  for (const it of merged) {
    const key = `${it.sectionTitle.toLowerCase()}|${it.label.toLowerCase()}|${it.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }

  const failed = items.filter((i) => i.status === "fail");
  const recommended = items.filter((i) => i.status === "recommend");

  if (failed.length === 0 && recommended.length === 0) {
    return {
      cause: "Inspection completed.",
      correction: "Inspection completed. No failed or recommended items were recorded.",
    };
  }

  const lines: string[] = [];

  if (failed.length) {
    lines.push("Failed items:");
    for (const f of failed) {
      lines.push(
        `• ${f.sectionTitle}: ${f.label}${f.notes ? ` — ${f.notes}` : ""}`,
      );
    }
  }

  if (recommended.length) {
    if (lines.length) lines.push(""); // spacer line
    lines.push("Recommended items:");
    for (const r of recommended) {
      lines.push(
        `• ${r.sectionTitle}: ${r.label}${r.notes ? ` — ${r.notes}` : ""}`,
      );
    }
  }

  return {
    cause: "Inspection found items requiring attention.",
    correction: lines.join("\n"),
  };
}

export default function FinishInspectionButton({ session, workOrderLineId }: Props) {
  const [busy, setBusy] = useState(false);

  const handleFinish = async () => {
    if (!workOrderLineId) {
      toast.error("Missing work order line id — can’t finish.");
      return;
    }
    if (busy) return;
    setBusy(true);

    const { cause, correction } = buildCorrectionFromSession(session);

    try {
      const res = await fetch(`/api/work-orders/lines/${workOrderLineId}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cause, correction }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || "Failed to finish inspection");
      }

      // ✅ Clear local draft so “continue” doesn’t resurrect a finished inspection
      try {
        const inspectionId = session?.id ? String(session.id) : null;
        if (inspectionId) localStorage.removeItem(`inspection-${inspectionId}`);
      } catch {
        // ignore
      }

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:completed", {
            detail: { workOrderLineId, cause, correction },
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