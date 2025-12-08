// shared/components/Card.tsx
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
        "rounded-2xl border border-white/10 bg-black/40",
        "backdrop-blur-md px-6 py-5 shadow-card transition",
        "hover:border-accent/80 hover:shadow-[0_0_18px_rgba(192,132,70,0.55)] hover:-translate-y-[1px]",
        onClick ? "cursor-pointer" : "",
        className,
      )}
    >
      {children}
    </div>
  );
}