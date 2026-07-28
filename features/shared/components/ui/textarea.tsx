"use client";

import * as React from "react";
import { clsx } from "clsx";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={clsx(
          "w-full min-h-[100px] rounded-[var(--theme-radius-md,0.5rem)] border px-4 py-2 text-sm",
          "border-[color:var(--theme-input-border,var(--theme-border-soft))]",
          "bg-[color:var(--theme-input-bg,var(--theme-surface-page))]",
          "text-[color:var(--theme-input-text,var(--theme-text-primary))]",
          "placeholder:text-[color:var(--theme-text-muted)] placeholder:opacity-100",
          "backdrop-blur-sm",
          "focus:outline-none focus:ring-2",
          "focus:ring-[color:var(--brand-primary,#1747FF)]",
          "focus:border-[color:var(--brand-accent,#0BB7FF)]",
          "transition duration-200",
          "disabled:cursor-not-allowed disabled:bg-[color:var(--theme-surface-subtle)] disabled:text-[color:var(--theme-text-secondary)] disabled:opacity-100",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";

export { Textarea };
