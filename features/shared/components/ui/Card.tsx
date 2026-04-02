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
        "bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.05),rgba(0,0,0,0.82))]",
        "backdrop-blur-md px-6 py-5 shadow-card transition duration-200",
        onClick
          ? "cursor-pointer hover:-translate-y-[1px] hover:border-[color:var(--accent-copper-soft,#fdba74)] hover:shadow-[0_0_20px_rgba(192,132,70,0.42)]"
          : "",
        className,
      )}
    >
      {children}
    </div>
  );
}
