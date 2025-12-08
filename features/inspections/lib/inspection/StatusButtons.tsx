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
};

/**
 * Glassy, metallic status pills:
 * - thin borders
 * - burnt copper accent
 * - border + text color change on select
 */
export default function StatusButtons(_props: any) {
  const {
    item,
    sectionIndex,
    itemIndex,
    updateItem,
    onStatusChange,
  } = _props as StatusButtonsProps;

  const selected = item.status;

  const base =
    "inline-flex items-center justify-center px-3 py-1 rounded-md " +
    "text-[11px] font-semibold tracking-[0.16em] uppercase mr-2 mb-2 " +
    "border border-white/15 bg-black/30 text-neutral-200 " +
    "backdrop-blur-sm transition-colors duration-150 " +
    "focus:outline-none focus:ring-2 focus:ring-[rgba(184,115,51,0.55)] " +
    "focus:ring-offset-2 focus:ring-offset-black";

  const cls = (key: InspectionItemStatus) => {
    const isSel = selected === key;

    const copperBorder = "border-[rgba(184,115,51,0.85)]";
    const copperText = "text-[rgb(255,248,240)]";
    const copperGlow = "shadow-[0_0_0_1px_rgba(184,115,51,0.75)]";

    switch (key) {
      case "ok":
        return (
          base +
          " hover:border-[rgba(184,115,51,0.75)] hover:text-[rgb(255,252,245)]" +
          (isSel
            ? ` ${copperBorder} ${copperText} ${copperGlow} bg-[rgba(184,115,51,0.10)]`
            : "")
        );

      case "fail":
        return (
          base +
          " hover:border-red-500/80 hover:text-red-200" +
          (isSel
            ? " border-red-500/80 text-red-100 bg-red-950/40 shadow-[0_0_0_1px_rgba(248,113,113,0.7)]"
            : "")
        );

      case "recommend":
        return (
          base +
          " hover:border-amber-400/80 hover:text-amber-100" +
          (isSel
            ? " border-amber-400/80 text-amber-50 bg-amber-950/30 shadow-[0_0_0_1px_rgba(251,191,36,0.7)]"
            : "")
        );

      case "na":
      default:
        return (
          base +
          " hover:border-neutral-400/70 hover:text-neutral-100" +
          (isSel
            ? " border-neutral-400/80 text-neutral-50 bg-neutral-900/60 shadow-[0_0_0_1px_rgba(163,163,163,0.7)]"
            : "")
        );
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
    <div className="mt-2 flex flex-wrap">
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
        Recommend
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