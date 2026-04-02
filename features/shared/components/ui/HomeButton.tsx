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
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5",
        "font-semibold text-neutral-200 backdrop-blur-sm transition",
        "hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:bg-black/40",
        className,
      )}
    >
      <ArrowLeftIcon className="h-5 w-5" />
      <span>Home</span>
    </button>
  );
}
