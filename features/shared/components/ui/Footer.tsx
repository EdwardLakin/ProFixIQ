"use client";

import { cn } from "@shared/lib/utils";

export default function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full text-center py-8 px-4 border-t border-white/10",
        "bg-black/25 backdrop-blur-xl text-neutral-400 text-sm transition-all",
        "hover:text-white",
        className,
      )}
    >
      <p className="font-mono tracking-wide text-xs sm:text-sm">
        © {new Date().getFullYear()}{" "}
        <span
          className="font-semibold"
          style={{ color: "var(--accent-copper-light)" }}
        >
          ProFixIQ
        </span>
        . Built for pros, powered by AI.
      </p>
    </footer>
  );
}