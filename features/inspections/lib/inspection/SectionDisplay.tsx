"use client";

import type React from "react";
import { useState } from "react";
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

  /** ✅ required for photo uploads (InspectionItemCard + /api/inspections/photos/upload) */
  inspectionId: string;

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

type PartRow = { description: string; qty: number };

type ItemExtended = InspectionSection["items"][number] & {
  // legacy shape support
  note?: string;
  // estimate meta
  estimateSubmitted?: boolean;
  estimateSubmittedAt?: string | null;
  // parts + labor
  parts?: PartRow[];
  laborHours?: number | null;
};

const COPPER = "var(--pfq-copper,#C57A4A)";

function isGridSection(title: string): boolean {
  const t = (title || "").toLowerCase();
  return (
    t.includes("corner grid") ||
    t.includes("tire grid") ||
    t.includes("battery grid")
  );
}

function getNote(item: ItemExtended): string {
  const raw = item.notes ?? item.note ?? "";
  return typeof raw === "string" ? raw : String(raw ?? "");
}

function getParts(item: ItemExtended): PartRow[] {
  const v = item.parts;
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => ({
      description: typeof p?.description === "string" ? p.description : "",
      qty: typeof p?.qty === "number" && Number.isFinite(p.qty) ? p.qty : 1,
    }))
    .filter((p) => p.description.length > 0 || p.qty >= 1);
}

