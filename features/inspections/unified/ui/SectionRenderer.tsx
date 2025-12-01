// features/inspections/unified/ui/SectionRenderer.tsx
"use client";

import React from "react";
import type {
  InspectionSection,
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

import CornerGrid from "@inspections/unified/ui/CornerGrid";
import AxleGrid from "@inspections/unified/ui/AxleGrid";
import SectionDisplay from "@inspections/unified/ui/SectionDisplay";

type UnitMode = "metric" | "imperial";

type Props = {
  sections: InspectionSection[];
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
  /** Passed from InspectionUnifiedScreen so the Units toggle actually does something */
  unitMode?: UnitMode;
};

// Steer / Drive / Trailer Left|Right ...
const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
// LF / RF / LR / RR ...
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
// Left Front / Right Rear ...
const HYD_FULL_RE =
  /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

function detectLayout(items: InspectionItem[]): "air" | "hyd" | "plain" {
  let airMatches = 0;
  let hydMatches = 0;

  for (const it of items) {
    const label = it.item ?? it.name ?? "";
    if (!label) continue;

    if (AIR_RE.test(label)) airMatches += 1;
    if (HYD_ABBR_RE.test(label) || HYD_FULL_RE.test(label)) hydMatches += 1;
  }

  if (airMatches > 0) return "air";
  if (hydMatches > 0) return "hyd";
  return "plain";
}

function hasFailOrRec(items: InspectionItem[] | undefined | null): boolean {
  if (!items?.length) return false;
  return items.some((it) => {
    const s = String(it.status ?? "").toLowerCase();
    return s === "fail" || s === "recommend";
  });
}

export default function SectionRenderer({
  sections,
  onUpdateItem,
  unitMode = "metric",
}: Props) {
  const handleBulkSetStatus = (
    sectionIndex: number,
    status: InspectionItemStatus,
  ) => {
    const section = sections[sectionIndex];
    if (!section?.items?.length) return;

    section.items.forEach((_, itemIndex) => {
      onUpdateItem(sectionIndex, itemIndex, { status });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section, sectionIndex) => {
        const items = section.items ?? [];
        const layout = detectLayout(items);

        // HYDRAULIC CORNER GRID (LF/RF/LR/RR + metrics)
        if (layout === "hyd") {
          return (
            <CornerGrid
              key={`${sectionIndex}-${section.title || "hyd"}`}
              sectionIndex={sectionIndex}
              items={items}
              unitMode={unitMode}
              showKpaHint={unitMode === "metric"}
              onUpdateItem={onUpdateItem}
            />
          );
        }

        // AIR / AXLE GRID (Steer / Drive / Trailer Left/Right + metrics)
        if (layout === "air") {
          return (
            <AxleGrid
              key={`${sectionIndex}-${section.title || "air"}`}
              sectionIndex={sectionIndex}
              items={items}
              unitMode={unitMode}
              showKpaHint={unitMode === "metric"}
              onUpdateItem={onUpdateItem}
            />
          );
        }

        // GENERIC “CARD” SECTION – with bulk status controls
        const sectionHasFailOrRec = hasFailOrRec(items);

        return (
          <div
            key={`${sectionIndex}-${section.title || "plain"}`}
            className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/40 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.9)] backdrop-blur-xl"
          >
            {/* Section header + ALL OK / FAIL / REC / NA */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-100">
                {section.title ?? `Section ${sectionIndex + 1}`}
              </h2>
              <div className="flex flex-wrap items-center gap-1 text-[10px]">
                <span className="mr-1 text-neutral-500">Mark all:</span>
                <button
                  type="button"
                  onClick={() => handleBulkSetStatus(sectionIndex, "ok")}
                  className="rounded-full border border-emerald-500/70 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-200 hover:bg-emerald-500/20"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkSetStatus(sectionIndex, "fail")}
                  className="rounded-full border border-red-500/70 bg-red-500/10 px-2 py-0.5 font-semibold text-red-200 hover:bg-red-500/20"
                >
                  FAIL
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleBulkSetStatus(sectionIndex, "recommend")
                  }
                  className="rounded-full border border-amber-400/70 bg-amber-400/10 px-2 py-0.5 font-semibold text-amber-200 hover:bg-amber-400/20"
                >
                  REC
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkSetStatus(sectionIndex, "na")}
                  className="rounded-full border border-slate-500/70 bg-slate-500/10 px-2 py-0.5 font-semibold text-slate-200 hover:bg-slate-500/20"
                >
                  NA
                </button>
              </div>
            </div>

            <SectionDisplay
              title={section.title ?? `Section ${sectionIndex + 1}`}
              section={section}
              sectionIndex={sectionIndex}
              // Only bother showing notes / photos UI if this section actually has FAIL or REC items.
              showNotes={sectionHasFailOrRec}
              showPhotos={sectionHasFailOrRec}
              onUpdateStatus={(
                secIdx: number,
                itemIdx: number,
                status: InspectionItemStatus,
              ) => onUpdateItem(secIdx, itemIdx, { status })}
              onUpdateNote={(
                secIdx: number,
                itemIdx: number,
                note: string,
              ) => onUpdateItem(secIdx, itemIdx, { notes: note })}
              onUpload={(
                photoUrl: string,
                secIdx: number,
                itemIdx: number,
              ) => {
                const item = sections[secIdx]?.items?.[itemIdx];
                const existing = (item?.photoUrls ?? []) as string[];
                onUpdateItem(secIdx, itemIdx, {
                  photoUrls: [...existing, photoUrl],
                });
              }}
            />
          </div>
        );
      })}
    </div>
  );
}