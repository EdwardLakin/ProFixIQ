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
        "border px-6 py-5 backdrop-blur-md transition duration-200",
        "rounded-[var(--theme-radius-xl)]",
        "border-[var(--theme-border-soft)]",
        "bg-[var(--panel-bg)]",
        "text-[var(--theme-text-primary)]",
        "shadow-[0_18px_45px_rgba(0,0,0,0.45),0_0_20px_var(--theme-glow)]",
        onClick
          ? "cursor-pointer hover:-translate-y-[1px] hover:border-[var(--brand-accent)] hover:shadow-[0_18px_45px_rgba(0,0,0,0.45),0_0_24px_var(--theme-glow)]"
          : "",
        className,
      )}
    >
      {children}
    </div>
  );
}
