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
  neutral:
    "border-[var(--theme-card-border,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--theme-surface-2,var(--theme-surface-page))_84%,transparent)] text-[var(--theme-text-secondary,var(--theme-text-muted))]",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  active:
    "border-sky-400/60 bg-sky-500/10 text-sky-100",
  warning: "border-amber-500/60 bg-amber-500/10 text-amber-200",
  success: "border-emerald-500/60 bg-emerald-500/10 text-emerald-200",
  danger: "border-rose-500/60 bg-rose-500/10 text-rose-200",
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
