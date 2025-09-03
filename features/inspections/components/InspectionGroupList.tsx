// features/inspections/components/InspectionGroupList.tsx
"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import type {
  InspectionCategory,
  InspectionItem,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

type Props = {
  categories: InspectionCategory[];
  editable?: boolean;
  onChange?: (next: InspectionCategory[]) => void;
};

export default function InspectionGroupList({
  categories,
  editable = false,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleStatus = (
    sIdx: number,
    iIdx: number,
    status: InspectionItemStatus,
  ) => {
    if (!onChange) return;
    const next: InspectionCategory[] = categories.map(
      (sec: InspectionCategory, si: number): InspectionCategory =>
        si === sIdx
          ? {
              ...sec,
              items: sec.items.map(
                (it: InspectionItem, ii: number): InspectionItem =>
                  ii === iIdx ? { ...it, status } : it,
              ),
            }
          : sec,
    );
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {categories.map((section: InspectionCategory, sIdx: number) => (
        <div
          key={section.title}
          className="overflow-hidden rounded-md border border-zinc-700 bg-zinc-900"
        >
          <button
            onClick={() => toggleSection(section.title)}
            className="flex w-full items-center justify-between bg-zinc-800 px-4 py-3 text-left transition-colors hover:bg-zinc-700"
          >
            <span className="font-semibold text-orange-400">
              {section.title}
            </span>
            {expanded[section.title] ? (
              <ChevronDownIcon className="h-5 w-5 text-orange-400" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-orange-400" />
            )}
          </button>

          {expanded[section.title] && (
            <ul className="space-y-3 bg-zinc-900 px-4 py-3">
              {section.items.map((item: InspectionItem, iIdx: number) => (
                <li
                  key={`${section.title}-${iIdx}`}
                  className="flex items-center justify-between border-b border-zinc-700 pb-2"
                >
                  <span className="text-white">{item.item ?? item.name}</span>

                  {editable && (
                    <div className="flex space-x-2">
                      <button
                        className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
                        onClick={() => handleStatus(sIdx, iIdx, "ok")}
                      >
                        OK
                      </button>
                      <button
                        className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
                        onClick={() => handleStatus(sIdx, iIdx, "fail")}
                      >
                        Fail
                      </button>
                      <button
                        className="rounded bg-yellow-500 px-3 py-1 text-xs text-white hover:bg-yellow-600"
                        onClick={() => handleStatus(sIdx, iIdx, "na")}
                      >
                        N/A
                      </button>
                      <button
                        className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600"
                        onClick={() => handleStatus(sIdx, iIdx, "recommend")}
                      >
                        Rec
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}