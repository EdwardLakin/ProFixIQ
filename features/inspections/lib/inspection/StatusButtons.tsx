//features/inspections/lib/inspection/StatusButtons.tsx

"use client";

import type React from "react";
import type {
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

type StatusButtonsProps = {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  updateItem: (
    sectionIndex: number,
    itemIndex: number,
    updates: Partial<InspectionItem>,
  ) => void;
  onStatusChange: (status: InspectionItemStatus) => void;

  /**
   * Optional UI tweaks:
   * - compact: tighter buttons for dense lists
   * - wrap: allow wrapping (default true). Set false to keep single-line.
   */
  compact?: boolean;
  wrap?: boolean;
};

/**
 * Glassy, metallic status pills with clear status colors:
 * - OK        → green
 * - FAIL      → red
 * - RECOMMEND → amber
 * - N/A       → blue
 *
 * Updated to reduce height/scroll:
 * - Buttons are smaller by default (still readable)
 * - Uses gap instead of mr/mb (cleaner wrapping)
 * - Supports compact mode
 */
export default function StatusButtons(_props: StatusButtonsProps) {
  const {
    item,
    sectionIndex,
    itemIndex,
    updateItem,
    onStatusChange,
    compact = false,
    wrap = true,
  } = _props as StatusButtonsProps;

  const selected = item.status;

  const size = compact
    ? "h-8 px-2.5 text-[10px]"
    : "h-9 px-3 text-[11px]";

  const container = wrap
    ? "mt-1 grid grid-cols-4 gap-1"
    : "mt-1 flex items-center gap-1 overflow-x-auto";

  const base =
    "inline-flex min-w-0 items-center justify-center rounded-lg " +
    size +
    " " +
    "select-none " +
    "font-semibold uppercase tracking-[0.16em] " +
    "border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] text-[color:var(--theme-text-primary)] " +
    "transition-colors duration-150 " +
    "focus:outline-none focus:ring-2 focus:ring-[rgba(184,115,51,0.55)] " + // copper focus ring
    "focus:ring-offset-2 focus:ring-offset-[color:var(--theme-surface-page)]";

  const cls = (key: InspectionItemStatus) => {
    const isSel = selected === key;

    switch (key) {
      case "ok": {
        const selectedClasses =
          " border-emerald-400/80 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100";
        const hover =
          " hover:border-emerald-400/80 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-950/35 dark:hover:text-emerald-100";
        return base + hover + (isSel ? " " + selectedClasses : "");
      }

      case "fail": {
        const selectedClasses =
          " border-red-400/80 bg-red-50 text-red-800 dark:bg-red-950/45 dark:text-red-100";
        const hover =
          " hover:border-red-400/80 hover:bg-red-50 hover:text-red-800 dark:hover:bg-red-950/35 dark:hover:text-red-100";
        return base + hover + (isSel ? " " + selectedClasses : "");
      }

      case "recommend": {
        const selectedClasses =
          " border-amber-400/80 bg-amber-50 text-amber-900 dark:bg-amber-950/45 dark:text-amber-100";
        const hover =
          " hover:border-amber-400/80 hover:bg-amber-50 hover:text-amber-900 dark:hover:bg-amber-950/35 dark:hover:text-amber-100";
        return base + hover + (isSel ? " " + selectedClasses : "");
      }

      case "na":
      default: {
        const selectedClasses =
          " border-sky-400/80 bg-sky-50 text-sky-800 dark:bg-sky-950/45 dark:text-sky-100";
        const hover =
          " hover:border-sky-400/80 hover:bg-sky-50 hover:text-sky-800 dark:hover:bg-sky-950/35 dark:hover:text-sky-100";
        return base + hover + (isSel ? " " + selectedClasses : "");
      }
    }
  };

  const choose = (status: InspectionItemStatus) => {
    updateItem(sectionIndex, itemIndex, { status });
    onStatusChange(status);
  };

  const keyActivate = (
    status: InspectionItemStatus,
    e: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(status);
    }
  };

  return (
    <div className={container}>
      <button
        type="button"
        tabIndex={0}
        className={cls("ok")}
        onClick={() => choose("ok")}
        onKeyDown={(e) => keyActivate("ok", e)}
        aria-pressed={selected === "ok"}
        title="Mark OK"
      >
        OK
      </button>

      <button
        type="button"
        tabIndex={0}
        className={cls("fail")}
        onClick={() => choose("fail")}
        onKeyDown={(e) => keyActivate("fail", e)}
        aria-pressed={selected === "fail"}
        title="Mark FAIL"
      >
        Fail
      </button>

      <button
        type="button"
        tabIndex={0}
        className={cls("recommend")}
        onClick={() => choose("recommend")}
        onKeyDown={(e) => keyActivate("recommend", e)}
        aria-pressed={selected === "recommend"}
        title="Mark Recommend"
      >
        Rec
      </button>

      <button
        type="button"
        tabIndex={0}
        className={cls("na")}
        onClick={() => choose("na")}
        onKeyDown={(e) => keyActivate("na", e)}
        aria-pressed={selected === "na"}
        title="Mark N/A"
      >
        N/A
      </button>
    </div>
  );
}
