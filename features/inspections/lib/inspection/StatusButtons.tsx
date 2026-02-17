// features/inspections/lib/inspection/StatusButtons.tsx
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
 * Clean premium status pills:
 * - OK        → emerald
 * - FAIL      → red
 * - RECOMMEND → amber
 * - N/A       → sky
 *
 * No `any`. Uses stronger contrast + crisp borders (less “grey blob”).
 */
export default function StatusButtons(props: StatusButtonsProps) {
  const {
    item,
    sectionIndex,
    itemIndex,
    updateItem,
    onStatusChange,
    compact = false,
    wrap = true,
  } = props;

  const selected = (String(item.status ?? "").toLowerCase() ||
    "") as InspectionItemStatus;

  const size = compact ? "h-7 px-2.5 text-[10px]" : "h-8 px-3 text-[11px]";

  const container = wrap
    ? "mt-1 flex flex-wrap items-center gap-2"
    : "mt-1 flex items-center gap-2 overflow-x-auto";

  // “premium”: darker base, clearer border, subtle highlight line, crisp hover lift
  const base =
    "group relative inline-flex items-center justify-center rounded-md " +
    size +
    " select-none font-semibold uppercase tracking-[0.16em] " +
    "border border-white/14 bg-black/55 text-neutral-200 " +
    "shadow-[0_8px_16px_rgba(0,0,0,0.55)] " +
    "transition duration-150 " +
    "focus:outline-none focus:ring-2 focus:ring-[rgba(197,122,74,0.55)] " +
    "focus:ring-offset-2 focus:ring-offset-black " +
    "before:absolute before:inset-x-0 before:top-0 before:h-px before:content-[''] before:bg-white/10 " +
    "hover:-translate-y-[1px] hover:border-white/22 hover:bg-black/62 hover:shadow-[0_12px_22px_rgba(0,0,0,0.65)]";

  const cls = (key: InspectionItemStatus) => {
    const isSel = selected === key;

    const selBase =
      " ring-1 ring-inset ring-white/10 " +
      "shadow-[0_12px_22px_rgba(0,0,0,0.70)]";

    switch (key) {
      case "ok": {
        const sel =
          selBase +
          " border-emerald-400/80 text-emerald-50 " +
          "bg-emerald-950/40 ring-emerald-400/35";
        const hover =
          " hover:border-emerald-400/55 hover:text-emerald-100 hover:bg-emerald-950/35";
        return base + hover + (isSel ? " " + sel : "");
      }

      case "fail": {
        const sel =
          selBase +
          " border-red-500/80 text-red-50 " +
          "bg-red-950/45 ring-red-500/35";
        const hover =
          " hover:border-red-500/55 hover:text-red-100 hover:bg-red-950/40";
        return base + hover + (isSel ? " " + sel : "");
      }

      case "recommend": {
        const sel =
          selBase +
          " border-amber-400/80 text-amber-50 " +
          "bg-amber-950/40 ring-amber-400/35";
        const hover =
          " hover:border-amber-400/55 hover:text-amber-100 hover:bg-amber-950/35";
        return base + hover + (isSel ? " " + sel : "");
      }

      case "na":
      default: {
        const sel =
          selBase +
          " border-sky-400/80 text-sky-50 " +
          "bg-sky-950/40 ring-sky-400/35";
        const hover =
          " hover:border-sky-400/55 hover:text-sky-100 hover:bg-sky-950/35";
        return base + hover + (isSel ? " " + sel : "");
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