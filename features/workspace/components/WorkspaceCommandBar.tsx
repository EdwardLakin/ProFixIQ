import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";

export type WorkspaceCommandBarProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
};

export function WorkspaceCommandBar({
  ariaLabel,
  children,
  className,
}: WorkspaceCommandBarProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex flex-wrap gap-2", className)}
    >
      {children}
    </nav>
  );
}
