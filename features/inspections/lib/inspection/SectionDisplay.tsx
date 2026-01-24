// /features/inspections/lib/inspection/SectionDisplay.tsx
"use client";

import { useState, useMemo } from "react";
import type {
  InspectionSection,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import InspectionItemCard from "./InspectionItemCard";
import { Button } from "@shared/components/ui/Button";

interface SectionDisplayProps {
  title: string;
  section: InspectionSection;
  sectionIndex: number;
  showNotes: boolean;
  showPhotos: boolean;
  onUpdateStatus: (
    sectionIndex: number,
    itemIndex: number,
    status: InspectionItemStatus,
  ) => void;
  onUpdateNote: (sectionIndex: number, itemIndex: number, note: string) => void;
  onUpload: (photoUrl: string, sectionIndex: number, itemIndex: number) => void;

  requireNoteForAI?: boolean;
  onSubmitAI?: (sectionIndex: number, itemIndex: number) => void;
  isSubmittingAI?: (sectionIndex: number, itemIndex: number) => boolean;

  onUpdateParts?: (
    sectionIndex: number,
    itemIndex: number,
    parts: { description: string; qty: number }[],
  ) => void;

  onUpdateLaborHours?: (
    sectionIndex: number,
    itemIndex: number,
    hours: number | null,
  ) => void;

  /** Optional external collapse control (used by sticky header). */
  isCollapsed?: boolean;
  onToggleCollapse?: (sectionIndex: number) => void;
}

export default function SectionDisplay(props: SectionDisplayProps) {
  const {
    title,
    section,
    sectionIndex,
    showNotes = false,
    showPhotos = true,
    onUpdateStatus,
    onUpdateNote,
    onUpload,
    requireNoteForAI,
    onSubmitAI,
    isSubmittingAI,
    onUpdateParts,
    onUpdateLaborHours,
    isCollapsed,
    onToggleCollapse,
  } = props;

  // If parent passes isCollapsed, we become "controlled".
  const [internalOpen, setInternalOpen] = useState(true);
  const isControlled = typeof isCollapsed === "boolean";
  const open = isControlled ? !isCollapsed : internalOpen;

  const toggleOpen = () => {
    onToggleCollapse?.(sectionIndex);
    if (!isControlled) setInternalOpen((v) => !v);
  };

  const stats = useMemo(() => {
    const total = section.items.length || 0;
    const counts = { ok: 0, fail: 0, na: 0, recommend: 0, unset: 0 };
    for (const it of section.items) {
      const s = (it.status ?? "unset") as keyof typeof counts;
      if (counts[s] !== undefined) counts[s] += 1;
      else counts.unset += 1;
    }
    return { total, ...counts };
  }, [section.items]);

  const markAll = (status: InspectionItemStatus) => {
    section.items.forEach((_item, idx) =>
      onUpdateStatus(sectionIndex, idx, status),
    );
  };

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-card backdrop-blur-md md:px-5 md:py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <button
          onClick={toggleOpen}
          className="text-left text-lg font-semibold tracking-wide text-accent transition-colors hover:text-accent/80"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          aria-expanded={open}
          type="button"
        >
          {title}
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="hidden text-[11px] uppercase tracking-wide text-neutral-400 md:inline"
            style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
          >
            {stats.ok} OK · {stats.fail} FAIL · {stats.na} NA ·{" "}
            {stats.recommend} REC · {stats.unset} —
          </span>

          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => markAll("ok")}
              title="Mark all OK"
              type="button"
            >
              All OK
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => markAll("fail")}
              title="Mark all FAIL"
              type="button"
            >
              All FAIL
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => markAll("na")}
              title="Mark all NA"
              type="button"
            >
              All NA
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => markAll("recommend")}
              title="Mark all Recommend"
              type="button"
            >
              All REC
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="ml-1 h-7 px-2 text-[11px]"
              onClick={toggleOpen}
              aria-expanded={open}
              title={open ? "Collapse section" : "Expand section"}
              type="button"
            >
              {open ? "Collapse" : "Expand"}
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="pt-3">
          {/* One modern container + divider rows */}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 shadow-[0_12px_35px_rgba(0,0,0,0.55)]">
            {/* Inline header row (desktop) */}
            <div className="hidden border-b border-white/10 bg-black/25 px-3 py-2 md:block md:px-4">
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_320px_360px]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Item
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Checkboxes
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  Notes
                </div>
              </div>
            </div>

            <div className="divide-y divide-white/10">
              {section.items.map((item, itemIndex) => {
                const key =
                  (item.item ?? item.name ?? `item-${sectionIndex}-${itemIndex}`) +
                  `-${itemIndex}`;

                const status = String(item.status ?? "").toLowerCase();
                const isFail = status === "fail";
                const isRec = status === "recommend";
                const isFailOrRec = isFail || isRec;

                const note = (item.notes ?? "").trim();
                const canShowSubmit =
                  !!requireNoteForAI &&
                  isFailOrRec &&
                  note.length > 0 &&
                  typeof onSubmitAI === "function";

                const submitting =
                  isSubmittingAI?.(sectionIndex, itemIndex) ?? false;

                // Thin left rail for quick scanning
                const rail =
                  isFail
                    ? "before:bg-red-500/70"
                    : isRec
                      ? "before:bg-orange-500/70"
                      : "before:bg-white/0";

                return (
                  <div
                    key={key}
                    className={[
                      "relative px-3 py-3 md:px-4",
                      "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
                      rail,
                      "bg-black/20 hover:bg-white/[0.03] transition-colors",
                    ].join(" ")}
                  >
                    {/* Main row (inline: Item | Checkboxes | Notes) */}
                    <InspectionItemCard
                      item={item}
                      sectionIndex={sectionIndex}
                      itemIndex={itemIndex}
                      showNotes={showNotes}
                      showPhotos={showPhotos}
                      onUpdateStatus={onUpdateStatus}
                      onUpdateNote={onUpdateNote}
                      onUpload={onUpload}
                      variant="row"
                    />

                    {/* Parts + Labor, only for FAIL / REC items */}
                    {(() => {
                      if (!isFailOrRec) return null;

                      const currentParts = (item.parts ?? []) as {
                        description: string;
                        qty: number;
                      }[];
                      const currentLabor = item.laborHours ?? null;

                      const handlePartsChange = (
                        parts: { description: string; qty: number }[],
                      ) => {
                        onUpdateParts?.(sectionIndex, itemIndex, parts);
                      };

                      const handleLaborChange = (hours: number | null) => {
                        onUpdateLaborHours?.(sectionIndex, itemIndex, hours);
                      };

                      const addEmptyPart = () => {
                        handlePartsChange([
                          ...currentParts,
                          { description: "", qty: 1 },
                        ]);
                      };

                      const updatePart = (
                        idx: number,
                        patch: Partial<{ description: string; qty: number }>,
                      ) => {
                        const next = currentParts.map((p, i) =>
                          i === idx ? { ...p, ...patch } : p,
                        );
                        handlePartsChange(next);
                      };

                      const removePart = (idx: number) => {
                        const next = currentParts.filter((_, i) => i !== idx);
                        handlePartsChange(next);
                      };

                      return (
                        <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[12px] font-semibold text-neutral-100">
                              Parts &amp; Labor
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                              FAIL / REC only
                            </span>
                          </div>

                          {/* Parts list */}
                          <div className="space-y-2">
                            {currentParts.map((p, pIdx) => (
                              <div
                                key={pIdx}
                                className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-2"
                              >
                                <input
                                  className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                                  placeholder="Part description"
                                  value={p.description}
                                  onChange={(e) =>
                                    updatePart(pIdx, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  className="w-16 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                                  placeholder="Qty"
                                  type="number"
                                  min={1}
                                  value={Number.isFinite(p.qty) ? p.qty : ""}
                                  onChange={(e) =>
                                    updatePart(pIdx, {
                                      qty: Number(e.target.value) || 1,
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  className="text-[11px] text-red-300 hover:text-red-200"
                                  onClick={() => removePart(pIdx)}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={addEmptyPart}
                              className="mt-1 inline-flex items-center rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-accent/80 hover:text-accent"
                            >
                              + Add Part
                            </button>
                          </div>

                          {/* Labor */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-neutral-400">
                              Labor hours
                            </span>
                            <input
                              className="w-20 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60"
                              placeholder="0.0"
                              type="number"
                              min={0}
                              step={0.1}
                              value={currentLabor ?? ""}
                              onChange={(e) =>
                                handleLaborChange(
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value) || 0,
                                )
                              }
                            />
                            <span className="text-[10px] text-neutral-500">
                              (rate + pricing handled later)
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {canShowSubmit && (
                      <div className="mt-2 flex items-center justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-3"
                          disabled={submitting}
                          onClick={() => onSubmitAI!(sectionIndex, itemIndex)}
                        >
                          {submitting ? "Submitting…" : "Submit for estimate"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}