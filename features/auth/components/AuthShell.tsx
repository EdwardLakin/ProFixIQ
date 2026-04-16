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
        "min-h-screen min-h-[100dvh] px-4 py-[clamp(1rem,3.5vh,2.5rem)] text-foreground bg-background bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]",
        viewportClassName,
      )}
    >
      <div className="mx-auto flex min-h-[calc(100dvh-clamp(2rem,7vh,5rem))] w-full max-w-5xl items-center justify-center">
        <div
          className={cn(
            "w-full max-w-[42rem] rounded-3xl border border-[color:var(--metal-border-soft,#1f2937)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_60%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.98),#020617_82%)] px-5 py-6 shadow-[0_32px_80px_rgba(0,0,0,0.95)] sm:px-7 sm:py-7 lg:px-8 lg:py-8",
            cardClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
