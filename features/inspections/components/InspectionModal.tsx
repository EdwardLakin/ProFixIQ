"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation"; // ✅ NEW
import {
  InspectionSection,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import InspectionItemCard from "@/features/inspections/lib/inspection/InspectionItemCard";

interface SectionDisplayProps {
  title: string;
  section: InspectionSection;
  sectionIndex: number;
  showNotes: boolean;
  showPhotos: boolean;
  onUpdateStatus: (sectionIndex: number, itemIndex: number, status: InspectionItemStatus) => void;
  onUpdateNote: (sectionIndex: number, itemIndex: number, note: string) => void;
  onUpload: (photoUrl: string, sectionIndex: number, itemIndex: number) => void;
}

export default function SectionDisplay(_props: any) {
  const params = useSearchParams();
  const isEmbed = ["1","true","yes"].includes(
    (params.get("embed") || params.get("compact") || "").toLowerCase()
  );

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
    section.items.forEach((it) => {
      const s = (it.status ?? "unset") as keyof typeof counts;
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return { total, ...counts };
  }, [section.items]);

  const markAll = (status: InspectionItemStatus) => {
    section.items.forEach((_item, idx) => onUpdateStatus(sectionIndex, idx, status));
  };

  return (
    <div className="mx-0 mb-6 rounded-lg border border-zinc-800 bg-zinc-900">
      
      {/* 🆕 Hide header entirely when embedded */}
      {!isEmbed && title && (
        <div className="flex items-center justify-between p-3">
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-left text-lg font-header font-semibold text-orange-400"
            aria-expanded={open}
          >
            {title}
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-zinc-400 md:inline font-body">
              {stats.ok} OK · {stats.fail} FAIL · {stats.na} NA · {stats.recommend} REC · {stats.unset} —
            </span>

            <div className="flex items-center gap-1">
              {["ok","fail","na","recommend"].map(st => (
                <button
                  key={st}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs text-white hover:brightness-110"
                  onClick={() => markAll(st as InspectionItemStatus)}
                >
                  All {st.toUpperCase()}
                </button>
              ))}
              <button
                className="ml-2 rounded bg-zinc-800 px-2 py-1 text-xs text-white hover:bg-zinc-700"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      {open && (
        <div className={isEmbed ? "space-y-3 p-3" : "space-y-4 p-3"}>
          {section.items.map((item, itemIndex) => (
            <InspectionItemCard
              key={`${item.item}-${itemIndex}`}
              item={item}
              sectionIndex={sectionIndex}
              itemIndex={itemIndex}
              showNotes={showNotes}
              showPhotos={showPhotos}
              onUpdateStatus={onUpdateStatus}
              onUpdateNote={onUpdateNote}
              onUpload={onUpload}
            />
          ))}
        </div>
      )}
    </div>
  );
}