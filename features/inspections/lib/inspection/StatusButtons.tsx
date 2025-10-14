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

  // Neutral pill; selected state adds a colored ring (outline)
  const base =
    "px-3 py-1 rounded text-xs font-bold mr-2 mb-2 transition-colors duration-150 " +
    "bg-zinc-700 text-zinc-200 hover:bg-zinc-600 focus:outline-none active:brightness-110 active:scale-[.98]";

  const ringFor = (key: InspectionItemStatus) => {
    const isSel = item.status === key;
    if (!isSel) return "";
    switch (key) {
      case "ok":
        return " ring-2 ring-green-500 ring-offset-2 ring-offset-zinc-900";
      case "fail":
        return " ring-2 ring-red-500 ring-offset-2 ring-offset-zinc-900";
      case "recommend":
        return " ring-2 ring-yellow-400 ring-offset-2 ring-offset-zinc-900";
      case "na":
      default:
        return " ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-900";
    }
  };

  const cls = (key: InspectionItemStatus) => base + ringFor(key);

  const handleClick = (status: InspectionItemStatus) => {
    updateItem(sectionIndex, itemIndex, { status });
    onStatusChange(status);
  };

  return (
    <div className="mt-2 flex flex-wrap">
      <button
        className={cls("ok")}
        onClick={() => handleClick("ok")}
        aria-pressed={item.status === "ok"}
        title="Mark OK"
      >
        OK
      </button>
      <button
        className={cls("fail")}
        onClick={() => handleClick("fail")}
        aria-pressed={item.status === "fail"}
        title="Mark FAIL"
      >
        FAIL
      </button>
      <button
        className={cls("recommend")}
        onClick={() => handleClick("recommend")}
        aria-pressed={item.status === "recommend"}
        title="Mark Recommend"
      >
        Recommend
      </button>
      <button
        className={cls("na")}
        onClick={() => handleClick("na")}
        aria-pressed={item.status === "na"}
        title="Mark N/A"
      >
        N/A
      </button>
    </div>
  );
}