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
          "w-full min-h-[100px] rounded-md border px-4 py-2 text-sm text-white",
          "border-white/10 bg-black/30 backdrop-blur-sm",
          "placeholder:text-neutral-500",
          "focus:outline-none focus:ring-2 focus:ring-[rgba(184,115,51,0.45)] focus:border-[color:var(--accent-copper-soft,#fdba74)]",
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
