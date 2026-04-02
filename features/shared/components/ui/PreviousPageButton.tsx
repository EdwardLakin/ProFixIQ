// @shared/components/ui/PreviousPageButton.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@shared/lib/utils";

type PreviousPageButtonProps = {
  to?: string;
  label?: string;
  className?: string;
};

const baseClasses =
  "inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-neutral-200 shadow-sm backdrop-blur-sm transition " +
  "hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-black/40";

export default function PreviousPageButton({
  to,
  label = "Back",
  className = "",
}: PreviousPageButtonProps) {
  const router = useRouter();

  const handleClick = React.useCallback(() => {
    if (to) {
      router.push(to);
      return;
    }

    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        router.back();
        return;
      }

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
      className={cn(baseClasses, className)}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
