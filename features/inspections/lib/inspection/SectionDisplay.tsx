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
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import {
  pricingStatusClass,
  pricingStatusText,
} from "@/features/menu-repair-items/lib/pricingStatus";

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
  draftKey?: string;

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

  onUpdateNoPartsRequired?: (
    sectionIndex: number,
    itemIndex: number,
    noPartsRequired: boolean,
  ) => void;

  /** Optional external collapse control (used by sticky header). */
  isCollapsed?: boolean;
  onToggleCollapse?: (sectionIndex: number) => void;

  /** Render canonical status, notes, photos, parts and labor below a compact grid. */
  showGridFindings?: boolean;
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
  noPartsRequired?: boolean;
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
  return (
    v
      .map((p) => ({
        description: typeof p?.description === "string" ? p.description : "",
        // ✅ allow "blank" qty behavior by storing 0 (UI will render as empty)
        qty: typeof p?.qty === "number" && Number.isFinite(p.qty) ? p.qty : 0,
      }))
      // ✅ keep draft rows even if qty is 0
      .filter((p) => p.description.length > 0 || p.qty >= 0)
  );
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
  if (status === "fresh") return "Fresh pricing — ready to apply.";
  if (status === "stale")
    return "Stale pricing — pricing review required after apply.";
  return "Expired pricing — pricing review required after apply.";
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
    draftKey,
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
    onUpdateNoPartsRequired,
    isCollapsed,
    onToggleCollapse,
    showGridFindings = false,
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
    typeof onUpdateLaborHours === "function" ||
    typeof onUpdateNoPartsRequired === "function";

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
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-card-border,var(--theme-border-soft))] pb-4">
        {gridSection ? (
          <div>
            <div className="text-left text-lg font-semibold tracking-[-0.02em] text-[var(--theme-text-primary,var(--theme-text-primary))] md:text-xl">
              {showGridFindings ? "Findings & evidence" : resolvedTitle}
            </div>
            {showGridFindings ? (
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                Status, notes, photos, parts and labor saved on the same inspection items as the measurements above.
              </p>
            ) : null}
          </div>
        ) : (
          <button
            onClick={toggleOpen}
            className="text-left text-lg font-semibold tracking-[-0.02em] text-[var(--theme-text-primary,var(--theme-text-primary))] transition-opacity hover:opacity-80 md:text-xl"
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
                className="h-7 border-emerald-500/35 bg-emerald-50 px-2 text-[11px] text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/25 dark:text-emerald-200"
                onClick={() => markAll("ok")}
                type="button"
              >
                All OK
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-red-500/30 px-2 text-[11px] text-red-700 hover:bg-red-50 dark:text-red-200 dark:hover:bg-red-950/25"
                onClick={() => markAll("fail")}
                type="button"
              >
                All FAIL
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-sky-500/30 px-2 text-[11px] text-sky-700 hover:bg-sky-50 dark:text-sky-200 dark:hover:bg-sky-950/25"
                onClick={() => markAll("na")}
                type="button"
              >
                All NA
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-amber-500/35 px-2 text-[11px] text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/25"
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
          {gridSection && !showGridFindings ? (
            <div />
          ) : (
            <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)]">
              {/* Desktop header row — desktop only */}
              <div className="hidden border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2.5 lg:block">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                    Item · Status · Notes
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                    Item · Status · Notes
                  </div>
                </div>
              </div>

              {/* Mobile/Tablet: 1 col. Desktop: 2-up on lg+ */}
              <div
                className={[
                  "grid gap-2 p-2.5",
                  "lg:grid-cols-2 lg:gap-3 lg:p-3",
                  "[&>*]:rounded-xl",
                  "[&>*]:border [&>*]:border-[color:var(--theme-border-soft)]",
                  "[&>*]:bg-[color:var(--theme-surface-panel-strong)]",
                  "[&>*]:relative [&>*]:overflow-hidden",
                  "[&>*]:transition [&>*]:duration-150",
                  "[&>*]:hover:border-[color:var(--theme-border-strong)]",
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

                  const rail = isFail
                    ? "before:bg-red-500/70"
                    : isRec
                      ? "before:bg-orange-500/70"
                      : "before:bg-[color:var(--theme-surface-subtle)]";

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
                        "relative px-3 py-3.5",
                        isFailOrRec ? "lg:col-span-2" : "",
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
                        draftKey={draftKey}
                        onUpdateStatus={onUpdateStatus}
                        onUpdateNote={onUpdateNote}
                        onUpload={onUpload}
                        variant="row"
                      />

                      {(() => {
                        const smartKey = `${sectionIndex}:${itemIndex}`;
                        const match = smartMatchByKey?.[smartKey] ?? null;
                        const loadingMatch =
                          smartMatchLoadingByKey?.[smartKey] ?? false;

                        if (!isFailOrRec) return null;
                        if (loadingMatch) {
                          return (
                            <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-950/20 px-3 py-2 text-[11px] text-sky-200">
                              Checking smart repair match...
                            </div>
                          );
                        }

                        if (!match) return null;

                        const canApplyRepair = Boolean(onAcceptSmartMatch);
                        const statusText = pricingStatusText(
                          match.pricingStatus,
                        );
                        const actionText =
                          match.pricingStatus === "fresh"
                            ? "Ready to apply"
                            : "Pricing review required";

                        return (
                          <div className="mt-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-[color:var(--theme-text-primary)]">
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
                                  <span className="text-[10px] text-[color:var(--theme-text-secondary)]">
                                    {actionText}
                                  </span>
                                  {match.pricingValidUntil ? (
                                    <span className="text-[10px] text-[color:var(--theme-text-muted)]">
                                      Valid until{" "}
                                      {new Date(
                                        match.pricingValidUntil,
                                      ).toLocaleDateString()}
                                    </span>
                                  ) : null}
                                </div>
                                {match.correction ? (
                                  <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                                    {match.correction}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
                                  onClick={() =>
                                    onDismissSmartMatch?.(
                                      sectionIndex,
                                      itemIndex,
                                    )
                                  }
                                >
                                  Dismiss
                                </button>
                                <button
                                  type="button"
                                  disabled={!canApplyRepair}
                                  className={[
                                    "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                                    canApplyRepair
                                      ? "border border-emerald-500/40 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-900/30"
                                      : "cursor-not-allowed border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-secondary)]",
                                  ].join(" ")}
                                  onClick={() => {
                                    onAcceptSmartMatch?.(
                                      sectionIndex,
                                      itemIndex,
                                    );
                                  }}
                                >
                                  Apply repair
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
                        const noPartsRequired = item.noPartsRequired === true;

                        const handlePartsChange = (parts: PartRow[]) => {
                          onUpdateParts?.(sectionIndex, itemIndex, parts);
                          if (
                            parts.some(
                              (part) =>
                                part.description.trim().length > 0 || part.qty > 0,
                            )
                          ) {
                            onUpdateNoPartsRequired?.(
                              sectionIndex,
                              itemIndex,
                              false,
                            );
                          }
                        };

                        const handleNoPartsRequiredChange = (checked: boolean) => {
                          if (checked) {
                            clearQtyDraftPrefix(`${k}:part:`);
                            onUpdateParts?.(sectionIndex, itemIndex, []);
                          }
                          onUpdateNoPartsRequired?.(
                            sectionIndex,
                            itemIndex,
                            checked,
                          );
                        };

                        const handleLaborChange = (hours: number | null) => {
                          onUpdateLaborHours?.(sectionIndex, itemIndex, hours);
                        };

                        const addEmptyPart = () => {
                          const nextIdx = currentParts.length;
                          const draftKey = `${k}:part:${nextIdx}:qty`;
                          setQtyDraft(draftKey, ""); // ✅ blank filler
                          handlePartsChange([
                            ...currentParts,
                            { description: "", qty: 0 },
                          ]);
                        };

                        const updatePart = (
                          idx: number,
                          patch: Partial<PartRow>,
                        ) => {
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
                          <div className="mt-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-semibold text-[color:var(--theme-text-primary)]">
                                  Parts &amp; Labor
                                </span>

                                {submitted && (
                                  <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                                    Submitted
                                  </span>
                                )}

                                {submittedStamp && (
                                  <span className="text-[10px] text-[color:var(--theme-text-muted)]">
                                    {new Date(submittedStamp).toLocaleString()}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {submitted && (
                                  <>
                                    <button
                                      type="button"
                                      className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                                      onClick={() =>
                                        setPartsOpen(k, !partsOpen)
                                      }
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
                                        className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
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

                            <label className="mb-2 flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-[11px] font-semibold text-[color:var(--theme-text-primary)]">
                              <input
                                type="checkbox"
                                checked={noPartsRequired}
                                disabled={lockInputs}
                                onChange={(event) =>
                                  handleNoPartsRequiredChange(
                                    event.currentTarget.checked,
                                  )
                                }
                                className="h-4 w-4 rounded border-[color:var(--theme-border-soft)] accent-[var(--brand-primary,#C1663B)]"
                              />
                              <span>
                                No parts required
                                <span className="ml-2 font-normal text-[color:var(--theme-text-muted)]">
                                  Blank parts also skip Parts workflow.
                                </span>
                              </span>
                            </label>

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
                                        className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-2"
                                      >
                                        <input
                                          disabled={lockInputs}
                                          className={[
                                            "min-w-0 flex-1 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-1 text-[11px] text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]",
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
                                            "w-16 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-1 text-[11px] text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]",
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
                                    disabled={lockInputs || noPartsRequired}
                                    onClick={addEmptyPart}
                                    className={[
                                      "mt-1 inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-primary)]",
                                      "hover:border-accent/80 hover:text-accent",
                                      lockInputs || noPartsRequired
                                        ? "opacity-50 cursor-not-allowed hover:border-[color:var(--theme-border-soft)] hover:text-[color:var(--theme-text-primary)]"
                                        : "",
                                    ].join(" ")}
                                  >
                                    + Add Part
                                  </button>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <span className="text-[11px] text-[color:var(--theme-text-secondary)]">
                                    Labor hours
                                  </span>
                                  <input
                                    disabled={lockInputs}
                                    className={[
                                      "w-20 rounded-md border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-1 text-[11px] text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]",
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
                                  <span className="text-[10px] text-[color:var(--theme-text-muted)]">
                                    (rate + pricing handled later)
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {(smartMatchLoading || smartMatch) &&
                      isFailOrRec &&
                      note.length > 0 ? (
                        <div className="mt-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                          {smartMatchLoading ? (
                            <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
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

                                {typeof smartMatch.acceptanceRate ===
                                "number" ? (
                                  <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                                    Win rate{" "}
                                    {Math.round(
                                      smartMatch.acceptanceRate * 100,
                                    )}
                                    %
                                  </span>
                                ) : null}

                                {typeof smartMatch.acceptedCount ===
                                "number" ? (
                                  <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                                    Accepted {smartMatch.acceptedCount}
                                  </span>
                                ) : null}

                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] ${pricingBadgeClass}`}
                                >
                                  {smartMatch.pricingStatus ?? "expired"}
                                </span>
                              </div>

                              <div className="mt-2 text-[12px] font-semibold text-[color:var(--theme-text-primary)]">
                                {smartMatch.label}
                              </div>

                              {smartMatch.correction ? (
                                <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
                                  {smartMatch.correction}
                                </div>
                              ) : null}

                              <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                                {pricingText}
                              </div>

                              <div className="mt-1 text-[11px] text-[color:var(--theme-text-muted)]">
                                Pricing valid until:{" "}
                                {smartMatch.pricingValidUntil ??
                                  "No active pricing snapshot"}
                              </div>

                              <div className="mt-3 flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="px-3"
                                  onClick={() =>
                                    props.onDismissSmartMatch?.(
                                      sectionIndex,
                                      itemIndex,
                                    )
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
                                    props.onAcceptSmartMatch?.(
                                      sectionIndex,
                                      itemIndex,
                                    )
                                  }
                                >
                                  Apply repair
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
    </div>
  );
}
