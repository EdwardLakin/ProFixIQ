import type { ReactNode } from "react";

import { cn } from "@/features/shared/lib/utils";

export type WorkspaceShellProps = {
  children: ReactNode;
  className?: string;
  layout?: "contained" | "embedded";
};

export function WorkspaceShell({
  children,
  className,
  layout = "contained",
}: WorkspaceShellProps) {
  return (
    <main
      className={cn(
        "flex w-full flex-col text-[color:var(--theme-text-primary)]",
        layout === "contained"
          ? "mx-auto max-w-7xl gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8"
          : "mx-0 max-w-none gap-0 p-0",
        className,
      )}
    >
      {children}
    </main>
  );
}
