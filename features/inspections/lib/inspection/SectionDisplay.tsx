"use client";

import { useState, useMemo } from "react";
import {
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
  onUpdateNote: (
    sectionIndex: number,
    itemIndex: number,
    note: string,
  ) => void;
  onUpload: (
    photoUrl: string,
    sectionIndex: number,
    itemIndex: number,
  ) => void;

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
    if (!isControlled) {
      setInternalOpen((v) => !v);
    }
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
        {/* Title still toggles open/closed */}
        <button
          onClick={toggleOpen}
          className="text-left text-lg font-semibold tracking-wide text-accent transition-colors hover:text-accent/80"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          aria-expanded={open}
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

            {/* explicit collapse/expand control */}
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
        <div className="space-y-3 pt-3">
          {section.items.map((item, itemIndex) => {
            const key =
              (item.item ?? item.name ?? `item-${sectionIndex}-${itemIndex}`) +
              `-${itemIndex}`;

            const status = String(item.status ?? "").toLowerCase();
            const isFailOrRec = status === "fail" || status === "recommend";
            const note = (item.notes ?? "").trim();
            const canShowSubmit =
              !!requireNoteForAI &&
              isFailOrRec &&
              note.length > 0 &&
              typeof onSubmitAI === "function";

            const submitting =
              isSubmittingAI?.(sectionIndex, itemIndex) ?? false;

            return (
              <div
                key={key}
                className="rounded-xl border border-white/10 bg-black/50 p-3 shadow-sm md:p-3.5"
              >
                <InspectionItemCard
                  item={item}
                  sectionIndex={sectionIndex}
                  itemIndex={itemIndex}
                  showNotes={showNotes}
                  showPhotos={showPhotos}
                  onUpdateStatus={onUpdateStatus}
                  onUpdateNote={onUpdateNote}
                  onUpload={onUpload}
                />

                {/* 🔹 Parts + Labor, only for FAIL / REC items */}
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
                    patch: Partial<{
                      description: string;
                      qty: number;
                    }>,
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
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-neutral-200">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-neutral-100">
                          Parts &amp; Labor
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                          Only for FAIL / REC items
                        </span>
                      </div>

                      {/* Parts list */}
                      <div className="space-y-2">
                        {currentParts.map((p, pIdx) => (
                          <div
                            key={pIdx}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2 py-2"
                          >
                            <input
                              className="min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950/80 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-accent focus:ring-2 focus:ring-accent/70"
                              placeholder="Part description"
                              value={p.description}
                              onChange={(e) =>
                                updatePart(pIdx, {
                                  description: e.target.value,
                                })
                              }
                            />
                            <input
                              className="w-16 rounded-md border border-neutral-700 bg-neutral-950/80 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-accent focus:ring-2 focus:ring-accent/70"
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
                          className="mt-1 inline-flex items-center rounded-full border border-white/30 bg-black/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-accent/80 hover:text-accent"
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
                          className="w-20 rounded-md border border-neutral-700 bg-neutral-950/80 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500 focus:border-accent focus:ring-2 focus:ring-accent/70"
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
                  <div className="mt-3 flex items-center justify-end">
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
      )}
    </div>
  );
}