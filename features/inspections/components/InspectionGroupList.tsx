// features/inspections/components/InspectionGroupList.tsx
"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import type { InspectionCategory } from "@inspections/lib/inspection/masterInspectionList";

export type InspectionGroupListProps = {
  categories: InspectionCategory[];
  editable?: boolean;
  onChange?: (next: InspectionCategory[]) => void;
};

export default function InspectionGroupList({
  categories,
  editable = false,
  onChange,
}: InspectionGroupListProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (title: string) =>
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));

  const emit = (next: InspectionCategory[]) => onChange?.(next);

  return (
    <div className="space-y-4">
      {categories.map((section) => (
        <div
          key={section.title}
          className="overflow-hidden rounded-md border border-zinc-700 bg-zinc-900"
        >
          <button
            onClick={() => toggle(section.title)}
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
              {section.items.map((item, idx) => (
                <li
                  key={`${section.title}-${idx}`}
                  className="flex items-center justify-between border-b border-zinc-700 pb-2"
                >
                  <span className="text-white">{item.item}</span>

                  {editable && (
                    <div className="flex space-x-2">
                      <button className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">
                        OK
                      </button>
                      <button className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700">
                        Fail
                      </button>
                      <button className="rounded bg-yellow-500 px-3 py-1 text-xs text-white hover:bg-yellow-600">
                        N/A
                      </button>
                      <button className="rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600">
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