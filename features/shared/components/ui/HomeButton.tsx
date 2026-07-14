// shared/components/HomeButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";
import { cn } from "@shared/lib/utils";

interface HomeButtonProps {
  className?: string;
}

export default function HomeButton({ className }: HomeButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push("/")}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5",
        "font-semibold text-[color:var(--theme-text-primary)] backdrop-blur-sm transition",
        "hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-[color:var(--theme-surface-inset)]",
        className,
      )}
    >
      <ArrowLeftIcon className="h-5 w-5" />
      <span>Home</span>
    </button>
  );
}
