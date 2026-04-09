"use client";

import type { ReactNode } from "react";
import { EyeOff, GripVertical } from "lucide-react";
import Card from "@shared/components/ui/Card";
import { cn } from "@shared/lib/utils";

type DashboardWidgetShellProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  compact?: boolean;
  className?: string;
  contentClassName?: string;
  scrollClassName?: string;

  editing?: boolean;
  onHide?: () => void;
};

export default function DashboardWidgetShell({
  eyebrow,
  title,
  subtitle,
  description,
  rightSlot,
  children,
  compact = false,
  className,
  contentClassName,
  scrollClassName,
  editing = false,
  onHide,
}: DashboardWidgetShellProps) {
  const bodyText = subtitle ?? description;

  return (
    <Card
      className={cn(
        "h-full min-h-0 overflow-hidden",
        compact ? "px-4 py-4" : "px-5 py-5",
        className,
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                {eyebrow}
              </div>
            ) : null}

            <h2 className="mt-1 text-base font-semibold text-white sm:text-lg">
              {title}
            </h2>

            {bodyText ? (
              <p className="mt-1 max-w-2xl text-xs text-neutral-400 sm:text-sm">
                {bodyText}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}

            {editing ? (
              <div
                className="pfq-widget-drag-handle inline-flex h-8 w-8 cursor-move items-center justify-center rounded-md border border-white/10 bg-black/25 text-neutral-300"
                title="Drag widget"
              >
                <GripVertical className="h-4 w-4" />
              </div>
            ) : null}

            {editing && onHide ? (
              <button
                type="button"
                onClick={onHide}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-black/25 text-neutral-300 transition hover:text-white"
                title="Hide widget"
              >
                <EyeOff className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className={cn("mt-4 min-h-0 flex-1 overflow-hidden", contentClassName)}>
          <div
            className={cn(
              "pfq-widget-shell h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pr-1",
              scrollClassName,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}
