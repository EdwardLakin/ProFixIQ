import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";
import {
  WORKSPACE_EYEBROW,
  WORKSPACE_PANEL,
} from "@/features/workspace/components/workspaceStyles";

export type WorkspaceSectionProps = {
  headingId: string;
  eyebrow: string;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function WorkspaceSection({
  headingId,
  eyebrow,
  title,
  summary,
  children,
  className,
}: WorkspaceSectionProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn(WORKSPACE_PANEL, "p-4 sm:p-5", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className={WORKSPACE_EYEBROW}>{eyebrow}</p>
          <h2 id={headingId} className="mt-1 text-xl font-bold">
            {title}
          </h2>
        </div>
        {summary != null ? (
          <p className="text-xs text-[color:var(--theme-text-muted)]">
            {summary}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
