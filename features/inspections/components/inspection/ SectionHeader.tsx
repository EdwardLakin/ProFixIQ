// components/inspection/SectionHeader.tsx

import { useState } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface SectionHeaderProps {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
}

const SectionHeader = ({
  title,
  isCollapsed,
  onToggle,
}: SectionHeaderProps) => {
  return (
    <div className="sticky top-0 z-10 bg-black bg-opacity-80 backdrop-blur border-b border-gray-700 p-3 flex items-center justify-between text-white font-bold text-lg">
      <span>{title}</span>
      <button
        onClick={onToggle}
        className="text-white hover:text-orange-400 transition"
      >
        {isCollapsed ? (
          <ChevronDownIcon className="h-5 w-5" />
        ) : (
          <ChevronUpIcon className="h-5 w-5" />
        )}
      </button>
    </div>
  );
};

export default SectionHeader;
