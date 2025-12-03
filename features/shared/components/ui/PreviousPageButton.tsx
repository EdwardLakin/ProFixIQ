// @shared/components/ui/PreviousPageButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

type PreviousPageButtonProps = {
  /**
   * Optional explicit target.
   * If omitted, will try history.back(), with a safe fallback list route.
   */
  to?: string;
  label?: string;
  className?: string;
};

const baseClasses =
  "inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-950/70 px-3 py-1.5 text-xs font-medium text-neutral-200 shadow-sm hover:border-neutral-500 hover:bg-neutral-900/80 transition-colors";

export default function PreviousPageButton({
  to,
  label = "Back",
  className = "",
}: PreviousPageButtonProps) {
  const router = useRouter();

  const handleClick = React.useCallback(() => {
    // If an explicit target is provided, respect it.
    if (to) {
      router.push(to);
      return;
    }

    // Otherwise, try to go back in history first.
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        router.back();
        return;
      }

      // No history: choose a sensible fallback based on current path.
      const pathname = window.location.pathname || "";
      const fallback = pathname.startsWith("/mobile")
        ? "/mobile/work-orders"
        : "/work-orders";

      router.push(fallback);
    }
  }, [router, to]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseClasses} ${className}`.trim()}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}