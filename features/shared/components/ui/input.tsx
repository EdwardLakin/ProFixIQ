import * as React from "react";
import { cn } from "@/features/shared/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-10 w-full rounded-[var(--theme-radius-md,0.5rem)] border px-3 py-2 text-sm",
          "border-[color:var(--desktop-border,var(--theme-input-border,var(--theme-border-soft)))]",
          "bg-[color:var(--theme-input-bg,var(--theme-surface-inset))]",
          "text-[color:var(--theme-input-text,var(--theme-text-primary))]",
          "placeholder:text-[color:var(--theme-text-muted)] placeholder:opacity-100",
          "backdrop-blur-sm",
          "focus:outline-none focus:ring-2",
          "focus:ring-[var(--desktop-focus-ring,var(--brand-primary,#1747FF))]",
          "focus:border-[color:color-mix(in_srgb,var(--brand-primary,#1747FF)_66%,#60a5fa)]",
          "transition-all duration-200 ease-in-out",
          "disabled:cursor-not-allowed disabled:bg-[color:var(--theme-surface-subtle)] disabled:text-[color:var(--theme-text-secondary)] disabled:opacity-100",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
