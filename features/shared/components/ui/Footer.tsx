"use client";

import React from "react";
import { cn } from "@shared/lib/utils";

export default function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full text-center py-6 md:py-8 px-4 border-t border-neutral-800",
        "bg-black/30 backdrop-blur-md text-neutral-400 text-sm transition-all",
        "hover:text-white hover:shadow-inner hover:bg-black/50",
        className,
      )}
    >
      <p className="font-mono tracking-wide text-xs sm:text-sm">
        © {new Date().getFullYear()}{" "}
        <span className="text-orange-400 font-semibold">ProFixIQ</span>. Built
        for pros, powered by AI.
      </p>
    </footer>
  );
}
