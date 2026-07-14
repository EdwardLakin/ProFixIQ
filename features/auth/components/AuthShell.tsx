"use client";

import type { ReactNode } from "react";
import { cn } from "@/features/shared/lib/utils";

type AuthShellProps = {
  children: ReactNode;
  viewportClassName?: string;
  cardClassName?: string;
};

export default function AuthShell({
  children,
  viewportClassName,
  cardClassName,
}: AuthShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen min-h-[100dvh] px-4 py-[clamp(1rem,3.5vh,2.5rem)] text-foreground bg-background bg-[var(--theme-gradient-panel)]",
        viewportClassName,
      )}
    >
      <div className="mx-auto flex min-h-[calc(100dvh-clamp(2rem,7vh,5rem))] w-full max-w-5xl items-center justify-center">
        <div
          className={cn(
            "var(--theme-gradient-panel)",
            cardClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
