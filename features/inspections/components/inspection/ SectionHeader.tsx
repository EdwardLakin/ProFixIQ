// features/inspections/components/inspection/SectionHeader.tsx
"use client";

import { useId } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

export interface SectionHeaderProps {
  /** Main title shown in the header */
  title?: string;
  /** Optional smaller line under/next to the title */
  subtitle?: string | null;
  /** Section index (0-based). If provided, displays “Section N” */
  section?: number;
  /** Collapsed state owner-controlled */
  isCollapsed: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Optional item count badge (e.g., how many checks) */
  count?: number;
  /** Optional content aligned to the right (buttons, status chips, etc.) */
  right?: React.ReactNode;
  /** Make the header sticky while scrolling */
  sticky?: boolean;
  /** ID used for aria-controls; auto-generates if omitted */
  panelId?: string;
  className?: string;
}

export default function SectionHeader({
  title,
  subtitle,
  section,
  isCollapsed,
  onToggle,
  count,
  right,
  sticky = true,
  panelId,
  className,
}: SectionHeaderProps) {
  const uid = useId();
  const controlsId = panelId ?? `inspection-panel-${uid}`;

  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-3 py-2 border-b border-neutral-700/80 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/50",
        sticky && "sticky top-0 z-20",
        className
      )}
    >
      {/* Left: section label */}
      {typeof section === "number" && (
        <span className="text-xs uppercase tracking-wide text-neutral-400 shrink-0">
          Section {section + 1}
        </span>
      )}

      {/* Title & subtitle */}
      <div className="min-w-0 flex-1">
        {title && (
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-semibold text-white truncate">
              {title}
            </h2>
            {typeof count === "number" && (
              <span className="inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full bg-orange-600/90 text-white">
                {count}
              </span>
            )}
          </div>
        )}
        {subtitle && (
          <p className="text-xs text-neutral-400 truncate">{subtitle}</p>
        )}
      </div>

      {/* Right-side actions (optional) */}
      {right && <div className="hidden sm:flex items-center gap-2">{right}</div>}

      {/* Toggle button */}
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          "ml-1 inline-flex items-center justify-center rounded-md p-1.5",
          "text-neutral-300 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-orange-500/60"
        )}
        aria-expanded={!isCollapsed}
        aria-controls={controlsId}
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