import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";

export type WorkspaceTimelineProps = {
  children: ReactNode;
  className?: string;
};

export function WorkspaceTimeline({
  children,
  className,
}: WorkspaceTimelineProps) {
  return <ol className={cn("space-y-3", className)}>{children}</ol>;
}

export type WorkspaceTimelineItemProps = {
  children: ReactNode;
  className?: string;
};

export function WorkspaceTimelineItem({
  children,
  className,
}: WorkspaceTimelineItemProps) {
  return (
    <li
      className={cn(
        "relative pl-7 before:absolute before:left-[7px] before:top-3 before:h-full before:w-px before:bg-[color:var(--theme-border-soft)] last:before:hidden",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-2 h-[15px] w-[15px] rounded-full border-2 border-[color:var(--accent-copper-soft,#fdba74)] bg-[color:var(--theme-surface-page)]"
      />
      {children}
    </li>
  );
}
