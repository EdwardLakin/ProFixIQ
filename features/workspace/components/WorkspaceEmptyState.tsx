import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";
import { WORKSPACE_ITEM } from "@/features/workspace/components/workspaceStyles";

export type WorkspaceEmptyStateProps = {
  children: ReactNode;
  className?: string;
};

export function WorkspaceEmptyState({
  children,
  className,
}: WorkspaceEmptyStateProps) {
  return (
    <p
      className={cn(
        WORKSPACE_ITEM,
        "px-4 py-5 text-sm text-[color:var(--theme-text-muted)]",
        className,
      )}
    >
      {children}
    </p>
  );
}
