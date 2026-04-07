import * as React from "react";
import { cn } from "@shared/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-10 w-full rounded-[var(--theme-radius-md,0.5rem)] border px-3 py-2 text-sm",
          "border-[var(--theme-input-border,#334155)]",
          "bg-[var(--theme-input-bg,#0B1220)]",
          "text-[var(--theme-input-text,#FFFFFF)]",
          "placeholder:text-[var(--theme-text-secondary,#94A3B8)]",
          "backdrop-blur-sm",
          "focus:outline-none focus:ring-2",
          "focus:ring-[var(--brand-primary,#C97A3D)]",
          "focus:border-[var(--brand-accent,#E2A164)]",
          "transition-all duration-200 ease-in-out",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
