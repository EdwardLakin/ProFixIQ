//features/inspections/lib/inspection/SectionDisplay.tsx

"use client";

import type React from "react";
import { useState } from "react";
import type {
  InspectionSection,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";
import InspectionItemCard from "./InspectionItemCard";
import { Button } from "@shared/components/ui/Button";
import Card from "@/features/shared/components/ui/Card";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { pricingStatusClass, pricingStatusText } from "@/features/menu-repair-items/lib/pricingStatus";

interface SectionDisplayProps {
  title: string;
  section: InspectionSection;
  sectionIndex: number;
  showNotes: boolean;
  showPhotos: boolean;

  /** ✅ required for photo uploads (InspectionItemCard + /api/inspections/photos/upload) */
  inspectionId: string;
  workOrderId?: string | null;
  workOrderLineId?: string | null;

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

  smartMatchByKey?: Record<string, SmartInspectionMatch | null>;
  smartMatchLoadingByKey?: Record<string, boolean>;
  onAcceptSmartMatch?: (sectionIndex: number, itemIndex: number) => void;
  onDismissSmartMatch?: (sectionIndex: number, itemIndex: number) => void;

  // ✅ keep DB/session shape strict: qty is number
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


type SmartInspectionMatch = {
  id: string;
  label: string;
  complaint?: string | null;
  correction?: string | null;
  laborHours?: number | null;
  parts?: Array<{ name: string; qty?: number }>;
  score?: number | null;
  confidence?: number | null;
  menuItemId?: string | null;
  menuRepairItemId?: string | null;
  pricingStatus?: "fresh" | "stale" | "expired";
  pricingValidUntil?: string | null;
  acceptedCount?: number | null;
  acceptanceRate?: number | null;
};

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
      // ✅ allow "blank" qty behavior by storing 0 (UI will render as empty)
      qty: typeof p?.qty === "number" && Number.isFinite(p.qty) ? p.qty : 0,
    }))
    // ✅ keep draft rows even if qty is 0
    .filter((p) => p.description.length > 0 || p.qty >= 0);
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

function smartPricingText(
  status: "fresh" | "stale" | "expired" | undefined,
): string {
  if (status === "fresh") return "Fresh pricing — safe for auto-add.";
  if (status === "stale") return "Stale pricing — review before add.";
  return "Expired pricing — auto-add blocked until pricing is refreshed.";
}

function smartPricingBadgeClass(
  status: "fresh" | "stale" | "expired" | undefined,
): string {
  if (status === "fresh") {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "stale") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border-red-500/40 bg-red-500/10 text-red-200";
}

