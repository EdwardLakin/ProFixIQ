import { InspectionItem, InspectionItemStatus } from "@inspections/lib/inspection/types";

interface StatusButtonsProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  updateItem: (
    sectionIndex: number,
    itemIndex: number,
    updates: Partial<InspectionItem>,
  ) => void;
  onStatusChange: (status: InspectionItemStatus) => void;
}

export default function StatusButtons({
  item,
  sectionIndex,
  itemIndex,
  updateItem,
  onStatusChange,
}: StatusButtonsProps) {
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
    // Use both callbacks so they’re not “unused” and state updates propagate
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