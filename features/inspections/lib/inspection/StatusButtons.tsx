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
 * NOTE:
 * To avoid Next.js ts(71007) “Props must be serializable…” in Client files,
 * accept `any` at the export boundary and cast immediately to a strong type.
 */
export default function StatusButtons(_props: any) {
  const {
    item,
    sectionIndex,
    itemIndex,
    updateItem,
    onStatusChange,
  } = _props as StatusButtonsProps;

  // grey-until-selected
  const base = "px-3 py-1 rounded font-bold text-white mr-2 mb-2 transition duration-200";
  const selected = item.status;

  const getStyle = (key: InspectionItemStatus) => {
    switch (key) {
      case "fail":
        return `${base} ${selected === "fail" ? "bg-red-600" : "bg-red-400"}`;
      case "recommend":
        return `${base} ${selected === "recommend" ? "bg-yellow-600 text-black" : "bg-yellow-400 text-black"}`;
      case "ok":
        return `${base} ${selected === "ok" ? "bg-green-600" : "bg-green-400"}`;
      case "na":
      default:
        return `${base} ${selected === "na" ? "bg-gray-600" : "bg-gray-400"}`;
    }
  };

  const handleClick = (status: InspectionItemStatus) => {
    updateItem(sectionIndex, itemIndex, { status });
    onStatusChange(status);
  };

  return (
    <div className="flex flex-wrap mt-2">
      <button className={getStyle("ok")} onClick={() => handleClick("ok")} aria-pressed={selected === "ok"}>
        OK
      </button>
      <button className={getStyle("fail")} onClick={() => handleClick("fail")} aria-pressed={selected === "fail"}>
        FAIL
      </button>
      <button
        className={getStyle("recommend")}
        onClick={() => handleClick("recommend")}
        aria-pressed={selected === "recommend"}
      >
        Recommend
      </button>
      <button className={getStyle("na")} onClick={() => handleClick("na")} aria-pressed={selected === "na"}>
        N/A
      </button>
    </div>
  );
}