"use client";
import Link from "next/link";

export default function HomeButton() {
  return (
    <Link href="/dashboard" className="group inline-flex items-center gap-2">
      <div
        className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 transition
                   group-hover:shadow-[0_0_0_2px_rgba(251,146,60,0.35),0_0_20px_rgba(251,146,60,0.25)]
                   group-active:scale-95"
        aria-label="Home"
        title="Home"
      >
        <span className="text-base">🏠</span>
      </div>
      <span className="hidden text-xs text-white/80 sm:inline">Home</span>
    </Link>
  );
}
