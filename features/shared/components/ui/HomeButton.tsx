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
        "text-orange-400 hover:text-orange-300 transition-all duration-200",
        "flex items-center gap-2 font-semibold hover:scale-105",
        className,
      )}
    >
      <ArrowLeftIcon className="w-5 h-5" />
      <span>Home</span>
    </button>
  );
}
