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
          "border-[var(--theme-input-border,var(--theme-border-soft))]",
          "bg-[var(--theme-input-bg,var(--theme-surface-page))]",
          "text-[var(--theme-input-text,var(--theme-text-inverse))]",
          "placeholder:text-[var(--theme-text-secondary,var(--theme-text-muted))]",
          "backdrop-blur-sm",
          "focus:outline-none focus:ring-2",
          "focus:ring-[var(--brand-primary,#C97A3D)]",
          "focus:border-[var(--brand-accent,#E2A164)]",
          "transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";

export { Textarea };
