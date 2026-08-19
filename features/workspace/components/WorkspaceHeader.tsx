import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";
import { WORKSPACE_PANEL } from "@/features/workspace/components/workspaceStyles";

export type WorkspaceHeaderProps = {
  children: ReactNode;
  className?: string;
};

export function WorkspaceHeader({
  children,
  className,
}: WorkspaceHeaderProps) {
  return (
    <header
      className={cn(
        WORKSPACE_PANEL,
        "sticky top-2 z-20 overflow-hidden p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </header>
  );
}
