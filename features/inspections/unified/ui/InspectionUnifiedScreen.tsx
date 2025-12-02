"use client";

import React, { useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";

import type {
  InspectionSession,
  InspectionSection,
  InspectionItemStatus,
  QuoteLineItem,
  InspectionItem,
} from "@inspections/lib/inspection/types";

import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";
import { addWorkOrderLineFromSuggestion } from "@inspections/lib/inspection/addWorkOrderLine";

import SectionRenderer from "./SectionRenderer";
import InspectionHeader from "./InspectionHeader";
import InspectionSummary from "./InspectionSummary";
import VoiceInspectionController from "../voice/VoiceInspectionController";

// Simple helpers for progress + filtering
function countItems(sections: InspectionSection[]): {
  total: number;
  completed: number;
} {
  let total = 0;
  let completed = 0;
  for (const s of sections) {
    for (const it of s.items ?? []) {
      total += 1;
      const status = String(it.status ?? "").toLowerCase();
      if (
        status === "ok" ||
        status === "fail" ||
        status === "na" ||
        status === "recommend"
      ) {
        completed += 1;
      }
    }
  }
  return { total, completed };
}

type Props = {
  session: InspectionSession;
  onUpdateSession: (patch: Partial<InspectionSession>) => void;
};

export default function InspectionUnifiedScreen({
  session,
  onUpdateSession,
}: Props) {
  const [unitMode, setUnitMode] = useState<"metric" | "imperial">("metric");
  const [buildingQuote, setBuildingQuote] = useState(false);

  // Track in-flight AI requests by "secIdx:itemIdx"
  const inflightRef = useRef<Set<string>>(new Set());

  const { total, completed } = useMemo(
    () => countItems(session.sections ?? []),
    [session.sections],
  );

  const workOrderId = session.workOrderId ?? undefined;
  const hasSections = (session.sections?.length ?? 0) > 0;

  // --- low-level helpers ----------------------------------------------------

  const updateSections = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionSection["items"][number]>,
  ) => {
    const currentSections = session.sections ?? [];
    if (!currentSections[sectionIndex]) return;

    const nextSections = [...currentSections];
    const items = [...(nextSections[sectionIndex].items ?? [])];
    if (!items[itemIndex]) return;

    items[itemIndex] = { ...items[itemIndex], ...patch };
    nextSections[sectionIndex] = {
      ...nextSections[sectionIndex],
      items,
    };

    onUpdateSession({ sections: nextSections });
  };

  const replaceSectionItems = (
    sectionIndex: number,
    items: InspectionItem[],
  ) => {
    const currentSections = session.sections ?? [];
    if (!currentSections[sectionIndex]) return;

    const nextSections = [...currentSections];
    nextSections[sectionIndex] = {
      ...nextSections[sectionIndex],
      items,
    };

    onUpdateSession({ sections: nextSections });
  };

  const updateQuoteLine = (id: string, patch: Partial<QuoteLineItem>) => {
    const existing = (session.quote ?? []) as QuoteLineItem[];
    const next = existing.map((line) =>
      line.id === id ? { ...line, ...patch } : line,
    );
    onUpdateSession({ quote: next });
  };

  const pushQuoteLine = (line: QuoteLineItem) => {
    const existing = (session.quote ?? []) as QuoteLineItem[];
    onUpdateSession({ quote: [...existing, line] });
  };

  // --- AI quote + work-order + parts request -------------------------------

  const buildQuoteForItem = async (
    sectionIndex: number,
    itemIndex: number,
  ): Promise<void> => {
    const key = `${sectionIndex}:${itemIndex}`;
    if (inflightRef.current.has(key)) return;

    const section = session.sections?.[sectionIndex];
    const it = section?.items?.[itemIndex];
    if (!section || !it) return;

    const status = String(it.status ?? "").toLowerCase() as InspectionItemStatus;
    const note = (it.notes ?? "").trim();
    if (!(status === "fail" || status === "recommend")) return;
    if (!note) {
      toast.error("Add a note before submitting this item for estimate.");
      return;
    }

    inflightRef.current.add(key);

    const description =
      it.item ?? it.name ?? section.title ?? "Inspection item";

    const id = uuidv4();
    const placeholder: QuoteLineItem = {
      id,
      description,
      item: description,
      name: description,
      inspectionItem: description,
      status,
      notes: it.notes ?? "",
      price: 0,
      laborHours: 0.5,
      laborRate: 0,
      editable: true,
      source: "inspection",
      value: it.value ?? null,
      photoUrls: it.photoUrls ?? [],
      aiState: "loading",
    };

    pushQuoteLine(placeholder);

    try {
      const tId = toast.loading("Getting AI estimate…");

      const suggestion = await requestQuoteSuggestion({
        item: description,
        notes: it.notes ?? "",
        section: section.title,
        status,
        value: it.value != null ? String(it.value) : undefined,
        unit: it.unit ?? undefined,
        vehicle: session.vehicle ?? undefined,
      });

      if (!suggestion) {
        updateQuoteLine(id, { aiState: "error" });
        toast.error("No AI suggestion available.", { id: tId });
        return;
      }

      const partsTotal =
        suggestion.parts?.reduce((sum, p) => sum + (p.cost || 0), 0) ?? 0;
      const laborRate = suggestion.laborRate ?? 0;
      const laborHours = suggestion.laborHours ?? 0.5;
      const price = Math.max(0, partsTotal + laborRate * laborHours);

      updateQuoteLine(id, {
        price,
        laborHours,
        laborRate,
        ai: {
          summary: suggestion.summary,
          confidence: suggestion.confidence,
          parts: suggestion.parts ?? [],
        },
        aiState: "done",
      });

      let jobId: string | undefined;

      // Create a work-order line if we know the work order id
      if (workOrderId) {
        const res = await addWorkOrderLineFromSuggestion({
          workOrderId,
          description,
          section: section.title,
          status,
          suggestion,
          source: "inspection",
          jobType: "inspection",
        });

        jobId = res.id;
      }

      // Also send a parts request if we have both work order + job id
      if (workOrderId && jobId && suggestion.parts?.length) {
        try {
          const items = suggestion.parts.map((p) => ({
            description: p.name || "Part",
            qty: p.qty && p.qty > 0 ? p.qty : 1,
          }));

          const res = await fetch("/api/parts/requests/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workOrderId,
              jobId,
              notes: suggestion.summary || undefined,
              items,
            }),
          });

          const raw = await res.text();
          let json: { requestId?: string; error?: string } | null = null;
          try {
            json = raw ? (JSON.parse(raw) as any) : null;
          } catch {
            /* ignore parse error; fall through */
          }

          if (!res.ok || !json?.requestId) {
            const msg = json?.error || raw || `status ${res.status}`;
            console.warn("Parts request failed:", msg);
          }
        } catch (err) {
          console.warn("Parts request error:", err);
        }
      }

      toast.success("Estimate generated.", { id: tId });
    } catch (err) {
      console.error("AI quote error:", err);
      updateQuoteLine(id, { aiState: "error" });
      toast.error("Couldn't generate estimate.");
    } finally {
      inflightRef.current.delete(key);
    }
  };

  const buildQuotesForAll = async () => {
    if (!session.sections?.length) return;
    if (buildingQuote) return;

    setBuildingQuote(true);

    try {
      for (let sIdx = 0; sIdx < session.sections.length; sIdx += 1) {
        const sec = session.sections[sIdx];
        for (let iIdx = 0; iIdx < (sec.items?.length ?? 0); iIdx += 1) {
          const it = sec.items[iIdx];
          const status = String(it.status ?? "").toLowerCase();
          if (
            (status === "fail" || status === "recommend") &&
            (it.notes ?? "").trim().length > 0
          ) {
            // eslint-disable-next-line no-await-in-loop
            await buildQuoteForItem(sIdx, iIdx);
          }
        }
      }
    } finally {
      setBuildingQuote(false);
    }
  };

  // --- high-level UI actions -----------------------------------------------

  const handleSave = () => {
    // Passing an empty patch still triggers persistence in the parent page
    onUpdateSession({});
    toast.success("Inspection progress saved.");
  };

  const handleFinish = () => {
    const patch: Partial<InspectionSession> = {
      status: "completed",
      completed: true,
      isPaused: false,
      isListening: false,
    };

    onUpdateSession(patch);

    // Notify host (FocusedJobModal / inspection modal) that this inspection is done
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:completed", {
            detail: {
              sessionId: session.id,
              workOrderId: session.workOrderId ?? null,
              templateId: session.templateId ?? null,
            },
          }),
        );
      }
    } catch {
      // non-fatal; just don’t crash UI
    }

    toast.success("Inspection marked as completed.");
  };

  // --------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4">
      {/* Top meta */}
      <div className="flex flex-col gap-3">
        <InspectionHeader session={session} />

        <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-3 py-2 text-xs text-neutral-300 shadow-[0_18px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Unified Inspection
              </span>
              {hasSections && (
                <span className="text-[11px] text-neutral-400">
                  {completed}/{total} items marked
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-neutral-500">
                Work order:{" "}
                <span className="font-mono text-neutral-200">
                  {session.workOrderId || "—"}
                </span>
              </span>
              <span className="hidden text-neutral-700 md:inline">•</span>
              <button
                type="button"
                className="rounded-full border border-white/15 bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-200 hover:border-[color:var(--accent-copper,#fb923c)] hover:text-[color:var(--accent-copper-light,#fed7aa)]"
                onClick={() =>
                  setUnitMode((m) => (m === "metric" ? "imperial" : "metric"))
                }
              >
                Units:{" "}
                {unitMode === "metric"
                  ? "Metric (mm / kPa)"
                  : "Imperial (in / psi)"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice controller (Start / stop voice, “Hey Techy”, etc.) */}
      <VoiceInspectionController
        session={session}
        onUpdateSession={onUpdateSession}
      />

      {/* Main sections (corner grids, axle grids, generic sections, etc.) */}
      <SectionRenderer
        sections={session.sections ?? []}
        onUpdateItem={updateSections}
        unitMode={unitMode}
        onReplaceSectionItems={replaceSectionItems}
      />

      {/* Quick summary card */}
      <InspectionSummary session={session} />

      {/* Footer actions – Save / Finish + AI add-line logic entry point */}
      <div className="mt-4 border-t border-[color:var(--metal-border-soft,#1f2937)] pt-3">
        <div className="flex flex-col gap-3 text-xs text-neutral-400 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={buildingQuote}
              onClick={buildQuotesForAll}
              className="inline-flex items-center gap-1 rounded-full border border-[color:var(--accent-copper,#f97316)]/70 bg-[color:var(--accent-copper-dark,#7c2d12)]/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-light,#fed7aa)] hover:bg-[color:var(--accent-copper,#f97316)]/35 disabled:opacity-50"
            >
              {buildingQuote
                ? "Building estimates…"
                : "Build estimates for FAIL / REC"}
            </button>
            {!workOrderId && (
              <span className="text-[11px] text-red-300">
                Work order id missing – new jobs & parts requests will not be
                created.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full border border-white/15 bg-black/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-200 hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:text-[color:var(--accent-copper-soft,#fdba74)]"
            >
              Save progress
            </button>
            <button
              type="button"
              onClick={handleFinish}
              className="rounded-full bg-[color:var(--accent-copper,#f97316)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-black hover:bg-[color:var(--accent-copper-light,#fed7aa)]"
            >
              Finish inspection
            </button>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-neutral-500 md:text-right">
          P = Pass &nbsp;•&nbsp; F = Fail &nbsp;•&nbsp; NA = Not applicable
          &nbsp;•&nbsp; REC = Recommend
        </div>
      </div>
    </div>
  );
}