export default function SectionDisplay(props: SectionDisplayProps) {
    const {
    title,
    section,
    sectionIndex,
    showNotes = false,
    showPhotos = true,
    inspectionId,
    workOrderId,
    workOrderLineId,
    onUpdateStatus,
    onUpdateNote,
    onUpload,
    requireNoteForAI,
    onSubmitAI,
    isSubmittingAI,
    smartMatchByKey,
    smartMatchLoadingByKey,
    onAcceptSmartMatch,
    onDismissSmartMatch,
    onUpdateParts,
    onUpdateLaborHours,
    isCollapsed,
    onToggleCollapse,
  } = props;

  const items = (section.items ?? []) as ItemExtended[];

  // ✅ never rely on callers passing title correctly
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

  // ✅ derive stats every render (NO memo)
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

  // ✅ Qty filler state (string) so it can be blank until typed
  const [qtyDraftByKey, setQtyDraftByKey] = useState<Record<string, string>>(
    {},
  );

  const setPartsOpen = (k: string, v: boolean) =>
    setPartsOpenByKey((p) => ({ ...p, [k]: v }));
  const setEditing = (k: string, v: boolean) =>
    setEditByKey((p) => ({ ...p, [k]: v }));

  const setQtyDraft = (k: string, v: string) =>
    setQtyDraftByKey((p) => ({ ...p, [k]: v }));

  const clearQtyDraftPrefix = (prefix: string) => {
    setQtyDraftByKey((prev) => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(prefix)) next[k] = v;
      }
      return next;
    });
  };

  return (
    <Card className="mb-6 px-4 py-3 md:px-5 md:py-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-card-border,#334155)] pb-3">
        {gridSection ? (
          <div className="text-left text-base font-semibold tracking-[0.08em] text-[var(--theme-text-primary,#E2E8F0)] transition-opacity hover:opacity-80 md:text-lg">
            {resolvedTitle}
          </div>
        ) : (
          <button
            onClick={toggleOpen}
            className="text-left text-base font-semibold tracking-[0.08em] text-[var(--theme-text-primary,#E2E8F0)] transition-opacity hover:opacity-80 md:text-lg"
            aria-expanded={open}
            type="button"
          >
            {resolvedTitle}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden items-center gap-1.5 md:flex">
            <StatusBadge variant="success">{stats.ok} OK</StatusBadge>
            <StatusBadge variant="danger">{stats.fail} FAIL</StatusBadge>
            <StatusBadge variant="info">{stats.na} NA</StatusBadge>
            <StatusBadge variant="warning">{stats.recommend} REC</StatusBadge>
            <StatusBadge variant="neutral">{stats.unset} Open</StatusBadge>
          </div>

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
              {/* Desktop header row — desktop only */}
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

                  const smartMatch = props.smartMatchByKey?.[k] ?? null;
                  const smartMatchLoading =
                    props.smartMatchLoadingByKey?.[k] ?? false;
                  const pricingText = smartPricingText(
                    smartMatch?.pricingStatus,
                  );
                  const pricingBadgeClass = smartPricingBadgeClass(
                    smartMatch?.pricingStatus,
                  );

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
                        workOrderId={workOrderId}
                        workOrderLineId={workOrderLineId}
                        onUpdateStatus={onUpdateStatus}
                        onUpdateNote={onUpdateNote}
                        onUpload={onUpload}
                        variant="row"
                      />

                      {(() => {
                        const smartKey = `${sectionIndex}:${itemIndex}`;
                        const match = smartMatchByKey?.[smartKey] ?? null;
                        const loadingMatch = smartMatchLoadingByKey?.[smartKey] ?? false;

                        if (!isFailOrRec) return null;
                        if (loadingMatch) {
                          return (
                            <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-950/20 px-3 py-2 text-[11px] text-sky-200">
                              Checking smart repair match...
                            </div>
                          );
                        }

                        if (!match) return null;

                        const canAutoAdd = match.pricingStatus === "fresh";
                        const statusText = pricingStatusText(match.pricingStatus);
                        const actionText =
                          match.pricingStatus === "fresh"
                            ? "Auto-add eligible"
                            : match.pricingStatus === "stale"
                              ? "Review recommended"
                              : "Auto-add blocked";

                        return (
                          <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-neutral-100">
                                  Suggested repair: {match.label}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${pricingStatusClass(
                                      match.pricingStatus,
                                    )}`}
                                  >
                                    {statusText}
                                  </span>
                                  <span className="text-[10px] text-neutral-400">
                                    {actionText}
                                  </span>
                                  {match.pricingValidUntil ? (
                                    <span className="text-[10px] text-neutral-500">
                                      Valid until {new Date(match.pricingValidUntil).toLocaleDateString()}
                                    </span>
                                  ) : null}
                                </div>
                                {match.correction ? (
                                  <div className="mt-2 text-[11px] text-neutral-300">
                                    {match.correction}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-white/5"
                                  onClick={() => onDismissSmartMatch?.(sectionIndex, itemIndex)}
                                >
                                  Dismiss
                                </button>
                                <button
                                  type="button"
                                  disabled={!canAutoAdd}
                                  className={[
                                    "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                    canAutoAdd
                                      ? "border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/30"
                                      : "cursor-not-allowed border border-red-500/20 bg-red-950/20 text-red-200/70",
                                  ].join(" ")}
                                  onClick={() => {
                                    if (canAutoAdd) {
                                      onAcceptSmartMatch?.(sectionIndex, itemIndex);
                                    }
                                  }}
                                >
                                  {canAutoAdd ? "Add matched repair" : "Pricing review required"}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

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
                          const nextIdx = currentParts.length;
                          const draftKey = `${k}:part:${nextIdx}:qty`;
                          setQtyDraft(draftKey, ""); // ✅ blank filler
                          handlePartsChange([...currentParts, { description: "", qty: 0 }]);
                        };

                        const updatePart = (idx: number, patch: Partial<PartRow>) => {
                          const next = currentParts.map((p, i) =>
                            i === idx ? { ...p, ...patch } : p,
                          );
                          handlePartsChange(next);
                        };

                        const removePart = (idx: number) => {
                          const next = currentParts.filter((_, i) => i !== idx);
                          // clear drafts for this item (cheap + avoids stale)
                          clearQtyDraftPrefix(`${k}:part:`);
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
                                  {currentParts.map((p, pIdx) => {
                                    const qtyKey = `${k}:part:${pIdx}:qty`;
                                    const draft = qtyDraftByKey[qtyKey];

                                    // ✅ if user hasn't typed, show blank when qty is 0
                                    const displayQty =
                                      typeof draft === "string"
                                        ? draft
                                        : p.qty > 0
                                          ? String(p.qty)
                                          : "";

                                    return (
                                      <div
                                        key={pIdx}
                                        className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-2"
                                      >
                                        <input
                                          disabled={lockInputs}
                                          className={[
                                            "min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500",
                                            "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60",
                                            lockInputs
                                              ? "opacity-60 cursor-not-allowed"
                                              : "",
                                          ].join(" ")}
                                          placeholder="Part description"
                                          value={p.description}
                                          onChange={(e) =>
                                            updatePart(pIdx, {
                                              description: e.target.value,
                                            })
                                          }
                                        />

                                        {/* ✅ Qty filler (blank until typed) */}
                                        <input
                                          disabled={lockInputs}
                                          className={[
                                            "w-16 rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-[11px] text-white placeholder:text-neutral-500",
                                            "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/60",
                                            lockInputs
                                              ? "opacity-60 cursor-not-allowed"
                                              : "",
                                          ].join(" ")}
                                          placeholder="Qty"
                                          inputMode="numeric"
                                          type="number"
                                          min={0}
                                          step={1}
                                          value={displayQty}
                                          onChange={(e) => {
                                            const raw = e.target.value;

                                            // keep the typed string so it can be blank
                                            setQtyDraft(qtyKey, raw);

                                            if (raw === "") {
                                              // ✅ blank qty => store 0 (no default)
                                              updatePart(pIdx, { qty: 0 });
                                              return;
                                            }

                                            const n = Number(raw);
                                            if (!Number.isFinite(n)) {
                                              updatePart(pIdx, { qty: 0 });
                                              return;
                                            }

                                            updatePart(pIdx, {
                                              qty: Math.max(0, Math.floor(n)),
                                            });
                                          }}
                                          onBlur={() => {
                                            // If user typed a number, you can drop draft and rely on qty.
                                            // If blank, keep draft "" so placeholder behavior remains.
                                            const raw = qtyDraftByKey[qtyKey];
                                            if (raw && raw.trim() !== "") {
                                              setQtyDraft(qtyKey, "");
                                              setQtyDraftByKey((prev) => {
                                                const next = { ...prev };
                                                delete next[qtyKey];
                                                return next;
                                              });
                                            }
                                          }}
                                        />

                                        <button
                                          type="button"
                                          className={[
                                            "text-[11px] text-red-300 hover:text-red-200",
                                            lockInputs
                                              ? "opacity-40 pointer-events-none"
                                              : "",
                                          ].join(" ")}
                                          onClick={() => removePart(pIdx)}
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    );
                                  })}

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
                                      lockInputs
                                        ? "opacity-60 cursor-not-allowed"
                                        : "",
                                    ].join(" ")}
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
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {(smartMatchLoading || smartMatch) && isFailOrRec && note.length > 0 ? (
                        <div className="mt-2 rounded-lg border border-white/10 bg-black/25 p-3">
                          {smartMatchLoading ? (
                            <div className="text-[11px] text-neutral-400">
                              Checking smart match…
                            </div>
                          ) : smartMatch ? (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200">
                                  {typeof smartMatch.confidence === "number"
                                    ? `Confidence ${Math.round(smartMatch.confidence * 100)}%`
                                    : "Smart match"}
                                </span>

                                {typeof smartMatch.acceptanceRate === "number" ? (
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-neutral-300">
                                    Win rate {Math.round(smartMatch.acceptanceRate * 100)}%
                                  </span>
                                ) : null}

                                {typeof smartMatch.acceptedCount === "number" ? (
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-neutral-300">
                                    Accepted {smartMatch.acceptedCount}
                                  </span>
                                ) : null}

                                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${pricingBadgeClass}`}>
                                  {smartMatch.pricingStatus ?? "expired"}
                                </span>
                              </div>

                              <div className="mt-2 text-[12px] font-semibold text-neutral-100">
                                {smartMatch.label}
                              </div>

                              {smartMatch.correction ? (
                                <div className="mt-1 text-[11px] text-neutral-400">
                                  {smartMatch.correction}
                                </div>
                              ) : null}

                              <div className="mt-2 text-[11px] text-neutral-400">
                                {pricingText}
                              </div>

                              <div className="mt-1 text-[11px] text-neutral-500">
                                Pricing valid until: {smartMatch.pricingValidUntil ?? "No active pricing snapshot"}
                              </div>

                              <div className="mt-3 flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="px-3"
                                  onClick={() =>
                                    props.onDismissSmartMatch?.(sectionIndex, itemIndex)
                                  }
                                >
                                  Dismiss
                                </Button>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="px-3"
                                  disabled={!props.onAcceptSmartMatch}
                                  onClick={() =>
                                    props.onAcceptSmartMatch?.(sectionIndex, itemIndex)
                                  }
                                >
                                  {smartMatch.pricingStatus === "fresh"
                                    ? "Add matched repair"
                                    : "Review match"}
                                </Button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      ) : null}

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
                                  onClick={() =>
                                    onSubmitAI?.(sectionIndex, itemIndex)
                                  }
                                >
                                  {submitting
                                    ? "Submitting…"
                                    : "Submit for estimate"}
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
                                  onClick={() =>
                                    onSubmitAI?.(sectionIndex, itemIndex)
                                  }
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
    </Card>
  );
}
