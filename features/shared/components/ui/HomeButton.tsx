// shared/components/HomeButton.tsx (path as in your code)
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
      onClick={() => router.push("/")}
      className={cn(
        "flex items-center gap-2 font-semibold transition-all duration-200",
        "text-accent hover:text-accent/80 hover:scale-105",
        className,
      )}
    >
      <ArrowLeftIcon className="h-5 w-5" />
      <span>Home</span>
    </button>
  );
}