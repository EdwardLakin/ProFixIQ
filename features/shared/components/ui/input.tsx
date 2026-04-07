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
          "h-10 w-full border px-3 py-2 text-sm backdrop-blur-sm",
          "rounded-[var(--theme-radius-md)]",
          "border-[var(--theme-border-soft)] bg-[var(--theme-input-bg)]",
          "text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-[var(--theme-ring)] focus:border-[var(--brand-primary)]",
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
