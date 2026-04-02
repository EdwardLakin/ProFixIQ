"use client";

import type { ReactNode } from "react";
import { cn } from "@shared/lib/utils";

type StatusBadgeVariant =
  | "neutral"
  | "info"
  | "active"
  | "warning"
  | "success"
  | "danger";

type StatusBadgeSize = "sm" | "md";

type StatusBadgeProps = {
  children: ReactNode;
  variant?: StatusBadgeVariant;
  size?: StatusBadgeSize;
  className?: string;
};

const variantClasses: Record<StatusBadgeVariant, string> = {
  neutral: "border-white/10 bg-white/5 text-neutral-100",
  info: "border-slate-400/40 bg-slate-400/10 text-slate-100",
  active:
    "border-[color:var(--accent-copper-soft,#fdba74)]/70 bg-[color:var(--accent-copper,#f97316)]/15 text-[color:var(--accent-copper-light,#fdba74)]",
  warning: "border-amber-400/60 bg-amber-400/10 text-amber-100",
  success: "border-emerald-400/60 bg-emerald-400/10 text-emerald-100",
  danger: "border-rose-400/60 bg-rose-400/10 text-rose-100",
};

const sizeClasses: Record<StatusBadgeSize, string> = {
  sm: "px-2.5 py-1 text-[10px]",
  md: "px-3 py-1.5 text-[11px]",
};

export default function StatusBadge({
  children,
  variant = "neutral",
  size = "sm",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold uppercase leading-none tracking-[0.18em]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
