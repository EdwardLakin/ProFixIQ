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
        "rounded-2xl border border-white/5 bg-background/40 backdrop-blur-md px-6 py-5 shadow-sm transition",
        "hover:border-white/10 hover:bg-background/60",
        onClick ? "cursor-pointer" : "",
        className
      )}
    >
      {children}
    </div>
  );
}