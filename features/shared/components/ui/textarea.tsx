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
          "w-full min-h-[100px] border px-4 py-2 text-sm backdrop-blur-sm",
          "rounded-[var(--theme-radius-md)]",
          "border-[var(--theme-border-soft)] bg-[var(--theme-input-bg)]",
          "text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--theme-ring)] focus:border-[var(--brand-primary)]",
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
