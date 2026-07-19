"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { resolveMobileHref } from "@/features/mobile/navigation/mobile-route-continuity";
import { cn } from "@shared/lib/utils";

type PreviousPageButtonProps = {
  to?: string;
  label?: string;
  className?: string;
};

const baseClasses =
  "inline-flex items-center gap-1 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-xs font-medium text-[color:var(--theme-text-primary)] shadow-sm backdrop-blur-sm transition " +
  "hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-[color:var(--theme-surface-inset)]";

export default function PreviousPageButton({
  to,
  label = "Back",
  className = "",
}: PreviousPageButtonProps) {
  const router = useRouter();

  const handleClick = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const mobileSurface = window.location.pathname.startsWith("/mobile");

    if (to) {
      router.push(
        mobileSurface ? resolveMobileHref(to) ?? "/mobile" : to,
      );
      return;
    }

    // A mobile Back button must never depend on browser history because a PWA,
    // notification, old desktop tab, or copied URL can put a desktop route
    // immediately behind the current page.
    if (mobileSurface) {
      router.push("/mobile/work-orders");
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/work-orders");
  }, [router, to]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(baseClasses, className)}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
