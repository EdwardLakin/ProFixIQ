"use client";

import React from "react";
import type {
  InspectionSection,
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

import CornerGrid from "@inspections/unified/ui/CornerGrid";
import AxleGrid from "@inspections/unified/ui/AxleGrid";
import SectionDisplay from "@inspections/unified/SectionDisplay";

type Props = {
  sections: InspectionSection[];
  onUpdateItem: (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ) => void;
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

export default function SectionRenderer({ sections, onUpdateItem }: Props) {
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
              unitMode="imperial"
              showKpaHint={true}
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
              unitMode="imperial"
              showKpaHint={true}
              onUpdateItem={onUpdateItem}
            />
          );
        }

        // GENERIC “CARD” SECTION – unified theme, no legacy imports
        return (
          <SectionDisplay
            key={`${sectionIndex}-${section.title || "plain"}`}
            title={section.title ?? `Section ${sectionIndex + 1}`}
            section={section}
            sectionIndex={sectionIndex}
            showNotes
            showPhotos
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
        );
      })}
    </div>
  );
}
