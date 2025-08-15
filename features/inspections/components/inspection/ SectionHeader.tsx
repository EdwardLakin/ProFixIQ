// features/inspections/components/inspection/SectionHeader.tsx
"use client";

import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface SectionHeaderProps {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
  section?: number;
}

export default function SectionHeader({
  title,
  isCollapsed,
  onToggle,
  section,
}: SectionHeaderProps) {
  return (
    <div className="sticky top-2 z-10 bg-black/80 backdrop-blur border-b border-gray-700 p-3 flex items-center justify-between">
      <span className="text-sm">{section != null ? `Section ${section + 1}` : ""}</span>
      <button
        onClick={onToggle}
        className="text-white hover:text-orange-400 transition"
        aria-label={isCollapsed ? "Expand section" : "Collapse section"}
      >
        {isCollapsed ? (
          <ChevronDownIcon className="h-5 w-5" />
        ) : (
          <ChevronUpIcon className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}