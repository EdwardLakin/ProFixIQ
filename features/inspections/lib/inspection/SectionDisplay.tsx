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

  /** require a note and show a Submit button for AI */
  requireNoteForAI?: boolean;
  /** handler to run AI + persist, invoked per item */
  onSubmitAI?: (sectionIndex: number, itemIndex: number) => void;
  /** let parent indicate a submit is in-flight for this item */
  isSubmittingAI?: (sectionIndex: number, itemIndex: number) => boolean;
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
  } = props;

  const [open, setOpen] = useState(true);

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
    <div className="mb-6 rounded-2xl border border-white/8 bg-black/30 px-4 py-3 shadow-card backdrop-blur-md md:px-5 md:py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
        {/* Title still toggles open/closed */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-left text-lg font-semibold tracking-wide text-orange-400"
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
              onClick={() => setOpen((v) => !v)}
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
                className="rounded-xl border border-white/5 bg-black/40 p-3 md:p-3.5"
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