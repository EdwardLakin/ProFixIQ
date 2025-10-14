"use client";

import { useState, useMemo } from "react";
import {
  InspectionSection,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import InspectionItemCard from "./InspectionItemCard";

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
}

export default function SectionDisplay(_props: any) {
  const {
    title,
    section,
    sectionIndex,
    showNotes = false,
    showPhotos = true,
    onUpdateStatus,
    onUpdateNote,
    onUpload,
  } = _props as SectionDisplayProps;

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
    section.items.forEach((_item, idx) => onUpdateStatus(sectionIndex, idx, status));
  };

  return (
    <div className="mx-4 mb-6 rounded-lg border border-zinc-800 bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        {/* Title still toggles open/closed */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-left text-lg font-semibold text-orange-400"
          style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
          aria-expanded={open}
        >
          {title}
        </button>

        <div className="flex items-center gap-2">
          <span
            className="hidden text-xs text-zinc-400 md:inline"
            style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
          >
            {stats.ok} OK · {stats.fail} FAIL · {stats.na} NA · {stats.recommend} REC · {stats.unset} —
          </span>

          <div className="flex items-center gap-1">
            <button
              className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-green-600"
              onClick={() => markAll("ok")}
              title="Mark all OK"
            >
              All OK
            </button>
            <button
              className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-red-600"
              onClick={() => markAll("fail")}
              title="Mark all FAIL"
            >
              All FAIL
            </button>
            <button
              className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-yellow-600"
              onClick={() => markAll("na")}
              title="Mark all NA"
            >
              All NA
            </button>
            <button
              className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:bg-blue-600"
              onClick={() => markAll("recommend")}
              title="Mark all Recommend"
            >
              All REC
            </button>

            {/* NEW: explicit collapse/expand control on the right */}
            <button
              className="ml-2 rounded bg-zinc-800 px-2 py-1 text-xs text-white hover:bg-zinc-700"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              title={open ? "Collapse section" : "Expand section"}
            >
              {open ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="space-y-4 p-3">
          {section.items.map((item, itemIndex) => {
            const key =
              (item.item ?? item.name ?? `item-${sectionIndex}-${itemIndex}`) +
              `-${itemIndex}`;

            return (
              <InspectionItemCard
                key={key}
                item={item}
                sectionIndex={sectionIndex}
                itemIndex={itemIndex}
                showNotes={showNotes}
                showPhotos={showPhotos}
                onUpdateStatus={onUpdateStatus}
                onUpdateNote={onUpdateNote}
                onUpload={onUpload}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}