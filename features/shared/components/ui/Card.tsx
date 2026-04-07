"use client";

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
        "rounded-[var(--theme-radius-xl,1rem)] border px-6 py-5 backdrop-blur-md transition duration-200",
        "border-[var(--theme-card-border,#334155)]",
        "bg-[var(--theme-card-bg,#111827)]",
        "text-[var(--theme-text-primary,#FFFFFF)]",
        "shadow-[var(--theme-shadow-medium,0_18px_45px_rgba(0,0,0,0.45))]",
        onClick
          ? "cursor-pointer hover:-translate-y-[1px] hover:brightness-105"
          : "",
        className,
      )}
    >
      {children}
    </div>
  );
}
