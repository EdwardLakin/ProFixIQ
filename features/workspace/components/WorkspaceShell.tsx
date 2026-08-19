import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";

export type WorkspaceShellProps = {
  children: ReactNode;
  className?: string;
};

export function WorkspaceShell({
  children,
  className,
}: WorkspaceShellProps) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 text-[color:var(--theme-text-primary)] sm:px-6 sm:py-6 lg:px-8",
        className,
      )}
    >
      {children}
    </main>
  );
}
