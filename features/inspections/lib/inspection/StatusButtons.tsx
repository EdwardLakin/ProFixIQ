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
export default function StatusButtons(_props: any) {
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
    ? "h-7 px-2.5 text-[10px]"
    : "h-8 px-3 text-[11px]";

  const container = wrap
    ? "mt-1 flex flex-wrap items-center gap-2"
    : "mt-1 flex items-center gap-2 overflow-x-auto";

  const base =
    "inline-flex items-center justify-center rounded-md " +
    size +
    " " +
    "select-none " +
    "font-semibold uppercase tracking-[0.16em] " +
    "border border-white/15 bg-black/30 text-neutral-200 " +
    "backdrop-blur-sm transition-colors duration-150 " +
    "focus:outline-none focus:ring-2 focus:ring-[rgba(184,115,51,0.55)] " + // copper focus ring
    "focus:ring-offset-2 focus:ring-offset-black";

  const cls = (key: InspectionItemStatus) => {
    const isSel = selected === key;

    switch (key) {
      case "ok": {
        const selectedClasses =
          " border-emerald-400/90 text-emerald-50 " +
          "bg-emerald-900/40 shadow-[0_0_0_1px_rgba(52,211,153,0.7)]";
        const hover =
          " hover:border-emerald-400/80 hover:text-emerald-100 hover:bg-emerald-900/30";
        return base + hover + (isSel ? " " + selectedClasses : "");
      }

      case "fail": {
        const selectedClasses =
          " border-red-500/90 text-red-50 " +
          "bg-red-950/50 shadow-[0_0_0_1px_rgba(248,113,113,0.8)]";
        const hover =
          " hover:border-red-500/80 hover:text-red-100 hover:bg-red-950/40";
        return base + hover + (isSel ? " " + selectedClasses : "");
      }

      case "recommend": {
        const selectedClasses =
          " border-amber-400/90 text-amber-50 " +
          "bg-amber-950/40 shadow-[0_0_0_1px_rgba(251,191,36,0.85)]";
        const hover =
          " hover:border-amber-400/80 hover:text-amber-100 hover:bg-amber-950/30";
        return base + hover + (isSel ? " " + selectedClasses : "");
      }

      case "na":
      default: {
        const selectedClasses =
          " border-sky-400/90 text-sky-50 " +
          "bg-sky-950/40 shadow-[0_0_0_1px_rgba(56,189,248,0.8)]";
        const hover =
          " hover:border-sky-400/80 hover:text-sky-100 hover:bg-sky-950/30";
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