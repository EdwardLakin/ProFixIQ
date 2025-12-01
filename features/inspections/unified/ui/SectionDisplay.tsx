// features/inspections/unified/ui/SectionDisplay.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
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

const STATUS_ORDER: InspectionItemStatus[] = [
  "ok",
  "fail",
  "recommend",
  "na",
];

// 🔁 adjust if your bucket is named differently
const INSPECTION_PHOTOS_BUCKET = "inspection-photos";

function statusLabel(status: InspectionItemStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "fail":
      return "FAIL";
    case "recommend":
      return "REC";
    case "na":
      return "NA";
    default:
      return String (status).toUpperCase();
  }
}

function statusClasses(
  status: InspectionItemStatus,
  active: boolean,
): string {
  const base =
    "h-7 px-2 text-[11px] rounded-full border px-2 py-0.5 transition-colors";

  if (status === "ok") {
    return (
      base +
      " " +
      (active
        ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
        : "border-emerald-500/60 bg-emerald-500/5 text-emerald-200 hover:bg-emerald-500/15")
    );
  }
  if (status === "fail") {
    return (
      base +
      " " +
      (active
        ? "border-red-400 bg-red-500/20 text-red-100"
        : "border-red-500/60 bg-red-500/5 text-red-200 hover:bg-red-500/15")
    );
  }
  if (status === "recommend") {
    return (
      base +
      " " +
      (active
        ? "border-amber-300 bg-amber-400/20 text-amber-100"
        : "border-amber-300/70 bg-amber-300/5 text-amber-200 hover:bg-amber-300/15")
    );
  }
  // NA – neutral, always last
  return (
    base +
    " " +
    (active
      ? "border-slate-300 bg-slate-500/25 text-slate-50"
      : "border-slate-500/60 bg-slate-500/5 text-slate-200 hover:bg-slate-500/15")
  );
}

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
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const supabase = useMemo(
    () => createClientComponentClient<Database>(),
    [],
  );

  const items = section.items ?? [];

  const stats = useMemo(() => {
    const total = items.length;
    const counts: Record<
      "ok" | "fail" | "na" | "recommend" | "unset",
      number
    > = { ok: 0, fail: 0, na: 0, recommend: 0, unset: 0 };

    for (const it of items) {
      const raw = (it.status ?? "unset").toString().toLowerCase();
      if (raw === "ok" || raw === "fail" || raw === "na" || raw === "recommend") {
        counts[raw as keyof typeof counts] += 1;
      } else {
        counts.unset += 1;
      }
    }

    return { total, ...counts };
  }, [items]);

  const markAll = (status: InspectionItemStatus) => {
    items.forEach((_item, itemIndex) =>
      onUpdateStatus(sectionIndex, itemIndex, status),
    );
  };

  // Single hidden input used per item (keyed by sectionIndex:itemIndex)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const triggerFilePicker = (key: string) => {
    const input = fileInputRefs.current[key];
    if (input) {
      input.click();
    }
  };

  const handleFileChange =
    (sIdx: number, iIdx: number, key: string) =>
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingKey(key);

      try {
        const ext = file.name.split(".").pop() || "jpg";
        const safeExt = ext.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
        const fileName = [
          "inspection",
          Date.now(),
          Math.random().toString(36).slice(2),
        ].join("_");

        const path = `${fileName}.${safeExt}`;

        const { data, error } = await supabase.storage
          .from(INSPECTION_PHOTOS_BUCKET)
          .upload(path, file, { upsert: false });

        if (error || !data?.path) {
          console.error("Inspection photo upload error:", error);
          window.alert("Failed to upload photo for this item.");
          return;
        }

        const { data: publicData } = supabase.storage
          .from(INSPECTION_PHOTOS_BUCKET)
          .getPublicUrl(data.path);

        const publicUrl = publicData?.publicUrl;
        if (!publicUrl) {
          window.alert("Uploaded photo but could not get URL.");
          return;
        }

        onUpload(publicUrl, sIdx, iIdx);
      } catch (err) {
        console.error("Inspection photo upload error:", err);
        window.alert("Failed to upload photo for this item.");
      } finally {
        setUploadingKey(null);
        // allow re-selecting same file again later if needed
        e.target.value = "";
      }
    };

  return (
    <div className="mb-6 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-br from-black/75 via-neutral-950/90 to-black px-4 py-3 shadow-[0_18px_42px_rgba(0,0,0,0.95)] backdrop-blur-xl md:px-5 md:py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-left text-lg font-semibold tracking-wide text-[color:var(--accent-copper-light,#fdba74)]"
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
            {STATUS_ORDER.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                type="button"
                className={statusClasses(s, false)}
                onClick={() => markAll(s)}
              >
                {s === "ok" && "All OK"}
                {s === "fail" && "All FAIL"}
                {s === "recommend" && "All REC"}
                {s === "na" && "All NA"}
              </Button>
            ))}

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
          {items.map((item, itemIndex) => {
            const keyBase =
              item.item ?? item.name ?? `item-${sectionIndex}-${itemIndex}`;

            const rawStatus = (item.status ?? "").toString().toLowerCase();
            const status = (rawStatus || "na") as InspectionItemStatus;
            const note = (item.notes ?? "").toString();
            const photoUrls = (item.photoUrls ?? []) as string[];
            const isFailOrRec =
              status === "fail" || status === "recommend";

            const itemKey = `${sectionIndex}:${itemIndex}`;

            return (
              <div
                key={`${keyBase}-${itemIndex}`}
                className="rounded-xl border border-white/8 bg-black/45 p-3 md:p-3.5"
              >
                {/* Top row: label + status buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 text-sm font-medium text-white">
                    {item.item ?? item.name ?? "Item"}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {STATUS_ORDER.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={statusClasses(
                          s,
                          status === s,
                        )}
                        onClick={() =>
                          onUpdateStatus(
                            sectionIndex,
                            itemIndex,
                            s as InspectionItemStatus,
                          )
                        }
                      >
                        {statusLabel(s as InspectionItemStatus)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Measurement + notes/photos */}
                <div className="mt-2 space-y-2 text-xs text-neutral-200">
                  {/* Value row always visible */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-neutral-400">Value:</span>
                    <span className={isFailOrRec ? "text-amber-200" : ""}>
                      {item.value ?? "—"}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  </div>

                  {/* Notes only when this item is FAIL / REC */}
                  {showNotes && isFailOrRec && (
                    <div className="space-y-1">
                      <div className="text-neutral-400">Notes</div>
                      <textarea
                        className="min-h-[60px] w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-[color:var(--accent-copper-soft,#fdba74)] focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#fdba74)]"
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

                  {/* Photos only when this item is FAIL / REC */}
                  {showPhotos && isFailOrRec && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-neutral-400">
                        <span>Photos ({photoUrls.length})</span>

                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={(el) => {
                              fileInputRefs.current[itemKey] = el;
                            }}
                            onChange={handleFileChange(
                              sectionIndex,
                              itemIndex,
                              itemKey,
                            )}
                          />

                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => triggerFilePicker(itemKey)}
                            disabled={uploadingKey === itemKey}
                          >
                            {uploadingKey === itemKey ? "Uploading…" : "+ Add"}
                          </Button>
                        </div>
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