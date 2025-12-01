//features/inspections/unified/ui/SectionDisplay.tsx
"use client";

import React, { useMemo, useState } from "react";
import type {
  InspectionSection,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import { Button } from "@shared/components/ui/Button";

type SectionDisplayProps = {
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
};

export default function SectionDisplay({
  title,
  section,
  sectionIndex,
  showNotes,
  showPhotos,
  onUpdateStatus,
  onUpdateNote,
  onUpload,
}: SectionDisplayProps) {
  const [open, setOpen] = useState<boolean>(true);

  const stats = useMemo(() => {
    const total = section.items.length;
    const counts: Record<
      "ok" | "fail" | "na" | "recommend" | "unset",
      number
    > = { ok: 0, fail: 0, na: 0, recommend: 0, unset: 0 };

    for (const it of section.items) {
      const status = (it.status ?? "unset") as keyof typeof counts;
      if (status in counts) counts[status] += 1;
      else counts.unset += 1;
    }

    return { total, ...counts };
  }, [section.items]);

  const markAll = (status: InspectionItemStatus) => {
    section.items.forEach((_item, itemIndex) =>
      onUpdateStatus(sectionIndex, itemIndex, status),
    );
  };

  return (
    <div className="mb-6 rounded-2xl border border-white/8 bg-black/30 px-4 py-3 shadow-card backdrop-blur-md md:px-5 md:py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
        <button
          type="button"
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
              type="button"
              onClick={() => markAll("ok")}
            >
              All OK
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              type="button"
              onClick={() => markAll("fail")}
            >
              All FAIL
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              type="button"
              onClick={() => markAll("na")}
            >
              All NA
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              type="button"
              onClick={() => markAll("recommend")}
            >
              All REC
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="ml-1 h-7 px-2 text-[11px]"
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              title={open ? "Collapse section" : "Expand section"}
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
            const keyBase =
              item.item ?? item.name ?? `item-${sectionIndex}-${itemIndex}`;

            const status = (item.status ?? "").toString().toLowerCase();
            const note = (item.notes ?? "").toString();
            const photoUrls = (item.photoUrls ?? []) as string[];

            return (
              <div
                key={`${keyBase}-${itemIndex}`}
                className="rounded-xl border border-white/5 bg-black/40 p-3 md:p-3.5"
              >
                {/* Top row: label + status buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium text-white">
                    {item.item ?? item.name ?? "Item"}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {(["ok", "fail", "na", "recommend"] as const).map(
                      (s) => (
                        <Button
                          key={s}
                          type="button"
                          size="sm"
                          variant={
                            (status as InspectionItemStatus) === s
                              ? "orange"
                              : "outline"
                          }
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            onUpdateStatus(
                              sectionIndex,
                              itemIndex,
                              s as InspectionItemStatus,
                            )
                          }
                        >
                          {s.toUpperCase()}
                        </Button>
                      ),
                    )}
                  </div>
                </div>

                {/* Measurement + notes/photos */}
                <div className="mt-2 space-y-2 text-xs text-neutral-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-neutral-400">Value:</span>
                    <span>
                      {item.value ?? "—"}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  </div>

                  {showNotes && (
                    <div className="space-y-1">
                      <div className="text-neutral-400">Notes</div>
                      <textarea
                        className="min-h-[60px] w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400"
                        value={note}
                        onChange={(e) =>
                          onUpdateNote(
                            sectionIndex,
                            itemIndex,
                            e.currentTarget.value,
                          )
                        }
                      />
                    </div>
                  )}

                  {showPhotos && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-neutral-400">
                        <span>Photos ({photoUrls.length})</span>
                        {/* hook up to actual uploader later */}
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            const dummyUrl = window.prompt(
                              "Photo URL (stub for now)",
                            );
                            if (!dummyUrl) return;
                            onUpload(dummyUrl, sectionIndex, itemIndex);
                          }}
                        >
                          + Add
                        </Button>
                      </div>

                      {photoUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {photoUrls.map((url) => (
                            <div
                              key={url}
                              className="h-12 w-12 overflow-hidden rounded border border-white/10 bg-neutral-900"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt="Inspection"
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}