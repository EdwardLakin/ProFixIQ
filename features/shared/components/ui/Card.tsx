// shared/components/Card.tsx
"use client";

import React from "react";
import { cn } from "@shared/lib/utils";

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export default function Card({ children, onClick, className }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-white/8 bg-black/30",
        "backdrop-blur-md px-6 py-5 shadow-card transition",
        "hover:border-accent/70 hover:shadow-glow hover:-translate-y-[1px]",
        onClick ? "cursor-pointer" : "",
        className,
      )}
    >
      {children}
    </div>
  );
}