function getLaborHours(item: ItemExtended): number | null {
  const v = item.laborHours;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isSubmittedItem(item: ItemExtended): boolean {
  return item.estimateSubmitted === true;
}

function submittedAt(item: ItemExtended): string | null {
  const raw = item.estimateSubmittedAt;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

export default function SectionDisplay(props: SectionDisplayProps) {
  const {
    title,
    section,
    sectionIndex,
    showNotes = false,
    showPhotos = true,
    inspectionId,
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

  const items = (section.items ?? []) as ItemExtended[];

  // ✅ never rely on callers passing title correctly (you had title="" before)
  const resolvedTitle = (title || section.title || "").trim();
  const gridSection = isGridSection(resolvedTitle);

  // For grid sections, grids manage their own collapse internally.
  const [internalOpen, setInternalOpen] = useState(true);
  const isControlled = typeof isCollapsed === "boolean";
  const open = gridSection ? true : isControlled ? !isCollapsed : internalOpen;

  const toggleOpen = () => {
    if (gridSection) return;
    onToggleCollapse?.(sectionIndex);
    if (!isControlled) setInternalOpen((v) => !v);
  };

  /**
   * ✅ FIX: derive stats every render (NO memo).
   * Your updates can mutate items in-place (same array ref),
   * which makes memo-by-ref stale.
   */
  const total = items.length || 0;
  const counts = { ok: 0, fail: 0, na: 0, recommend: 0, unset: 0 };

  for (const it of items) {
    const raw = String(it.status ?? "").toLowerCase();
    const normalized: keyof typeof counts =
      raw === "ok" || raw === "fail" || raw === "na" || raw === "recommend"
        ? (raw as keyof typeof counts)
        : raw === "pass"
          ? "ok"
          : "unset";
    counts[normalized] += 1;
  }

  const stats = { total, ...counts };

  const markAll = (status: InspectionItemStatus) => {
    items.forEach((_item, idx) => onUpdateStatus(sectionIndex, idx, status));
  };

  const showBulkButtons = !gridSection;

  const canEditPartsLabor =
    typeof onUpdateParts === "function" ||
    typeof onUpdateLaborHours === "function";

  // ✅ per-item UI state: collapse + edit
  const [partsOpenByKey, setPartsOpenByKey] = useState<Record<string, boolean>>(
    {},
  );
  const [editByKey, setEditByKey] = useState<Record<string, boolean>>({});

  const setPartsOpen = (k: string, v: boolean) =>
    setPartsOpenByKey((p) => ({ ...p, [k]: v }));
  const setEditing = (k: string, v: boolean) =>
    setEditByKey((p) => ({ ...p, [k]: v }));

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-card backdrop-blur-md md:px-5 md:py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        {gridSection ? (
          <div
            className="text-left text-lg font-semibold tracking-wide transition-opacity hover:opacity-80"
            style={{
              fontFamily: "Black Ops One, system-ui, sans-serif",
              color: COPPER,
            }}
          >
            {resolvedTitle}
          </div>
        ) : (
          <button
            onClick={toggleOpen}
            className="text-left text-lg font-semibold tracking-wide transition-opacity hover:opacity-80"
            style={{
              fontFamily: "Black Ops One, system-ui, sans-serif",
              color: COPPER,
            }}
            aria-expanded={open}
            type="button"
          >
            {resolvedTitle}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="hidden text-[11px] uppercase tracking-wide text-neutral-400 md:inline"
            style={{ fontFamily: "Roboto, system-ui, sans-serif" }}
          >
            {stats.ok} OK · {stats.fail} FAIL · {stats.na} NA · {stats.recommend}{" "}
            REC · {stats.unset} —
          </span>

          {showBulkButtons ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => markAll("ok")}
                type="button"
              >
                All OK
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => markAll("fail")}
                type="button"
              >
                All FAIL
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => markAll("na")}
                type="button"
              >
                All NA
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => markAll("recommend")}
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
                type="button"
              >
                {open ? "Collapse" : "Expand"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="pt-3">
          {/* Grid sections render their own UI elsewhere */}
          {gridSection ? (
            <div />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35 shadow-[0_12px_35px_rgba(0,0,0,0.55)]">
              {/* Desktop header row (table vibe) — desktop only */}
              <div className="hidden border-b border-white/10 bg-black/25 px-4 py-2 lg:block">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Item · Status · Notes
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                    Item · Status · Notes
                  </div>
                </div>
              </div>

              {/* Mobile/Tablet: 1 col. Desktop: 2-up on lg+ */}
              <div
                className={[
                  "grid gap-2 p-2",
                  "lg:grid-cols-2 lg:gap-[2px] lg:bg-white/10 lg:p-[2px]",
                  "[&>*]:rounded-lg",
                  "[&>*]:border [&>*]:border-white/10",
                  "[&>*]:bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.06),rgba(0,0,0,0.72))]",
                  "[&>*]:shadow-[0_12px_28px_rgba(0,0,0,0.60)]",
                  "[&>*]:backdrop-blur-md",
                  "[&>*]:relative [&>*]:overflow-hidden",
                  "[&>*]:before:absolute [&>*]:before:inset-x-0 [&>*]:before:top-0 [&>*]:before:h-[2px] [&>*]:before:content-['']",
                  "[&>*]:before:bg-[linear-gradient(90deg,transparent,rgba(197,122,74,0.85),transparent)]",
                  "[&>*]:transition [&>*]:duration-150",
                  "[&>*]:hover:-translate-y-[1px]",
                  "[&>*]:hover:border-[rgba(197,122,74,0.45)]",
                  "[&>*]:hover:shadow-[0_18px_38px_rgba(0,0,0,0.70)]",
                  "[&>*]:hover:bg-[radial-gradient(circle_at_top,_rgba(197,122,74,0.14),rgba(0,0,0,0.74))]",
                  "[&>*:nth-child(odd)]:brightness-[1.02]",
                  "[&>*:nth-child(even)]:brightness-[0.98]",
                  "lg:[&>*:nth-child(4n+1)]:brightness-[1.02] lg:[&>*:nth-child(4n+2)]:brightness-[1.02]",
                  "lg:[&>*:nth-child(4n+3)]:brightness-[0.98] lg:[&>*:nth-child(4n+4)]:brightness-[0.98]",
                ].join(" ")}
              >
                {items.map((item, itemIndex) => {
                  const keyBase =
                    (item.item ??
                      item.name ??
                      `item-${sectionIndex}-${itemIndex}`) + `-${itemIndex}`;

                  const status = String(item.status ?? "").toLowerCase();
                  const isFail = status === "fail";
                  const isRec = status === "recommend";
                  const isFailOrRec = isFail || isRec;

                  const note = getNote(item).trim();

                  const canShowSubmit =
                    !!requireNoteForAI &&
                    isFailOrRec &&
                    note.length > 0 &&
                    typeof onSubmitAI === "function";

                  const submitting =
                    isSubmittingAI?.(sectionIndex, itemIndex) ?? false;

                  const rail =
                    isFail
                      ? "before:bg-red-500/70"
                      : isRec
                        ? "before:bg-orange-500/70"
                        : "before:bg-white/0";

                  const submitted = isSubmittedItem(item);
                  const k = `${sectionIndex}:${itemIndex}`;
                  const isEditing = Boolean(editByKey[k]);

                  const partsOpen =
                    isEditing || (partsOpenByKey[k] ?? !submitted);

                  const lockInputs = submitted && !isEditing;

                  return (
                    <div
                      key={keyBase}
                      className={[
                        "relative px-3 py-3",
                        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:content-['']",
                        rail,
                        submitted ? "ring-1 ring-emerald-500/35" : "",
                      ].join(" ")}
                    >
                      <InspectionItemCard
                        item={{
                          ...item,
                          notes: getNote(item),
                        }}
                        sectionIndex={sectionIndex}
                        itemIndex={itemIndex}
                        showNotes={showNotes && isFailOrRec}
                        showPhotos={showPhotos}
                        inspectionId={inspectionId}
                        onUpdateStatus={onUpdateStatus}
                        onUpdateNote={onUpdateNote}
                        onUpload={onUpload}
                        variant="row"
                      />

                      {/* Parts + Labor UI (manual entry) */}
                      {(() => {
                        if (!isFailOrRec) return null;
                        if (!canEditPartsLabor) return null;

                        const currentParts = getParts(item);
                        const currentLabor = getLaborHours(item);

                        const handlePartsChange = (parts: PartRow[]) => {
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

                        const updatePart = (idx: number, patch: Partial<PartRow>) => {
                          const next = currentParts.map((p, i) =>
                            i === idx ? { ...p, ...patch } : p,
                          );
                          handlePartsChange(next);
                        };

                        const removePart = (idx: number) => {
                          const next = currentParts.filter((_, i) => i !== idx);
                          handlePartsChange(next);
                        };

                        const submittedStamp = submittedAt(item);

                        return (
                          <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-semibold text-neutral-100">
                                  Parts &amp; Labor
                                </span>

                                {submitted && (
                                  <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                                    Submitted
                                  </span>
                                )}

                                {submittedStamp && (
                                  <span className="text-[10px] text-neutral-500">
                                    {new Date(submittedStamp).toLocaleString()}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {submitted && (
                                  <>
                                    <button
                                      type="button"
                                      className="text-[10px] uppercase tracking-[0.16em] text-neutral-300 hover:text-neutral-100"
                                      onClick={() => setPartsOpen(k, !partsOpen)}
                                    >
                                      {partsOpen ? "Collapse" : "Expand"}
                                    </button>

                                    {!isEditing ? (
                                      <button
                                        type="button"
                                        className="text-[10px] uppercase tracking-[0.16em] text-emerald-200 hover:text-emerald-100"
                                        onClick={() => {
                                          setEditing(k, true);
                                          setPartsOpen(k, true);
                                        }}
                                      >
                                        Edit
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="text-[10px] uppercase tracking-[0.16em] text-neutral-300 hover:text-neutral-100"
                                        onClick={() => {
                                          setEditing(k, false);
                                          setPartsOpen(k, false);
                                        }}
                                      >
                                        Done
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {partsOpen && (
                              <>
                                <div className="space-y-2">
                                  {currentParts.map((p, pIdx) => (
                                    <div
                                      key={pIdx}
                                      className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-2"
                                    >
                                      <input
                                        disabled={lockInputs}
                                        className={[
                                          "min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500",
                                          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60",
                                          lockInputs ? "opacity-60 cursor-not-allowed" : "",
                                        ].join(" ")}
                                        placeholder="Part description"
                                        value={p.description}
                                        onChange={(e) =>
                                          updatePart(pIdx, { description: e.target.value })
                                        }
                                      />
                                      <input
                                        disabled={lockInputs}
                                        className={[
                                          "w-16 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500",
                                          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60",
                                          lockInputs ? "opacity-60 cursor-not-allowed" : "",
                                        ].join(" ")}
                                        placeholder="Qty"
                                        type="number"
                                        min={1}
                                        value={Number.isFinite(p.qty) ? p.qty : ""}
                                        onChange={(e) =>
                                          updatePart(pIdx, { qty: Number(e.target.value) || 1 })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className={[
                                          "text-[11px] text-red-300 hover:text-red-200",
                                          lockInputs ? "opacity-40 pointer-events-none" : "",
                                        ].join(" ")}
                                        onClick={() => removePart(pIdx)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}

                                  <button
                                    type="button"
                                    disabled={lockInputs}
                                    onClick={addEmptyPart}
                                    className={[
                                      "mt-1 inline-flex items-center rounded-full border border-white/20 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-100",
                                      "hover:border-accent/80 hover:text-accent",
                                      lockInputs
                                        ? "opacity-50 cursor-not-allowed hover:border-white/20 hover:text-neutral-100"
                                        : "",
                                    ].join(" ")}
                                  >
                                    + Add Part
                                  </button>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] text-neutral-400">
                                    Labor hours
                                  </span>
                                  <input
                                    disabled={lockInputs}
                                    className={[
                                      "w-20 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500",
                                      "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60",
                                      lockInputs ? "opacity-60 cursor-not-allowed" : "",
                                    ].join(" ")}
                                    placeholder="0.0"
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={currentLabor ?? ""}
                                    onChange={(e) =>
                                      handleLaborChange(
                                        e.target.value === "" ? null : Number(e.target.value) || 0,
                                      )
                                    }
                                  />
                                  <span className="text-[10px] text-neutral-500">
                                    (rate + pricing handled later)
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {canShowSubmit && (
                        <div className="mt-2 flex items-center justify-end gap-2">
                          {(() => {
                            if (!submitted) {
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="px-3"
                                  disabled={submitting}
                                  onClick={() => onSubmitAI(sectionIndex, itemIndex)}
                                >
                                  {submitting ? "Submitting…" : "Submit for estimate"}
                                </Button>
                              );
                            }

                            if (isEditing) {
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="px-3"
                                  disabled={submitting}
                                  onClick={() => onSubmitAI(sectionIndex, itemIndex)}
                                >
                                  {submitting ? "Updating…" : "Update estimate"}
                                </Button>
                              );
                            }

                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="px-3 opacity-70"
                                disabled
                              >
                                Submitted
                              </Button>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}