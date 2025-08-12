"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/solid";
import type { InspectionCategory } from "@inspections/lib/inspection/masterInspectionList";

interface Props {
  categories: InspectionCategory[];
  editable?: boolean;
}

export default function InspectionGroupList({
  categories,
  editable = false,
}: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleSection = (title: string) => {
    setExpanded((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <div className="space-y-4">
      {categories.map((section) => (
        <div
          key={section.title}
          className="bg-zinc-900 border border-zinc-700 rounded-md overflow-hidden"
        >
          <button
            onClick={() => toggleSection(section.title)}
            className="w-full flex items-center justify-between px-4 py-3 text-left bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            <span className="text-orange-400 font-semibold">
              {section.title}
            </span>
            {expanded[section.title] ? (
              <ChevronDownIcon className="w-5 h-5 text-orange-400" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-orange-400" />
            )}
          </button>

          {expanded[section.title] && (
            <ul className="px-4 py-3 space-y-3 bg-zinc-900">
              {section.items.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between border-b border-zinc-700 pb-2"
                >
                  <span className="text-white">{item.item}</span>
                  {editable && (
                    <div className="flex space-x-2">
                      <button className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs">
                        OK
                      </button>
                      <button className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs">
                        Fail
                      </button>
                      <button className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-xs">
                        N/A
                      </button>
                      <button className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-xs">
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
