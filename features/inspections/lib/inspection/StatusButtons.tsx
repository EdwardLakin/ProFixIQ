"use client";

import type { InspectionItem, InspectionItemStatus } from "@inspections/lib/inspection/types";

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
 * Accept `any` at export boundary to avoid Next.js ts(71007) in client files,
 * then cast immediately to strong types.
 */
export default function StatusButtons(_props: any) {
  const {
    item,
    sectionIndex,
    itemIndex,
    updateItem,
    onStatusChange,
  } = _props as StatusButtonsProps;

  const base =
    "px-3 py-1 rounded text-xs font-bold mr-2 mb-2 transition-colors duration-150 " +
    "bg-zinc-700 text-zinc-200 hover:bg-zinc-600 focus:outline-none " +
    "focus:ring-2 focus:ring-offset-1 focus:ring-zinc-400"; // focus style for non-selected

  const selected = item.status;

  // Persistent ring when selected (not just focus)
  const cls = (key: InspectionItemStatus) => {
    const isSel = selected === key;
    switch (key) {
      case "ok":
        return (
          base +
          (isSel
            ? " bg-green-600 text-white ring-2 ring-offset-1 ring-green-400"
            : " focus:ring-green-300")
        );
      case "fail":
        return (
          base +
          (isSel
            ? " bg-red-600 text-white ring-2 ring-offset-1 ring-red-400"
            : " focus:ring-red-300")
        );
      case "recommend":
        return (
          base +
          (isSel
            ? " bg-yellow-400 text-black ring-2 ring-offset-1 ring-yellow-300"
            : " focus:ring-yellow-300")
        );
      case "na":
      default:
        return (
          base +
          (isSel
            ? " bg-blue-600 text-white ring-2 ring-offset-1 ring-blue-400"
            : " focus:ring-blue-300")
        );
    }
  };

  const choose = (status: InspectionItemStatus) => {
    updateItem(sectionIndex, itemIndex, { status });
    onStatusChange(status);
  };

  const keyActivate = (status: InspectionItemStatus, e: React.KeyboardEvent<HTMLButtonElement>) => {
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
        FAIL
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