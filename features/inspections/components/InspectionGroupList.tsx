// features/inspections/components/InspectionGroupList.tsx
"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import type { InspectionCategory } from "@inspections/lib/inspection/masterInspectionList";

type Props = {
  categories: InspectionCategory[];
  editable?: boolean;
  // optional: parent can be notified when the list changes (reorder, edit, etc.)
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

  // helper if/when you add edits later (rename items/sections, etc.)
  const emit = (next: InspectionCategory[]) => onChange?.(next);

  return (
    <div className="space-y-4">
      {categories.map((section, sIdx) => (
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
              {section.items.map((item, iIdx) => (
                <li
                  key={iIdx}
                  className="flex items-center justify-between border-b border-zinc-700 pb-2"
                >
                  <span className="text-white">{item.item}</span>

                  {editable && (
                    <div className="flex space-x-2">
                      {/* Buttons are presentational for now.
                          When you add editing, clone categories -> emit(next) */}
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